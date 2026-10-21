import { getApiSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { readBootstrapData } from "@/lib/server/bootstrap-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/data — the complete, live-authorised user bootstrap. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const listMode = params.get("invoiceMode") === "list";
  try {
    const user = await getApiSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }
    const companyId = params.get("companyId") || undefined;
    if (companyId && companyId !== "unassigned" && !objectId(companyId)) throw new ApiError(400, "Nieprawidłowa firma.");
    return json(await readBootstrapData(user, listMode, { shell: params.get("mode") === "shell", companyId }));
  } catch (e) {
    return handleApiError(e);
  }
}
