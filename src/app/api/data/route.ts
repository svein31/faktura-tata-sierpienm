import { getApiSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { readBootstrapData } from "@/lib/server/bootstrap-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/data — the complete, live-authorised user bootstrap. */
export async function GET(req: Request) {
  const listMode = new URL(req.url).searchParams.get("invoiceMode") === "list";
  try {
    const user = await getApiSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }
    return json(await readBootstrapData(user, listMode));
  } catch (e) {
    return handleApiError(e);
  }
}
