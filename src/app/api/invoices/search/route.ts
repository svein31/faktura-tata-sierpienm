import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getApiSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { invoiceSearchParams, readInvoiceSearchPage } from "@/lib/invoice-search";
export async function GET(req: Request) {
  try {
    const user = await getApiSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams, companyId = params.get("companyId");
    const unassigned = companyId === "unassigned";
    if (!unassigned) {
      if (!objectId(companyId)) throw new ApiError(400, "Wybierz firmę.");
      const access = await requireCompanyAccess(user.id, companyId);
      if (!access.ok) throw new ApiError(access.status, access.error);
    }
    const filters = invoiceSearchParams(params);
    const scope = unassigned ? { userId: { $oid: user.id }, sellerCompanyId: null } : { sellerCompanyId: { $oid: companyId! } };
    let after: Prisma.InputJsonObject[] = [];
    if (filters.cursor) {
      const anchor = await prisma.invoice.findFirst({ where: { id: filters.cursor, ...(unassigned ? { userId: user.id, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }] } : { sellerCompanyId: companyId! }) }, select: { id: true, issueDate: true } });
      if (!anchor) throw new ApiError(409, "Lista zmieniła się. Wróć do pierwszej strony.");
      after = [{ $match: { $or: [{ issueDate: { $lt: anchor.issueDate } }, { issueDate: anchor.issueDate, _id: { $lt: { $oid: anchor.id } } }] } }];
    }
    return json(await readInvoiceSearchPage(prisma, scope, filters, after));
  } catch (e) { return handleApiError(e); }
}
