import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./api";
import { documentMime } from "./document-inbox";
type Scan = { safetyStatus: "clean" | "unverified" | "quarantined"; safetyEngine: string; safetyReason: string | null; safetyCheckedAt: Date };
/** Basic inspection is explicitly not an antivirus result. External verdicts must match the exact bytes. */
export function basicDocumentThreat(bytes: Buffer) {
  const type = documentMime(bytes);
  const raw = bytes.toString("latin1");
  if (raw.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) return "Wykryto sygnaturę testową antywirusa.";
  const decoded = raw.replace(/#([a-f0-9]{2})/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
  if (type === "application/pdf" && /\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|SubmitForm|ImportData)\b/i.test(decoded)) return "PDF zawiera aktywne działania lub osadzone pliki. Wgraj płaski dokument.";
  return null;
}
export async function scanDocument(bytes: Buffer): Promise<Scan> {
  const checked = new Date(), threat = basicDocumentThreat(bytes);
  const result = (safetyStatus: Scan["safetyStatus"], safetyEngine: string, safetyReason: string | null): Scan => ({ safetyStatus, safetyEngine, safetyReason, safetyCheckedAt: checked });
  if (threat) return result("quarantined", "basic-inspection", threat);
  const endpoint = process.env.DOCUMENT_SCAN_URL, token = process.env.DOCUMENT_SCAN_TOKEN;
  if (!endpoint || !token) return result(process.env.DOCUMENT_SCAN_REQUIRED === "true" ? "quarantined" : "unverified", "basic-inspection", "Skaner antywirusowy nie został skonfigurowany. Wykonano kontrolę typu i aktywnej zawartości.");
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid scanner endpoint");
    const response = await fetch(url, { method: "POST", redirect: "error", headers: { Authorization: "Bearer " + token, "Content-Type": "application/octet-stream", "X-Content-SHA256": createHash("sha256").update(bytes).digest("hex") }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(15000) });
    if (!response.ok || Number(response.headers.get("content-length")) > 16384) throw new Error("Scanner unavailable");
    const reader = response.body?.getReader(); if (!reader) throw new Error("Scanner response missing");
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 16384) { await reader.cancel(); throw new Error("Scanner response too large"); } chunks.push(next.value); }
    const verdict = JSON.parse(Buffer.concat(chunks).toString());
    if (verdict.sha256 !== createHash("sha256").update(bytes).digest("hex") || !["clean", "infected"].includes(verdict.status)) throw new Error("Invalid scan verdict");
    return result(verdict.status === "clean" ? "clean" : "quarantined", "external-antivirus", verdict.status === "clean" ? null : "Skaner wykrył zagrożenie. Plik jest zablokowany.");
  } catch { return result("quarantined", "external-antivirus", "Skanowanie nie zakończyło się potwierdzeniem bezpieczeństwa. Ponów kontrolę później."); }
}
export async function ensureDocumentSafety(doc: { id: string; imageData: string | null; safetyStatus?: string | null }, force = false) {
  if (!doc.imageData) throw new ApiError(404, "Brak oryginału dokumentu.");
  if (force || !doc.safetyStatus || doc.safetyStatus === "unverified" && Boolean(process.env.DOCUMENT_SCAN_URL)) {
    const bytes = Buffer.from(doc.imageData.slice(doc.imageData.indexOf(",") + 1), "base64");
    const safety = await scanDocument(bytes);
    await prisma.expenseScan.update({ where: { id: doc.id }, data: safety });
    doc = { ...doc, safetyStatus: safety.safetyStatus };
  }
  if (doc.safetyStatus === "quarantined" || process.env.DOCUMENT_SCAN_REQUIRED === "true" && doc.safetyStatus !== "clean") throw new ApiError(423, "Plik jest w kwarantannie. Ponów kontrolę bezpieczeństwa w skrzynce dokumentów.", "DOCUMENT_QUARANTINED");
}
