import { prisma } from "@/lib/db";
import { authenticatePublicApi } from "@/lib/public-api";
import { ApiError, handleApiError, json } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
export async function GET(req: Request) {
  try {
    const key = await authenticatePublicApi(req, "documents:read"), q = new URL(req.url).searchParams;
    const cursor = q.get("cursor"), id = q.get("id");
    if ((cursor && !objectId(cursor)) || (id && !objectId(id))) throw new ApiError(400, "Nieprawidłowy identyfikator.");
    const rows = await prisma.invoice.findMany({ where: { sellerCompanyId: key.companyId, ...(id ? { id } : cursor ? { id: { gt: cursor } } : {}) }, select: { id: true, number: true, type: true, documentStatus: true, issueDate: true, saleDate: true, contractorId: true, currency: true, totalNet: true, totalVat: true, totalGross: true, lines: true, version: true, updatedAt: true }, orderBy: { id: "asc" }, take: 51 });
    if (id && !rows.length) throw new ApiError(404, "Nie znaleziono dokumentu.");
    return json({ data: rows.slice(0,50), nextCursor: rows.length > 50 ? rows[49].id : null });
  } catch (e) { return handleApiError(e); }
}
