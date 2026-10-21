import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, handleApiError, json } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { readImportRequest } from "@/lib/import-request";
import { parseCatalogXlsx } from "@/lib/catalog-xlsx";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams;
    await companyAccess(prisma, user.id, params.get("companyId"), "canIssueInvoices");
    const sheet = params.get("sheet") || "0";
    if (!/^\d{1,2}$/.test(sheet)) throw new ApiError(400, "Nieprawidłowy numer arkusza.");
    return json(parseCatalogXlsx(await readImportRequest(req, 2_000_000), Number(sheet)));
  } catch (error) { return handleApiError(error); }
}
