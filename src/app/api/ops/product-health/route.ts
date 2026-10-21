import { json } from "@/lib/api";
import { operatorAuthorized, processProductNotifications, productHealthSummary } from "@/lib/server/product-observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!operatorAuthorized(req)) return json({ ok: false }, { status: 401 });
  try { return json(await productHealthSummary()); } catch { return json({ ok: false }, { status: 503 }); }
}
export async function POST(req: Request) {
  if (!operatorAuthorized(req)) return json({ ok: false }, { status: 401 });
  try { return json({ ok: true, ...await processProductNotifications() }); } catch { return json({ ok: false }, { status: 503 }); }
}
