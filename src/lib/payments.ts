import type { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { invoiceTotals, round2 } from "./format";
import type { InvoiceLine } from "./types";
import { PURCHASE_INVOICE_READ_ONLY } from "./invoice-policy";

export async function recordInvoicePayment(tx: Prisma.TransactionClient, invoiceId: string, input: { userId: string; amount: number; paidAt: Date; method: string; note: string | null }) {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isFinite(input.paidAt.getTime())) throw new ApiError(400, "Nieprawidłowa kwota lub data wpłaty.");
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!invoice) throw new ApiError(404, "Nie znaleziono faktury.");
  if (invoice.type === "purchase") throw new ApiError(403, PURCHASE_INVOICE_READ_ONLY);
  const grossTotal = invoiceTotals({ lines: invoice.lines as unknown as InvoiceLine[] }).gross;
  const recorded = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = round2(Math.max(invoice.paidAmount || 0, recorded) + input.amount);
  const paymentStatus = totalPaid >= grossTotal ? "paid" : "partially_paid";
  const updatedInvoice = await tx.invoice.update({
    where: { id: invoiceId, version: invoice.version },
    data: { paidAmount: totalPaid, paymentStatus, status: paymentStatus === "paid" ? "paid" : invoice.status, version: (invoice.version || 1) + 1 },
    include: { sellerCompany: { include: { bankAccounts: true } }, payments: true },
  });
  const payment = await tx.paymentRecord.create({ data: { invoiceId, ...input, amount: round2(input.amount) } });
  updatedInvoice.payments.push(payment);
  return { payment, updatedInvoice, totalPaid, grossTotal, paymentStatus };
}
