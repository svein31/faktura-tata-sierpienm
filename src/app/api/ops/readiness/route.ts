import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { backupStatus } from "@/lib/backup-monitor";
import { handleApiError, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.KSEF_QUEUE_SECRET || "";
  const supplied = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.from(supplied), expectedBytes = Buffer.from(expected);
  if (secret.length < 24 || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return json({ ok: false }, { status: 401 });
  try {
    const receipts = await prisma.backupReceipt.findMany({ where: { id: { in: ["backup", "offsite", "restore"] } }, select: { id: true, completedAt: true, archiveSha256: true } });
    return json({ ok: true, generatedAt: new Date().toISOString(), backup: backupStatus(receipts, (process.env.BACKUP_MONITOR_SECRET?.length || 0) >= 32) });
  } catch (error) { return handleApiError(error); }
}
