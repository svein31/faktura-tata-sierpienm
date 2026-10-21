/** Only fixed screen categories leave the browser; never a URL, query or document ID. */
export const PRODUCT_SCREENS = ["public", "server", "login", "register", "reset-password", "verify-email", "dashboard", "invoices", "invoice-new", "invoice-detail", "accountant", "advances", "analytics", "audit", "calendar", "contractors", "cost-reviews", "documents", "expenses", "finances", "help", "jpk", "ksef", "offers", "orders", "products", "projects", "recurring", "reminders", "settings", "tax-estimate", "warehouse"] as const;
export type ProductScreen = typeof PRODUCT_SCREENS[number];
export function productScreen(pathname: string): ProductScreen {
  if (/^\/invoices\/recurring(?:\/|$)/.test(pathname)) return "recurring";
  if (/^\/invoices\/new(?:\/|$)/.test(pathname)) return "invoice-new";
  if (/^\/invoices\/[^/]+/.test(pathname)) return "invoice-detail";
  const first = pathname.split("/")[1];
  return (PRODUCT_SCREENS as readonly string[]).includes(first) ? first as ProductScreen : "public";
}
export const DIAGNOSTIC_NAMES = ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "ChunkLoadError", "HydrationError", "ServerError", "UnknownError"] as const;
export type DiagnosticEvent = { kind: "window" | "promise" | "boundary" | "server"; name: string; screen: ProductScreen; fingerprint: string; revision: string; device: "mobile" | "desktop" | "server"; browser: "safari" | "firefox" | "chromium" | "other" | "none"; reactCode?: number; prismaCode?: string };
export function diagnosticFingerprint(text: string): string { let hash = 2166136261; for (const char of text.slice(0, 8192)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }
export const validIncident = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export function normalizeDiagnostic(value: unknown): DiagnosticEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !["kind", "name", "screen", "fingerprint", "revision", "device", "browser", "reactCode"].includes(key)) || !["window", "promise", "boundary"].includes(String(v.kind))
    || !(DIAGNOSTIC_NAMES as readonly unknown[]).includes(v.name) || !(PRODUCT_SCREENS as readonly unknown[]).includes(v.screen)
    || typeof v.fingerprint !== "string" || !/^[a-f0-9]{8}$/.test(v.fingerprint) || typeof v.revision !== "string" || !/^(?:unknown|[a-f0-9]{7,64})$/.test(v.revision)
    || !["mobile", "desktop"].includes(String(v.device)) || !["safari", "firefox", "chromium", "other"].includes(String(v.browser))
    || v.reactCode !== undefined && (!Number.isInteger(v.reactCode) || Number(v.reactCode) < 1 || Number(v.reactCode) > 999)) return null;
  return v as DiagnosticEvent;
}
export type SupportInput = { description: string; category: "problem" | "question" | "idea"; screen: ProductScreen; incident?: string; requestId: string };
export function normalizeSupport(value: unknown): SupportInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !["description", "category", "screen", "incident", "requestId"].includes(key)) || typeof v.description !== "string" || v.description.trim().length < 10 || v.description.length > 2000
    || !["problem", "question", "idea"].includes(String(v.category)) || !(PRODUCT_SCREENS as readonly unknown[]).includes(v.screen) || !validIncident(v.requestId) || v.incident !== undefined && !validIncident(v.incident)) return null;
  return { description: v.description.trim(), category: v.category as SupportInput["category"], screen: v.screen as ProductScreen, requestId: v.requestId, ...(v.incident ? { incident: v.incident as string } : {}) };
}
export async function boundedJson(req: Request, maxBytes: number): Promise<unknown> {
  if (Number(req.headers.get("content-length") || 0) > maxBytes) throw new Error("body_limit");
  const reader = req.body?.getReader(); if (!reader) throw new Error("body_invalid");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error("body_limit"); } chunks.push(next.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** A short-lived in-memory queue captures hydration failures before React effects install. */
export const DIAGNOSTIC_BOOTSTRAP_SCRIPT = `(function(){var q=[],w=function(e){if(q.length<10)q.push([e.error,'window']);},p=function(e){if(q.length<10)q.push([e.reason,'promise']);};window.addEventListener('error',w);window.addEventListener('unhandledrejection',p);window.__fpDiagnostics={queue:q,stop:function(){window.removeEventListener('error',w);window.removeEventListener('unhandledrejection',p);}};})();`;

/** Navigation control flow is not a server failure and must not page the operator. */
export function expectedFrameworkError(error: unknown): boolean {
  const digest = error && typeof error === "object" ? (error as { digest?: unknown }).digest : undefined;
  return typeof digest === "string" && /^(?:NEXT_REDIRECT;|NEXT_HTTP_ERROR_FALLBACK;(?:401|403|404)$|NEXT_NOT_FOUND$)/.test(digest);
}
