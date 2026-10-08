import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api";
import { getQueueHealth } from "@/lib/ksef/queue-health";

export const runtime = "nodejs";

/** Operator-only global backlog. Never expose billing, invoice or recipient details. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.KSEF_QUEUE_SECRET;
  if (!secret) return json({ ok: false, error: "Monitor kolejki nie jest skonfigurowany." }, { status: 503 });
  const actual = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ ok: false, error: "Nieautoryzowany." }, { status: 401 });
  try { return json(await getQueueHealth()); }
  catch { return json({ ok: false, error: "Nie można odczytać kondycji kolejek." }, { status: 503 }); }
}
