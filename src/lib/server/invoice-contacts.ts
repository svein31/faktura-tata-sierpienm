import "server-only";
import { prisma } from "@/lib/db";
import { objectId } from "@/lib/company-scope";
import { contractorToDto } from "@/lib/dto";

/** Only contacts referenced by ALREADY authorised documents, including linked legacy rows. */
export async function readInvoiceContacts(userId: string, invoices: { contractorId: string; sellerCompanyId?: string | null }[]) {
  const references = [...new Map(invoices.map(invoice => [(invoice.sellerCompanyId || "unassigned") + ":" + invoice.contractorId, invoice])).values()];
  const scopes = references.filter(invoice => objectId(invoice.contractorId)).map(invoice => ({ id: invoice.contractorId,
    OR: invoice.sellerCompanyId
      ? [{ companyId: invoice.sellerCompanyId }, { companyId: null }, { companyId: { isSet: false } }]
      : [{ userId, companyId: null }, { userId, companyId: { isSet: false } }],
  }));
  return scopes.length ? (await prisma.contractor.findMany({ where: { OR: scopes }, orderBy: { id: "asc" } })).map(contractorToDto) : [];
}
