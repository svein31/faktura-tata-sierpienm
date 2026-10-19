import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { invoiceSearchParams, readInvoiceSearchPage } from "@/lib/invoice-search";

/** Rechecks current company access, filters and cursor scope for every caller. */
export async function readAuthorizedInvoiceSearch(user: { id: string }, params: URLSearchParams) {
  const companyId = params.get("companyId");
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
    const comparison = filters.sort === "date_asc" ? "$gt" : "$lt";
    after = [{ $match: { $or: [{ issueDate: { [comparison]: anchor.issueDate } }, { issueDate: anchor.issueDate, _id: { [comparison]: { $oid: anchor.id } } }] } }];
  }
  return readInvoiceSearchPage(prisma, scope, filters, after);
}

export type InvoiceSearchData = Awaited<ReturnType<typeof readAuthorizedInvoiceSearch>>;
