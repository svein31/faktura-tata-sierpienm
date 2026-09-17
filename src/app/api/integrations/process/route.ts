import { requireCron } from "@/lib/cron";
import { processStatusWebhooks } from "@/lib/webhooks";
import { handleApiError, json } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try { requireCron(req); return json(await processStatusWebhooks()); } catch (e) { return handleApiError(e); }
}
