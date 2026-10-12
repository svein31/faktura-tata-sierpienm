import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess, companyWriteAccess } from "@/lib/company-write";
import { invoiceTotals, round2 } from "@/lib/format";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { recordAuditLog } from "@/lib/audit";
import type { InvoiceLine } from "@/lib/types";

export const runtime = "nodejs";

/** Record remaining balances as actual payment entries, atomically for one company and one page. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req);
    const { company } = await companyAccess(prisma, user.id, body.companyId, "canRecordPayments");
    const entries = body.invoices;
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 30 || entries.some(item => !item || typeof item !== "object" || typeof item.id !== "string" || !/^[0-9a-f]{24}$/i.test(item.id) || !Number.isInteger(item.version) || item.version < 1)) throw new ApiError(400, "Wybierz od 1 do 30 aktualnych faktur.");
    const ids = entries.map(item => item.id as string);
    if (new Set(ids).size !== ids.length) throw new ApiError(400, "Powtórzone faktury w żądaniu.");
    const count = await prisma.$transaction(async tx => {
      await companyWriteAccess(tx, user.id, company.id, "canRecordPayments");
      const invoices = await tx.invoice.findMany({ where: { id: { in: ids }, sellerCompanyId: company.id }, include: { payments: true } });
      if (invoices.length !== ids.length) throw new ApiError(403, "Brak dostępu do części faktur.");
      await assertAccountingPeriodsOpen(tx, invoices.map(invoice => ({ companyId: company.id, issueDate: invoice.issueDate })));
      const now = new Date();
      for (const invoice of invoices) {
        const expected = entries.find(item => item.id === invoice.id).version;
        if ((invoice.version ?? 1) !== expected) throw new ApiError(409, "Faktura zmieniła się. Odśwież listę.");
        if (invoice.type !== "sale" || invoice.isProforma || invoice.status === "draft" || invoice.documentStatus === "draft" || invoice.status === "paid" || invoice.paymentStatus === "paid") throw new ApiError(409, "Zaznaczone dokumenty nie mogą zostać rozliczone zbiorczo.");
        const gross = round2(invoice.totalGross || invoiceTotals({ lines: invoice.lines as unknown as InvoiceLine[] }).gross);
        const paid = round2(invoice.payments.reduce((total, payment) => total + payment.amount, 0));
        const remaining = round2(gross - paid);
        if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 1e9) throw new ApiError(409, "Sprawdź dotychczasowe wpłaty faktury.");
        await tx.invoice.update({ where: { id: invoice.id, version: invoice.version }, data: { paidAmount: gross, paymentStatus: "paid", status: "paid", version: (invoice.version ?? 1) + 1 } });
        const payment = await tx.paymentRecord.create({ data: { invoiceId: invoice.id, userId: user.id, amount: remaining, paidAt: now, method: "transfer", note: "Rozliczenie zbiorcze" } });
        await recordAuditLog({ client: tx, companyId: company.id, documentId: invoice.id, userId: user.id, userName: user.name, userEmail: user.email, action: "payment_registered", entityType: "invoice", entityId: invoice.id, details: { paymentId: payment.id, amount: remaining, totalPaid: gross, currency: invoice.currency, method: "transfer", source: "bulk" } });
      }
      return invoices.length;
    });
    return json({ count });
  } catch (error) { return handleApiError(error); }
}
