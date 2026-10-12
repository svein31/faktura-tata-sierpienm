import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { companyWriteAccess } from "@/lib/company-write";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { captureInvoicePrint } from "@/lib/pdf/invoice-print";
import { claimInvoiceQuota } from "@/lib/invoice-quota";

export const KSEF_IN_FLIGHT = ["queued", "sending", "verify_needed"];

/** Persist before contacting KSeF; never silently retry an ambiguous transmission. */
export async function claimKsefTransmission(tx: Prisma.TransactionClient, input: { invoiceId: string; version: number | null; userId: string; taskId?: string }) {
  const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) throw new ApiError(404, "Nie znaleziono faktury.");
  if ((invoice.version || 1) !== (input.version || 1)) throw new ApiError(409, "Dokument zmienił się przed wysyłką. Odśwież dane.");
  if (invoice.sellerCompanyId) await companyWriteAccess(tx, input.userId, invoice.sellerCompanyId, "canSendKsef");
  else if (invoice.userId !== input.userId) throw new ApiError(403, "Brak dostępu do faktury.");
  if (invoice.type === "purchase" || invoice.isProforma || invoice.documentStatus === "cancelled") throw new ApiError(400, "Ten dokument nie podlega wysyłce do KSeF.");
  if (invoice.ksefNumber || invoice.referenceNumber || ["sending", "verify_needed"].includes(invoice.ksefStatus || "")) throw new ApiError(409, "Najpierw zweryfikuj poprzednią wysyłkę w KSeF.");
  if (input.taskId) {
    const task = await tx.ksefQueueTask.findFirst({ where: { id: input.taskId, invoiceId: invoice.id, userId: input.userId, status: "processing" } });
    if (!task || invoice.ksefStatus !== "queued") throw new ApiError(409, "Zadanie wysyłki nie jest już aktywne.");
  } else if (invoice.ksefStatus === "queued" || await tx.ksefQueueTask.count({ where: { invoiceId: invoice.id, status: { in: ["queued", "processing"] } } })) {
    throw new ApiError(409, "Faktura jest już w kolejce KSeF.");
  }
  await assertAccountingPeriodsOpen(tx, [{ companyId: invoice.sellerCompanyId, issueDate: invoice.issueDate }]);
  const issuedAt = invoice.status === "draft" && !invoice.issuedAt
    ? await claimInvoiceQuota(tx, input.userId, invoice.sellerCompanyId) : invoice.issuedAt;
  const updated = await tx.invoice.update({ where: { id: invoice.id }, data: { issuedAt, ksefStatus: "sending", documentStatus: "ready", version: (invoice.version || 1) + 1 } });
  await captureInvoicePrint(tx, updated, "ksef-transmission");
  return updated;
}
