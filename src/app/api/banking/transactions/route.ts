import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, assertObjectId, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { isAccountingInvoice } from "@/lib/accountant-summary";
import { recordAuditLog } from "@/lib/audit";
export const runtime = "nodejs";
const scope = (companyId: string) => ({ OR: [{ accountId: companyId }, { connection: { companyId } }] });
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const q = new URL(req.url).searchParams;
    const { company } = await companyAccess(prisma, user.id, q.get("companyId"), "canRecordPayments");
    const cursor = q.get("cursor"), transactionId = q.get("transactionId");
    if (cursor) assertObjectId(cursor);
    if (transactionId) {
      assertObjectId(transactionId);
      const transaction = await prisma.bankTransaction.findFirst({ where: { id: transactionId, ...scope(company.id) } });
      if (!transaction) throw new ApiError(404, "Nie znaleziono transakcji.");
      const amount = Math.abs(transaction.amount), type = transaction.amount > 0 ? "sale" : "purchase";
      const [invoices, expenses] = await Promise.all([
        prisma.invoice.findMany({ where: { sellerCompanyId: company.id, type, currency: transaction.currency, status: { notIn: ["draft", "cancelled", "paid"] }, isProforma: { not: true }, isCorrection: { not: true }, totalGross: { gte: amount }, ...(q.get("search") ? { number: { contains: q.get("search")!.slice(0, 100), mode: "insensitive" } } : {}) }, orderBy: { issueDate: "desc" }, take: 100 }),
        type === "purchase" ? prisma.expense.findMany({ where: { companyId: company.id, currency: transaction.currency, paymentStatus: "unpaid", totalGross: amount }, orderBy: { issueDate: "desc" }, take: 20 }) : Promise.resolve([]),
      ]);
      return json({ transaction, candidates: [
        ...invoices.filter(i => isAccountingInvoice(i) && Math.round(((i.totalGross || 0) - (i.paidAmount || 0)) * 100) >= Math.round(amount * 100)).slice(0, 20).map(i => ({ id: i.id, kind: "invoice", number: i.number, remaining: Math.round(((i.totalGross || 0) - (i.paidAmount || 0)) * 100) / 100 })),
        ...expenses.map(e => ({ id: e.id, kind: "expense", number: e.number, remaining: e.totalGross })),
      ] });
    }
    const where = { ...scope(company.id), matchStatus: { in: ["unmatched", "ambiguous"] } };
    const [rows, total] = await Promise.all([
      prisma.bankTransaction.findMany({ where: { ...where, ...(cursor ? { id: { lt: cursor } } : {}) }, select: { id: true, bookingDate: true, amount: true, currency: true, description: true, counterpartyName: true, matchStatus: true, updatedAt: true }, orderBy: { id: "desc" }, take: 31 }),
      prisma.bankTransaction.count({ where }),
    ]);
    return json({ transactions: rows.slice(0, 30), nextCursor: rows.length > 30 ? rows[29].id : null, total });
  } catch (e) { return handleApiError(e); }
}
export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req); assertObjectId(body.transactionId);
    if (!["match", "ignore"].includes(String(body.action))) throw new ApiError(400, "Wybierz przypisanie lub pominięcie.");
    if (body.action === "match") { assertObjectId(body.documentId); if (!["invoice", "expense"].includes(String(body.kind))) throw new ApiError(400, "Wybierz dokument."); }
    const result = await prisma.$transaction(async tx => {
      const { company } = await companyAccess(tx, user.id, body.companyId, "canRecordPayments");
      const transaction = await tx.bankTransaction.findFirst({ where: { id: body.transactionId as string, ...scope(company.id) } });
      if (!transaction) throw new ApiError(404, "Nie znaleziono transakcji.");
      if (!["unmatched", "ambiguous"].includes(transaction.matchStatus) || transaction.updatedAt.toISOString() !== body.revision) throw new ApiError(409, "Transakcja zmieniła się lub jest już rozliczona. Odśwież listę.");
      const amount = Math.abs(transaction.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "Nieprawidłowa kwota transakcji.");
      let paymentRecordId: string | undefined, number: string | undefined;
      if (body.action === "match" && body.kind === "invoice") {
        const invoice = await tx.invoice.findFirst({ where: { id: body.documentId as string, sellerCompanyId: company.id } });
        if (!invoice || !isAccountingInvoice(invoice) || invoice.isProforma || invoice.isCorrection || invoice.type !== (transaction.amount > 0 ? "sale" : "purchase") || invoice.currency !== transaction.currency) throw new ApiError(400, "Dokument nie odpowiada firmie, kierunkowi lub walucie transakcji.");
        const paidCents = Math.round((invoice.paidAmount || 0) * 100) + Math.round(amount * 100), totalCents = Math.round((invoice.totalGross || 0) * 100);
        if (paidCents > totalCents) throw new ApiError(409, "Kwota przekracza saldo dokumentu.");
        await assertAccountingPeriodsOpen(tx, [{ companyId: company.id, issueDate: invoice.issueDate }]);
        const full = paidCents === totalCents;
        await tx.invoice.update({ where: { id: invoice.id, version: invoice.version }, data: { paidAmount: paidCents / 100, paymentStatus: full ? "paid" : "partially_paid", status: full ? "paid" : invoice.status, version: (invoice.version || 1) + 1 } });
        const payment = await tx.paymentRecord.create({ data: { userId: user.id, invoiceId: invoice.id, amount, method: "transfer", paidAt: new Date(transaction.bookingDate + "T12:00:00Z"), note: "Rozliczenie bankowe: " + transaction.description.slice(0, 200) } });
        paymentRecordId = payment.id; number = invoice.number;
      } else if (body.action === "match") {
        const expense = await tx.expense.findFirst({ where: { id: body.documentId as string, companyId: company.id, paymentStatus: "unpaid" } });
        if (!expense || transaction.amount >= 0 || expense.currency !== transaction.currency || Math.round(expense.totalGross * 100) !== Math.round(amount * 100)) throw new ApiError(400, "Koszt wymaga zgodnej waluty, wypłaty i pełnej kwoty.");
        await assertAccountingPeriodsOpen(tx, [{ companyId: company.id, issueDate: expense.issueDate }]);
        await tx.expense.update({ where: { id: expense.id, updatedAt: expense.updatedAt }, data: { paymentStatus: "paid", paidAt: new Date(transaction.bookingDate + "T12:00:00Z") } }); number = expense.number;
      }
      const updated = await tx.bankTransaction.update({ where: { id: transaction.id, updatedAt: transaction.updatedAt }, data: { matchStatus: body.action === "ignore" ? "ignored" : "manual", matchedAt: new Date(), ...(body.action === "match" ? { matchedInvoiceId: body.kind === "invoice" ? body.documentId as string : null, matchedExpenseId: body.kind === "expense" ? body.documentId as string : null, matchedInvoiceNumber: number, paymentRecordId, matchConfidence: 1, matchSignals: ["manual"] } : {}) } });
      await recordAuditLog({ client: tx, companyId: company.id, userId: user.id, entityType: "bankTransaction", entityId: transaction.id, action: "bank.transaction." + body.action, details: { documentId: body.documentId, amount, currency: transaction.currency } });
      return { id: updated.id, status: updated.matchStatus };
    }, { timeout: 30000 });
    return json(result);
  } catch (e) { return handleApiError(e); }
}
