import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { inboxAccess } from "@/lib/document-inbox";
import { objectId } from "@/lib/company-scope";
import { requireCron } from "@/lib/cron";
import { processOcrJob } from "@/lib/ocr-jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    let scope: { companyId?: string; id?: string } = {};
    if (req.headers.has("authorization")) requireCron(req);
    else {
      const user = await getSessionUser();
      if (!user) throw new ApiError(401, "Nieautoryzowany.");
      const body = await readJson(req);
      if (!objectId(body.id)) throw new ApiError(404, "Nie znaleziono dokumentu.");
      const record = await prisma.expenseScan.findUnique({ where: { id: body.id }, select: { companyId: true } });
      if (!record) throw new ApiError(404, "Nie znaleziono dokumentu.");
      const companyId = await inboxAccess(user.id, record.companyId, true);
      scope = { companyId, id: body.id };
    }
    if (!process.env.OCR_SPACE_API_KEY) throw new ApiError(503, "OCR nie jest skonfigurowany.");
    return json(await processOcrJob(scope));
  } catch (e) { return handleApiError(e); }
}
