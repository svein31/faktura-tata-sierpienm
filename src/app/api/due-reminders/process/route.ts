import { requireCron } from "@/lib/cron";
import { processDueReminders } from "@/lib/due-reminders";
import { handleApiError, json } from "@/lib/api";
export const runtime = "nodejs";
export async function POST(req:Request){try{requireCron(req);return json(await processDueReminders());}catch(e){return handleApiError(e);}}
