// Loaded after idle. No third-party scripts, URL collection or data-layer payloads.
import { hasAnalyticsConsent } from "./cookie-consent";
const APP_ROUTES = /^\/(accountant|advances|analytics|audit|calendar|contractors|cost-reviews|dashboard|documents|expenses|finances|help|invoices|jpk|ksef|offers|orders|products|projects|recurring|reminders|settings|tax-estimate|warehouse)(\/|$)/;

/** Web Vitals describe the loaded document, including after a later SPA navigation. */
export function pilotDocumentContext(): { pageClass: "public" | "app"; device: "mobile" | "desktop" } {
  let pathname = window.location.pathname;
  try {
    const documentNavigation = performance.getEntriesByType("navigation")[0];
    if (documentNavigation?.name) pathname = new URL(documentNavigation.name).pathname;
  } catch { /* Older browsers retain the coarse mount-time classification. */ }
  return { pageClass: APP_ROUTES.test(pathname) ? "app" : "public",
    device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop" };
}

export function hasPilotClientConsent(): boolean {
  if (!hasAnalyticsConsent()) return false;
  const privacy = typeof navigator === "undefined" ? null : navigator as Navigator & { globalPrivacyControl?: boolean };
  return privacy?.globalPrivacyControl !== true && privacy?.doNotTrack !== "1" && privacy?.doNotTrack !== "yes"
    && (typeof window === "undefined" || (window as Window & { doNotTrack?: string }).doNotTrack !== "1");
}
let visitPromise: Promise<boolean> | null = null;

// An optional collector must not leave withdrawal queued forever during an outage.
async function requestPilot(path: string, init: RequestInit) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000);
  try { return await fetch(path, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

async function withdraw() {
  const response = await requestPilot("/api/pilot/events", { method: "DELETE", credentials: "same-origin", keepalive: true });
  if (!response.ok) throw new Error("Optional measurement withdrawal will retry");
}

export function ensurePilotVisit(): Promise<boolean> {
  if (!hasPilotClientConsent()) return Promise.resolve(false);
  if (!visitPromise) {
    visitPromise = requestPilot("/api/pilot/events", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: '{"event":"visit"}', keepalive: true,
    }).then(async response => {
      if (!hasPilotClientConsent()) {
        await withdraw();
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
    await requestPilot("/api/pilot/vitals", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vital), keepalive: true });
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
          await withdraw();
        }
      } catch { if (lastConsent === accepted) lastConsent = null; /* Retry on the next consent, focus or online event. */ }
    });
  };
  const onFocus = () => { lastConsent = null; sync(); };
  window.addEventListener("fakturo-consent-updated", sync);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onFocus);
  sync();
  return () => { stopped = true; window.removeEventListener("fakturo-consent-updated", sync); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus); };
}
