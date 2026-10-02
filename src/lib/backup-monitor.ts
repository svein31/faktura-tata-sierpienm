import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyBackupSignature(body: string, signature: string, secret: string) {
  if (secret.length < 32 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), createHmac("sha256", secret).update(body).digest());
}
export function backupReceipt(body: unknown, now = Date.now()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Nieprawidłowe potwierdzenie.");
  const value = body as Record<string, unknown>;
  const completed = typeof value.completedAt === "string" ? Date.parse(value.completedAt) : NaN;
  const sent = typeof value.sentAt === "string" ? Date.parse(value.sentAt) : NaN;
  if (!["backup", "offsite", "restore"].includes(String(value.kind)) || !/^[a-f0-9]{64}$/.test(String(value.archiveSha256)) || !Number.isFinite(completed) || !Number.isFinite(sent) || Math.abs(now - sent) > 300000 || completed > now + 300000 || completed < now - 90 * 86400000) throw new Error("Nieprawidłowy czas lub podpisana zawartość potwierdzenia.");
  return { id: value.kind as string, completedAt: new Date(completed), archiveSha256: value.archiveSha256 as string };
}
export function backupStatus(receipts: { id: string; completedAt: Date; archiveSha256: string }[], configured: boolean, now = Date.now()) {
  const backup = receipts.find(r => r.id === "backup"), offsite = receipts.find(r => r.id === "offsite"), restore = receipts.find(r => r.id === "restore");
  const fresh = (receipt: typeof backup, age: number) => Boolean(receipt && receipt.completedAt.getTime() <= now + 300000 && now - receipt.completedAt.getTime() <= age);
  return {
    configured, status: !configured || !backup ? "unknown" : fresh(backup, 36 * 3600000) ? "ok" : "stale",
    completedAt: backup?.completedAt.toISOString() || null,
    offsiteStatus: !offsite ? "unknown" : fresh(offsite, 36 * 3600000) && offsite.archiveSha256 === backup?.archiveSha256 ? "ok" : "stale",
    offsiteAt: offsite?.completedAt.toISOString() || null,
    restoreStatus: !restore ? "unknown" : fresh(restore, 30 * 86400000) ? "ok" : "stale",
    restoredAt: restore?.completedAt.toISOString() || null,
  };
}
