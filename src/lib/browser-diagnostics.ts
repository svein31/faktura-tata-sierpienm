import { DIAGNOSTIC_NAMES, diagnosticFingerprint, productScreen, type DiagnosticEvent } from "./product-diagnostics";
let lastIncident: string | undefined;
export const getLastIncident = () => lastIncident;
const seen = new Map<string, number>();
let sent = 0;
export async function reportBrowserError(error: unknown, kind: DiagnosticEvent["kind"] = "boundary") {
  if (typeof window === "undefined" || sent >= 10) return;
  const candidate = error instanceof Error ? error : null;
  const message = candidate?.message || "";
  const reactCode = /(?:Minified React error #|react\.dev\/errors\/)(\d{1,3})/.exec(message)?.[1];
  const name = reactCode === "418" ? "HydrationError" : candidate && (DIAGNOSTIC_NAMES as readonly string[]).includes(candidate.name) ? candidate.name : "UnknownError";
  // Fingerprint only static application asset frames, never messages or private page URLs.
  const frames = candidate?.stack?.split("\n").slice(1).flatMap(line => line.match(/\/_next\/static\/[^\s?:)]+:\d+:\d+/g) || []).slice(0, 6).join("|") || "no-app-frame";
  const fingerprint = diagnosticFingerprint(`${name}:${reactCode || ""}:${frames}:${productScreen(window.location.pathname)}`);
  const previous = seen.get(fingerprint) || 0; if (Date.now() - previous < 60000) return;
  seen.set(fingerprint, Date.now()); sent++;
  const revision = document.querySelector('meta[name="fakturaprosto-revision"]')?.getAttribute("content") || "unknown";
  const ua = navigator.userAgent;
  const event: DiagnosticEvent = { kind, name, fingerprint, screen: productScreen(window.location.pathname), revision: /^(?:unknown|[a-f0-9]{7,64})$/.test(revision) ? revision : "unknown", device: matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop", browser: /Firefox|FxiOS/.test(ua) ? "firefox" : /Chrome|Chromium|CriOS|Edg|OPR/.test(ua) ? "chromium" : /Safari/.test(ua) ? "safari" : "other", ...(reactCode ? { reactCode: Number(reactCode) } : {}) };
  try { const res = await fetch("/api/diagnostics", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), keepalive: true, signal: AbortSignal.timeout(4000) }); if (res.ok) { const body = await res.json(); if (typeof body.incident === "string") lastIncident = body.incident; } } catch { /* Diagnostics never change the operation being reported. */ }
}
export function installBrowserDiagnostics() {
  const error = (event: ErrorEvent) => { void reportBrowserError(event.error, "window"); };
  const rejection = (event: PromiseRejectionEvent) => { void reportBrowserError(event.reason, "promise"); };
  window.addEventListener("error", error); window.addEventListener("unhandledrejection", rejection);
  const host = window as Window & { __fpDiagnostics?: { queue: [unknown, DiagnosticEvent["kind"]][]; stop: () => void } };
  const early = host.__fpDiagnostics; if (early) { early.stop(); delete host.__fpDiagnostics; for (const [failure, kind] of early.queue) void reportBrowserError(failure, kind); early.queue.length = 0; }
  return () => { window.removeEventListener("error", error); window.removeEventListener("unhandledrejection", rejection); };
}
