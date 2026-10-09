import type { Prisma } from "@prisma/client";

/** A company shares its numbering; unassigned legacy documents belong to one user. */
export function invoiceNumberScope(userId: string, companyId?: string | null): Prisma.InvoiceWhereInput {
  return companyId ? { sellerCompanyId: companyId } : {
    userId,
    OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }],
  };
}
