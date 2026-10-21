import { prisma } from "@/lib/db";
import { getApiSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { catalogWhere, objectId } from "@/lib/company-scope";
import { contractorToDto, productToDto } from "@/lib/dto";

/** Intent-only, bounded catalog reads. No user-wide catalog in the application shell. */
export async function GET(req: Request) {
  try {
    const user = await getApiSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams, companyId = params.get("companyId"), search = (params.get("search") || "").trim();
    if (search.length > 150) throw new ApiError(400, "Zapytanie jest za długie.");
    if (companyId !== "unassigned") await companyAccess(prisma, user.id, companyId);
    const contractorCursor = params.get("contractorCursor"), productCursor = params.get("productCursor");
    if (contractorCursor && !objectId(contractorCursor) || productCursor && !objectId(productCursor)) throw new ApiError(400, "Nieprawidłowa strona katalogu.");
    const companyIds = companyId === "unassigned" ? [] : [companyId!];
    const linked = companyIds.length ? await prisma.invoice.groupBy({ by: ["contractorId"], where: { sellerCompanyId: companyId! } }) : [];
    const scope = catalogWhere(user.id, companyIds);
    const [contacts, products] = await Promise.all([
      prisma.contractor.findMany({ where: { AND: [
        { OR: [scope, { id: { in: linked.map(row => row.contractorId).filter(objectId) }, OR: [{ companyId: null }, { companyId: { isSet: false } }] }] },
        ...(search ? [{ OR: [{ name: { contains: search, mode: "insensitive" as const } }, { nip: { contains: search, mode: "insensitive" as const } }] }] : []),
        ...(contractorCursor ? [{ id: { lt: contractorCursor } }] : []),
      ] }, orderBy: { id: "desc" }, take: 31 }),
      prisma.product.findMany({ where: { AND: [scope,
        ...(search ? [{ OR: [{ name: { contains: search, mode: "insensitive" as const } }, { sku: { contains: search, mode: "insensitive" as const } }] }] : []),
        ...(productCursor ? [{ id: { lt: productCursor } }] : []),
      ] }, orderBy: { id: "desc" }, take: 31 }),
    ]);
    return json({ contractors: contacts.slice(0, 30).map(contractorToDto), products: products.slice(0, 30).map(productToDto),
      contractorCursor: contacts.length > 30 ? contacts[29].id : null, productCursor: products.length > 30 ? products[29].id : null });
  } catch (error) { return handleApiError(error); }
}
