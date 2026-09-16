import { prisma } from "@/lib/db";
import { authenticatePublicApi, statusSelect } from "@/lib/public-api";
import { ApiError, handleApiError, json } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const key = await authenticatePublicApi(req), q = new URL(req.url).searchParams;
    const cursor = q.get("cursor"), invoiceId = q.get("invoiceId");
    if ((cursor && !objectId(cursor)) || (invoiceId && !objectId(invoiceId))) throw new ApiError(400, "Nieprawidłowy identyfikator.");
    const rows = await prisma.invoice.findMany({ where: { sellerCompanyId: key.companyId, ...(invoiceId ? { id: invoiceId } : cursor ? { id: { gt: cursor } } : {}) }, select: statusSelect, orderBy: { id: "asc" }, take: 51 });
    if (invoiceId && !rows.length) throw new ApiError(404, "Nie znaleziono faktury.");
    return json({ data: rows.slice(0,50), nextCursor: rows.length > 50 ? rows[49].id : null });
  } catch (e) { return handleApiError(e); }
}
