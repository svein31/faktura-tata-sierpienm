import { prisma } from "@/lib/db";
import { authenticatePublicApi } from "@/lib/public-api";
import { ApiError, handleApiError, json } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
export async function GET(req: Request) {
  try {
    const key = await authenticatePublicApi(req, "catalogs:read"), q = new URL(req.url).searchParams;
    const cursor = q.get("cursor"), kind = q.get("kind") || "products";
    if (cursor && !objectId(cursor)) throw new ApiError(400, "Nieprawidłowy kursor.");
    if (!["products", "contractors"].includes(kind)) throw new ApiError(400, "Wybierz products lub contractors.");
    const where = { companyId: key.companyId, ...(cursor ? { id: { gt: cursor } } : {}) };
    const rows = kind === "products"
      ? await prisma.product.findMany({ where, select: { id:true, name:true, sku:true, unit:true, netPrice:true, vatRate:true, updatedAt:true }, orderBy: { id: "asc" }, take:51 })
      : await prisma.contractor.findMany({ where, select: { id:true, name:true, nip:true, address:true, email:true, phone:true, updatedAt:true }, orderBy: { id:"asc" }, take:51 });
    return json({ data:rows.slice(0,50), nextCursor:rows.length > 50 ? rows[49].id : null });
  } catch (e) { return handleApiError(e); }
}
