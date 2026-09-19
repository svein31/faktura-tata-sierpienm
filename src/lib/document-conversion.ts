import { ApiError } from "@/lib/api";
import { parseInvoiceBody } from "@/lib/parsers";
import { scopedContractor } from "@/lib/document-scope";
import { warsawDate, addCalendarDays } from "@/lib/scheduling";
import type { Prisma } from "@prisma/client";

export async function conversionInvoiceData(userId: string, document: { companyId: string | null; contractorId: string | null; currency: string }, lines: unknown[], notes: string) {
  await scopedContractor(userId, document.contractorId || "", document.companyId);
  const today = warsawDate();
  return parseInvoiceBody({ number: "CONVERSION", type: "sale", status: "issued", documentStatus: "issued", sellerCompanyId: document.companyId, contractorId: document.contractorId, issueDate: today, saleDate: today, dueDate: addCalendarDays(today,14), currency: document.currency, language: "PL", paymentMethod: "transfer", paymentTermDays:14, notes, lines }, { contractorOwnedBy: async () => true, companyOwnedBy: async id => id === document.companyId });
}

/** Serialize conversion numbering per company; a concurrent conversion retries after 409. */
export async function conversionNumber(tx: Prisma.TransactionClient, companyId: string | null, userId: string) {
  if (companyId) await tx.companyProfile.update({ where: { id:companyId }, data: { updatedAt: new Date() } });
  else await tx.user.update({ where: { id:userId }, data: { updatedAt: new Date() } });
  const where = companyId ? { sellerCompanyId: companyId } : { userId, sellerCompanyId: null };
  let sequence = await tx.invoice.count({ where: { ...where, type: "sale" } }) + 1;
  for (let attempts=0; attempts<100; attempts++,sequence++) {
    const number = `FV/${warsawDate().slice(0,4)}/${String(sequence).padStart(4,"0")}`;
    if (!await tx.invoice.count({ where: { ...where, number } })) return number;
  }
  throw new ApiError(409,"Nie udało się przydzielić numeru faktury. Sprawdź numerację firmy.");
}
