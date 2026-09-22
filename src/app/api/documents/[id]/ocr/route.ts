import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { enqueueOcr } from "@/lib/ocr-jobs";
export const runtime = "nodejs";
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    if (!process.env.OCR_SPACE_API_KEY) throw new ApiError(503, "OCR nie jest skonfigurowany. Możesz opracować dokument ręcznie.");
    return json(await enqueueOcr(user.id, (await context.params).id), { status: 202 });
  } catch (e) { return handleApiError(e); }
}
