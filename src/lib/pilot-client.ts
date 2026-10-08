// Loaded after idle. No third-party scripts, URL collection or data-layer payloads.
const VERSION = "1.1.0-2026-10-08";
export function hasPilotClientConsent() {
  try {
    const raw = document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith("fakturo_consent="));
    const consent = JSON.parse(decodeURIComponent(raw?.slice("fakturo_consent=".length) || "null"));
    return consent?.version === VERSION && consent.analytics === true;
  } catch { return false; }
}
let visitPromise: Promise<boolean> | null = null;

export function ensurePilotVisit(): Promise<boolean> {
  if (!hasPilotClientConsent()) return Promise.resolve(false);
  if (!visitPromise) {
    visitPromise = fetch("/api/pilot/events", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: '{"event":"visit"}', keepalive: true,
    }).then(async response => {
      if (!hasPilotClientConsent()) {
        await fetch("/api/pilot/events", { method: "DELETE", credentials: "same-origin", keepalive: true });
        visitPromise = null; return false;
      }
      if (!response.ok) visitPromise = null;
      return response.ok;
    }).catch(() => { visitPromise = null; return false; });
  }
  return visitPromise;
}

export async function sendPilotVital(vital: { metric: string; metricId: string; value: number; pageClass: "public" | "app"; device: "mobile" | "desktop" }) {
  if (!hasPilotClientConsent() || !await ensurePilotVisit() || !hasPilotClientConsent()) return;
  try {
    await fetch("/api/pilot/vitals", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vital), keepalive: true });
  } catch { /* A dropped optional measurement must not block navigation. */ }
}

export function installPilotMetrics(): () => void {
  let stopped = false, lastConsent: boolean | null = null;
  let chain = Promise.resolve();
  const sync = () => {
    const accepted = hasPilotClientConsent();
    if (stopped || lastConsent === accepted) return;
    lastConsent = accepted;
    // Serial requests prevent late visit responses recreating a cookie after withdrawal.
    chain = chain.then(async () => {
      if (stopped && accepted) return;
      try {
        if (accepted) await ensurePilotVisit();
        else {
          await visitPromise; visitPromise = null;
          await fetch("/api/pilot/events", { method: "DELETE", credentials: "same-origin", keepalive: true });
        }
      } catch { /* No effect on navigation; next consent/focus change retries. */ }
    });
  };
  const onFocus = () => { lastConsent = null; sync(); };
  window.addEventListener("fakturo-consent-updated", sync);
  window.addEventListener("focus", onFocus);
  sync();
  return () => { stopped = true; window.removeEventListener("fakturo-consent-updated", sync); window.removeEventListener("focus", onFocus); };
}
