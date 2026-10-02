import { prisma } from "@/lib/db";
import { backupReceipt, verifyBackupSignature } from "@/lib/backup-monitor";
import { ApiError, handleApiError, json } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const secret = process.env.BACKUP_MONITOR_SECRET || "";
    if (secret.length < 32) throw new ApiError(503, "Monitor kopii nie został skonfigurowany.");
    const reader = req.body?.getReader(); if (!reader) throw new ApiError(400, "Brak potwierdzenia.");
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 4096) { await reader.cancel(); throw new ApiError(413, "Potwierdzenie jest za duże."); } chunks.push(next.value); }
    const body = Buffer.concat(chunks).toString("utf8");
    if (!verifyBackupSignature(body, req.headers.get("x-backup-signature") || "", secret)) throw new ApiError(401, "Nieprawidłowy podpis.");
    let receipt;
    try { receipt = backupReceipt(JSON.parse(body)); } catch { throw new ApiError(400, "Nieprawidłowe potwierdzenie lub czas."); }
    await prisma.$transaction(async tx => {
      const current = await tx.backupReceipt.findUnique({ where: { id: receipt.id } });
      if (current && current.completedAt >= receipt.completedAt) return;
      await tx.backupReceipt.upsert({ where: { id: receipt.id }, create: receipt, update: { ...receipt, receivedAt: new Date() } });
    });
    return json({ ok: true });
  } catch (e) { return handleApiError(e); }
}
