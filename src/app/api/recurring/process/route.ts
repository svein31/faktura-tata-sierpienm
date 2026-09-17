import { requireCron } from "@/lib/cron";
import { generateRecurringInvoices } from "@/lib/recurring";
import { handleApiError, json } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try { requireCron(req); return json({ results: await generateRecurringInvoices() }); }
  catch (e) { return handleApiError(e); }
}
