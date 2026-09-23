import { X509Certificate } from "node:crypto";
import { ApiError } from "@/lib/api";

export type LatarniaMessage = { id: string; category: string; type: string; title: string; published: string; start: string; end: string | null };
export type LatarniaStatus = { status: "AVAILABLE" | "MAINTENANCE" | "FAILURE" | "TOTAL_FAILURE" | "UNAVAILABLE"; checkedAt: string; messages: LatarniaMessage[] };
const statuses = new Set(["AVAILABLE", "MAINTENANCE", "FAILURE", "TOTAL_FAILURE"]);
const categories = new Set(["FAILURE", "TOTAL_FAILURE", "MAINTENANCE"]);
const types = new Set(["FAILURE_START", "FAILURE_END", "MAINTENANCE_ANNOUNCEMENT"]);
const origins = {
  production: "https://api-latarnia.ksef.mf.gov.pl",
  test: "https://api-latarnia-test.ksef.mf.gov.pl",
} as const;
const cache = new Map<string, { expires: number; result: LatarniaStatus }>();
const string = (value: unknown, max = 180) => typeof value === "string" ? value.slice(0, max) : "";
const date = (value: unknown) => { const text = string(value, 40); return text && Number.isFinite(Date.parse(text)) ? text : ""; };

export function parseLatarniaMessage(value: unknown): LatarniaMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const category = string(item.category, 32), type = string(item.type, 40);
  if (!categories.has(category) || !types.has(type) || !date(item.published)) return null;
  return { id: string(item.id, 24), category, type, title: string(item.title, 80), published: date(item.published), start: date(item.start), end: date(item.end) || null };
}

async function getOfficialJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Latarnia unreachable");
  if (Number(response.headers.get("content-length") || 0) > 65536) throw new Error("Latarnia response too large");
  const body = await response.text();
  if (body.length > 65536) throw new Error("Latarnia response too large");
  return JSON.parse(body) as unknown;
}

/** Fixed government hosts; the result is cached for 60 seconds per environment. */
export async function latarniaStatus(environment: string): Promise<LatarniaStatus> {
  const key = environment === "test" ? "test" : "production";
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const origin = origins[key];
  let result: LatarniaStatus;
  try {
    const [statusRaw, messagesRaw] = await Promise.all([getOfficialJson(origin + "/status"), getOfficialJson(origin + "/messages")]);
    const status = (statusRaw as Record<string, unknown>)?.status;
    if (!statuses.has(String(status))) throw new Error("Unexpected Latarnia status");
    const messages = Array.isArray(messagesRaw) ? messagesRaw.map(parseLatarniaMessage).filter((m): m is LatarniaMessage => !!m).slice(0, 8) : [];
    result = { status: status as LatarniaStatus["status"], checkedAt: new Date().toISOString(), messages };
  } catch {
    result = { status: "UNAVAILABLE", checkedAt: new Date().toISOString(), messages: [] };
  }
  cache.set(key, { expires: Date.now() + (result.status === "UNAVAILABLE" ? 15000 : 60000), result });
  return result;
}

/** Public X.509 certificate only. Never persist the upload, a private key, or authentication tokens. */
export function inspectPublicCertificate(encoded: unknown) {
  if (typeof encoded !== "string" || encoded.length > 32768 || encoded.length < 100 || !/^[A-Za-z0-9+/=\s]+$/.test(encoded)) throw new ApiError(400, "Wybierz publiczny certyfikat X.509 w formacie DER lub PEM.");
  let cert: X509Certificate;
  try { cert = new X509Certificate(Buffer.from(encoded.replace(/\s/g, ""), "base64")); }
  catch { throw new ApiError(400, "Nie można odczytać publicznego certyfikatu X.509."); }
  const validFrom = new Date(cert.validFrom), validTo = new Date(cert.validTo);
  if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validTo.getTime()) || validTo <= validFrom) throw new ApiError(400, "Certyfikat nie ma poprawnego okresu ważności.");
  return { fingerprint: cert.fingerprint256.replaceAll(":", "").toLowerCase(), validFrom, validTo };
}

export function certificateNotice(validTo: Date | null, now = new Date()) {
  if (!validTo) return "missing" as const;
  if (validTo.getTime() <= now.getTime()) return "expired" as const;
  return validTo.getTime() - now.getTime() <= 30 * 86400000 ? "expiring" as const : "valid" as const;
}

export function stuckKsefTask(task: { status: string; lockedUntil?: Date | null; nextAttemptAt?: Date | null; updatedAt: Date }, now = new Date()) {
  if (task.status === "processing") return (task.lockedUntil?.getTime() || task.updatedAt.getTime() + 20 * 60000) < now.getTime();
  if (task.status === "queued") return (task.nextAttemptAt?.getTime() || task.updatedAt.getTime()) + 15 * 60000 < now.getTime();
  return false;
}
