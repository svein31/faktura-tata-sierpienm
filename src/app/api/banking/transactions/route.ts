import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, assertObjectId, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess, companyWriteAccess } from "@/lib/company-write";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { effectiveDocumentStatus, isAccountingInvoice } from "@/lib/accountant-summary";
import { recordAuditLog } from "@/lib/audit";
import { bankTransactionScope } from "@/lib/banking/scope";
import { allocationAmount, bankBalance, moneyCents, PENDING_BANK_STATUSES, type BankAllocation } from "@/lib/banking/allocation";
import { reconcile } from "@/lib/banking/reconciliation";
import type { Prisma } from "@prisma/client";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const q = new URL(req.url).searchParams;
    const { company } = await companyAccess(prisma, user.id, q.get("companyId"), "canRecordPayments");
    const scope = await bankTransactionScope(prisma, company.id);
    const cursor = q.get("cursor"), transactionId = q.get("transactionId");
    if (cursor) assertObjectId(cursor);
    if (transactionId) {
      assertObjectId(transactionId);
      const transaction = await prisma.bankTransaction.findFirst({ where: { id: transactionId, ...scope } });
      if (!transaction) throw new ApiError(404, "Nie znaleziono transakcji.");
      if (transaction.matchSignals.includes("reversal")) return json({ transaction: { ...transaction, ...bankBalance(transaction) }, candidates: [] });
      const balance = bankBalance(transaction), amount = balance.available;
      const type: "sale" | "purchase" = transaction.amount > 0 ? "sale" : "purchase";
      if (!PENDING_BANK_STATUSES.includes(transaction.matchStatus) || amount <= 0) return json({ transaction: { ...transaction, ...balance }, candidates: [] });
      const [invoices, expenses] = await Promise.all([
        prisma.invoice.findMany({ where: { sellerCompanyId: company.id, type, currency: transaction.currency, status: { notIn: ["draft", "cancelled", "paid"] }, isProforma: { not: true }, isCorrection: { not: true }, totalGross: { gt: 0 }, ...(q.get("search") ? { number: { contains: q.get("search")!.slice(0, 100), mode: "insensitive" } } : {}) }, orderBy: { issueDate: "desc" }, take: 100,
          select: { id: true, number: true, version: true, type: true, currency: true, totalGross: true, paidAmount: true, contractorId: true, status: true, documentStatus: true, issuedAt: true, isProforma: true } }),
        type === "purchase" ? prisma.expense.findMany({ where: { companyId: company.id, currency: transaction.currency, paymentStatus: "unpaid", totalGross: { lte: amount, gt: 0 }, ...(q.get("search") ? { number: { contains: q.get("search")!.slice(0, 100), mode: "insensitive" } } : {}) }, orderBy: { issueDate: "desc" }, take: 20, select: { id: true, number: true, updatedAt: true, totalGross: true, contractorName: true, nip: true } }) : Promise.resolve([]),
      ]);
      const contacts = await prisma.contractor.findMany({ where: { id: { in: invoices.map(invoice => invoice.contractorId) } }, select: { id: true, name: true, nip: true } });
      const contactMap = new Map(contacts.map(contact => [contact.id, contact]));
      const candidates = [
        ...invoices.filter(i => isAccountingInvoice(i) && (i.totalGross || 0) > (i.paidAmount || 0)).map(i => ({ id: i.id, kind: "invoice" as const, number: i.number, type, currency: i.currency, totalGross: i.totalGross || 0, paidAmount: i.paidAmount || 0, contractorName: contactMap.get(i.contractorId)?.name, contractorNip: contactMap.get(i.contractorId)?.nip || undefined })),
        ...expenses.map(e => ({ id: e.id, kind: "expense" as const, number: e.number, type: "purchase" as const, currency: transaction.currency, totalGross: e.totalGross, paidAmount: 0, contractorName: e.contractorName || undefined, contractorNip: e.nip || undefined })),
      ];
      const ranked = reconcile([{ date: transaction.bookingDate, amount: transaction.amount > 0 ? amount : -amount, currency: transaction.currency, title: transaction.description, senderName: transaction.counterpartyName || "", raw: "" }], candidates)[0].candidates;
      return json({ transaction: { ...transaction, ...balance }, candidates: candidates.map(candidate => {
        const remaining = (moneyCents(candidate.totalGross) - moneyCents(candidate.paidAmount)) / 100;
        const suggestion = ranked.find(item => item.id === candidate.id && item.kind === candidate.kind);
        return { id: candidate.id, kind: candidate.kind, number: candidate.number, documentRevision: candidate.kind === "invoice" ? String(invoices.find(invoice => invoice.id === candidate.id)!.version) : expenses.find(expense => expense.id === candidate.id)!.updatedAt.toISOString(), contractorName: candidate.contractorName, remaining, suggestedAmount: Math.min(remaining, amount), score: suggestion?.score || 0, signals: suggestion?.signals || [], overpayment: amount > remaining };
      }).sort((a, b) => b.score - a.score).slice(0, 20) });
    }
    const where = { ...scope, matchStatus: { in: PENDING_BANK_STATUSES } };
    const [rows, total] = await Promise.all([
      prisma.bankTransaction.findMany({ where: { ...where, ...(cursor ? { id: { lt: cursor } } : {}) }, select: { id: true, bookingDate: true, amount: true, allocatedAmount: true, currency: true, description: true, counterpartyName: true, matchSignals: true, matchStatus: true, updatedAt: true }, orderBy: { id: "desc" }, take: 31 }),
      prisma.bankTransaction.count({ where }),
    ]);
    return json({ transactions: rows.slice(0, 30).map(row => ({ ...row, ...bankBalance(row) })), nextCursor: rows.length > 30 ? rows[29].id : null, total });
  } catch (e) { return handleApiError(e); }
}
export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req); assertObjectId(body.transactionId);
    if (!["match", "ignore"].includes(String(body.action))) throw new ApiError(400, "Wybierz przypisanie lub pominięcie.");
    if (body.action === "match") { assertObjectId(body.documentId); if (!["invoice", "expense"].includes(String(body.kind))) throw new ApiError(400, "Wybierz dokument."); }
    if (body.documentRevision !== undefined && (typeof body.documentRevision !== "string" || !body.documentRevision || body.documentRevision.length > 80)) throw new ApiError(400, "Nieprawidłowa wersja dokumentu.");
    if (body.amount !== undefined) {
      try { if (typeof body.amount !== "number" || moneyCents(body.amount) <= 0) throw new Error("Podaj dodatnią kwotę przypisania."); }
      catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "Nieprawidłowa kwota."); }
    }
    const result = await prisma.$transaction(async tx => {
      const { company } = await companyWriteAccess(tx, user.id, body.companyId, "canRecordPayments");
      const transaction = await tx.bankTransaction.findFirst({ where: { id: body.transactionId as string, ...await bankTransactionScope(tx, company.id) } });
      if (!transaction) throw new ApiError(404, "Nie znaleziono transakcji.");
      if (!PENDING_BANK_STATUSES.includes(transaction.matchStatus) || transaction.updatedAt.toISOString() !== body.revision) throw new ApiError(409, "Transakcja zmieniła się lub jest już rozliczona. Odśwież listę.");
      if (body.action === "match" && transaction.matchSignals.includes("reversal")) throw new ApiError(400, "Storno nie jest zapłatą dokumentu. Sprawdź odwróconą operację z księgowością.");
      const balance = bankBalance(transaction);
      let amount = balance.available;
      if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "Nieprawidłowa kwota transakcji.");
      let paymentRecordId: string | undefined, number: string | undefined;
      if (body.action === "match" && body.kind === "invoice") {
        const invoice = await tx.invoice.findFirst({ where: { id: body.documentId as string, sellerCompanyId: company.id } });
        if (!invoice || !isAccountingInvoice(invoice) || invoice.isProforma || invoice.isCorrection || invoice.type !== (transaction.amount > 0 ? "sale" : "purchase") || invoice.currency !== transaction.currency) throw new ApiError(400, "Dokument nie odpowiada firmie, kierunkowi lub walucie transakcji.");
        if (body.documentRevision !== undefined && body.documentRevision !== String(invoice.version)) throw new ApiError(409, "Faktura zmieniła się. Otwórz podpowiedzi ponownie przed zatwierdzeniem.");
        const totalCents = moneyCents(invoice.totalGross || 0), previousCents = moneyCents(invoice.paidAmount || 0);
        try { amount = allocationAmount(balance.available, (totalCents - previousCents) / 100, body.amount); }
        catch (error) { throw new ApiError(409, error instanceof Error ? error.message : "Saldo dokumentu zmieniło się."); }
        const paidCents = previousCents + moneyCents(amount);
        await assertAccountingPeriodsOpen(tx, [{ companyId: company.id, issueDate: invoice.issueDate }]);
        const full = paidCents === totalCents;
        await tx.invoice.update({ where: { id: invoice.id, version: invoice.version }, data: { documentStatus: effectiveDocumentStatus(invoice), paidAmount: paidCents / 100, paymentStatus: full ? "paid" : "partially_paid", status: full ? "paid" : invoice.status, version: (invoice.version || 1) + 1 } });
        const payment = await tx.paymentRecord.create({ data: { userId: user.id, invoiceId: invoice.id, amount, method: "transfer", paidAt: new Date(transaction.bookingDate + "T12:00:00Z"), note: "Rozliczenie bankowe [" + transaction.id + "]: " + transaction.description.slice(0, 200) } });
        paymentRecordId = payment.id; number = invoice.number;
      } else if (body.action === "match") {
        const expense = await tx.expense.findFirst({ where: { id: body.documentId as string, companyId: company.id, paymentStatus: "unpaid" } });
        if (!expense || transaction.amount >= 0 || expense.currency !== transaction.currency) throw new ApiError(400, "Koszt wymaga zgodnej waluty i wypłaty.");
        if (body.documentRevision !== undefined && body.documentRevision !== expense.updatedAt.toISOString()) throw new ApiError(409, "Wydatek zmienił się. Otwórz podpowiedzi ponownie przed zatwierdzeniem.");
        try { amount = allocationAmount(balance.available, expense.totalGross, body.amount, true); }
        catch (error) { throw new ApiError(409, error instanceof Error ? error.message : "Koszt wymaga pełnej kwoty."); }
        await assertAccountingPeriodsOpen(tx, [{ companyId: company.id, issueDate: expense.issueDate }]);
        await tx.expense.update({ where: { id: expense.id, updatedAt: expense.updatedAt }, data: { paymentStatus: "paid", paidAt: new Date(transaction.bookingDate + "T12:00:00Z") } }); number = expense.number;
      }
      const allocated = body.action === "match" ? (moneyCents(balance.allocated) + moneyCents(amount)) / 100 : balance.allocated;
      const pendingAmount = (moneyCents(balance.total) - moneyCents(allocated)) / 100;
      const previousAllocations = Array.isArray(transaction.allocations) ? transaction.allocations as Prisma.InputJsonValue[] : [];
      if (body.action === "match" && previousAllocations.length >= 200 || transaction.allocations != null && !Array.isArray(transaction.allocations)) throw new ApiError(409, "Sprawdź historię rozliczeń tej transakcji z księgowością.");
      const allocation: BankAllocation = { documentId: String(body.documentId), kind: body.kind as BankAllocation["kind"], number: number || "", amount, ...(paymentRecordId ? { paymentRecordId } : {}), actorId: user.id, at: new Date().toISOString() };
      const updated = await tx.bankTransaction.update({ where: { id: transaction.id, updatedAt: transaction.updatedAt }, data: { allocatedAmount: allocated, matchStatus: body.action === "ignore" ? "ignored" : pendingAmount > 0 ? "partially_matched" : "manual", matchedAt: new Date(), updatedAt: new Date(Math.max(Date.now(), transaction.updatedAt.getTime() + 1)), ...(body.action === "match" ? { allocations: [...previousAllocations, allocation], matchedInvoiceId: body.kind === "invoice" ? body.documentId as string : null, matchedExpenseId: body.kind === "expense" ? body.documentId as string : null, matchedInvoiceNumber: number, paymentRecordId, matchConfidence: 1, matchSignals: ["manual"] } : {}) } });
      await recordAuditLog({ client: tx, companyId: company.id, userId: user.id, entityType: "bankTransaction", entityId: transaction.id, action: "bank.transaction." + body.action, details: { documentId: body.documentId, amount, currency: transaction.currency } });
      return { id: updated.id, status: updated.matchStatus, allocatedAmount: allocated, unallocatedAmount: pendingAmount, appliedAmount: body.action === "match" ? amount : 0 };
    }, { timeout: 30000 });
    return json(result);
  } catch (e) { return handleApiError(e); }
}
