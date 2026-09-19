import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";

/** Legacy inventory is never implicitly attributed to the currently selected company. */
export async function warehouseReadScope(userId: string, companyId: string | null): Promise<Prisma.WarehouseWhereInput> {
  if (companyId === "legacy") return { userId, OR: [{ companyId: null }, { companyId: { isSet: false } }] };
  if (!objectId(companyId)) throw new ApiError(400, "Wybierz firmę lub archiwum magazynów.");
  const access = await requireCompanyAccess(userId, companyId);
  if (!access.ok) throw new ApiError(access.status, access.error, access.code);
  return { companyId };
}

export function inventoryQuery(params: URLSearchParams) {
  const view = params.get("view") || "stock";
  if (!["stock", "documents", "movements"].includes(view)) throw new ApiError(400, "Nieprawidłowy widok magazynu.");
  const warehouseId = params.get("warehouseId") || "";
  const itemId = params.get("itemId") || "";
  const cursor = params.get("cursor") || "";
  for (const id of [warehouseId, itemId, cursor]) if (id && !objectId(id)) throw new ApiError(400, "Nieprawidłowy identyfikator.");
  const search = (params.get("search") || "").trim();
  if (search.length > 120) throw new ApiError(400, "Wyszukiwanie może mieć do 120 znaków.");
  return { view, warehouseId, itemId, cursor, search, lowOnly: params.get("lowOnly") === "true" };
}
