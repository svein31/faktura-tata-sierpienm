import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { parseStatement } from "@/lib/banking/statement-parser";
import { reconcile, type ReconciliationCandidate } from "@/lib/banking/reconciliation";
import { requireCompanyAccess } from "@/lib/permissions";
import { companyAccess } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { recordAuditLog } from "@/lib/audit";
import { isAccountingInvoice } from "@/lib/accountant-summary";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req);
    const content = String(body.content ?? body.csvContent ?? "").trim();
    if (!content) throw new ApiError(400, "Wybierz wyciąg bankowy.");
    if (body.applyPayments !== undefined && typeof body.applyPayments !== "boolean") throw new ApiError(400, "Nieprawidłowy tryb importu.");
    const companyId = body.companyId == null ? null : body.companyId;
    if (companyId !== null && !objectId(companyId)) throw new ApiError(400, "Wybierz poprawną firmę.");
    if (companyId) {
      const access = await requireCompanyAccess(user.id, companyId, body.applyPayments ? "canRecordPayments" : undefined);
      if (!access.ok) throw new ApiError(access.status, access.error);
    }
    let parsed;
    try { parsed = parseStatement(content, String(body.format || body.bankFormat || "")); }
    catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "Niepoprawny wyciąg."); }
    // Compatibility for older clients: only documents owned by the actor; every write still checks company permissions.
    const scope = companyId ? { sellerCompanyId: companyId } : { userId: user.id };
    const [invoices, costs] = await Promise.all([
      prisma.invoice.findMany({ where: { ...scope, paymentStatus: { in: ["unpaid", "partially_paid", "overdue"] } }, include: { sellerCompany: true } }),
      companyId ? prisma.expense.findMany({ where: { companyId, paymentStatus: "unpaid" } }) : Promise.resolve([]),
    ]);
    const posted = invoices.filter(i => isAccountingInvoice(i) && !i.isCorrection && !["proforma", "advance_final"].includes(i.documentKind || ""));
    const refs = new Set(posted.filter(i => i.type === "purchase").map(i => i.ksefNumber).filter(Boolean));
    const contractors = await prisma.contractor.findMany({ where: { id: { in: posted.map(i => i.contractorId) } } });
    const contactMap = new Map(contractors.map(c => [c.id, c]));
    const candidates: ReconciliationCandidate[] = posted.map(i => ({ id: i.id, kind: "invoice", number: i.number, type: i.type === "sale" ? "sale" : "purchase", currency: i.currency, totalGross: i.totalGross || 0, paidAmount: i.paidAmount || 0, contractorName: contactMap.get(i.contractorId)?.name, contractorNip: contactMap.get(i.contractorId)?.nip || undefined }));
    for (const e of costs) if (!e.ksefRefNumber || !refs.has(e.ksefRefNumber)) candidates.push({ id: e.id, kind: "expense", number: e.number, type: "purchase", currency: e.currency, totalGross: e.totalGross, paidAmount: 0, contractorName: e.contractorName, contractorNip: e.nip || undefined });
    const matched = reconcile(parsed.transactions, candidates), matchedCount = matched.filter(t => t.matchedInvoiceId || t.matchedExpenseId).length;
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const fileHash = hash((companyId || user.id) + "\0" + content);
    let appliedCount = 0, skippedCount = 0;
    if (body.applyPayments) {
      try {
        await prisma.$transaction(async tx => {
          let ownerId = user.id;
          if (companyId) {
            const access = await companyAccess(tx, user.id, companyId, "canRecordPayments");
            ownerId = access.company.userId;
            await tx.companyProfile.update({ where: { id: companyId }, data: { updatedAt: new Date() } });
          }
          await tx.bankStatementImport.create({ data: { userId: user.id, filename: String(body.filename || "wyciag").slice(0, 200), bankFormat: parsed.format, rowCount: matched.length, matchedCount, totalAmount: Math.round(matched.reduce((s, t) => s + t.amount, 0) * 100) / 100, fileHash } });
          const duplicates = new Map<string, number>();
          for (const item of matched) {
            const identity = hash(JSON.stringify([companyId || user.id, item.accountIban || "", item.externalReference || "", item.date, item.amount, item.currency, item.title, item.senderAccount || ""]));
            const occurrence = duplicates.get(identity) || 0; duplicates.set(identity, occurrence + 1);
            const externalId = item.externalReference ? identity : identity + ":" + occurrence;
            if (await tx.bankTransaction.findUnique({ where: { userId_externalId: { userId: ownerId, externalId } } })) { skippedCount++; continue; }
            let paymentRecordId: string | undefined;
            if (item.matchedInvoiceId) {
              const invoice = await tx.invoice.findFirst({ where: { id: item.matchedInvoiceId, ...scope } });
              if (!invoice || !isAccountingInvoice(invoice) || invoice.isCorrection || invoice.currency !== item.currency) throw new ApiError(409, "Dokument zmienił się od podglądu importu.");
              if (invoice.sellerCompanyId) await companyAccess(tx, user.id, invoice.sellerCompanyId, "canRecordPayments");
              else if (user.role === "viewer") throw new ApiError(403, "Brak uprawnień do rejestracji płatności.");
              await assertAccountingPeriodsOpen(tx, [{ companyId: invoice.sellerCompanyId, issueDate: invoice.issueDate }]);
              const amount = Math.abs(item.amount), paid = Math.round(((invoice.paidAmount || 0) + amount) * 100) / 100, total = invoice.totalGross || 0;
              if (paid > total || amount <= 0) throw new ApiError(409, "Kwota operacji przekracza saldo faktury. Zweryfikuj dopasowanie.");
              const full = Math.round(paid * 100) === Math.round(total * 100);
              const change = await tx.invoice.updateMany({ where: { id: invoice.id, version: invoice.version }, data: { paidAmount: paid, paymentStatus: full ? "paid" : "partially_paid", status: full ? "paid" : invoice.status, version: { increment: 1 } } });
              if (change.count !== 1) throw new ApiError(409, "Faktura zmieniła się podczas rozliczenia.");
              const payment = await tx.paymentRecord.create({ data: { userId: user.id, invoiceId: invoice.id, amount, method: "transfer", paidAt: new Date(item.date + "T12:00:00Z"), note: "Wyciąg: " + item.title.slice(0, 200) } });
              paymentRecordId = payment.id; appliedCount++;
              await recordAuditLog({ client: tx, companyId: invoice.sellerCompanyId, userId: user.id, userName: user.name, userEmail: user.email, entityType: "invoice", entityId: invoice.id, documentId: invoice.id, action: "bank_payment_applied", diff: { paidAmount: { old: invoice.paidAmount || 0, new: paid } }, details: { currency: item.currency, paymentRecordId } });
            } else if (item.matchedExpenseId) {
              const expense = await tx.expense.findFirst({ where: { id: item.matchedExpenseId, companyId, paymentStatus: "unpaid" } });
              if (!expense || expense.currency !== item.currency || Math.round(expense.totalGross * 100) !== Math.round(Math.abs(item.amount) * 100)) throw new ApiError(409, "Wydatek wymaga pełnej kwoty i aktualnego salda.");
              await assertAccountingPeriodsOpen(tx, [{ companyId: expense.companyId, issueDate: expense.issueDate }]);
              const change = await tx.expense.updateMany({ where: { id: expense.id, updatedAt: expense.updatedAt, paymentStatus: "unpaid" }, data: { paymentStatus: "paid", paidAt: new Date(item.date + "T12:00:00Z") } });
              if (change.count !== 1) throw new ApiError(409, "Wydatek zmienił się podczas rozliczenia.");
              appliedCount++;
              await recordAuditLog({ client: tx, companyId, userId: user.id, userName: user.name, entityType: "expense", entityId: expense.id, documentId: expense.id, action: "bank_payment_applied", diff: { paymentStatus: { old: "unpaid", new: "paid" } } });
            }
            await tx.bankTransaction.create({ data: { userId: ownerId, externalId, accountId: companyId, accountIban: item.accountIban, bookingDate: item.date, amount: item.amount, currency: item.currency, direction: item.amount > 0 ? "in" : "out", description: item.title, counterpartyName: item.senderName, counterpartyIban: item.senderAccount, source: parsed.format, matchStatus: item.matchedInvoiceId || item.matchedExpenseId ? "matched" : item.ambiguous ? "ambiguous" : "unmatched", matchedInvoiceId: item.matchedInvoiceId, matchedExpenseId: item.matchedExpenseId, matchedInvoiceNumber: item.matchedInvoiceNumber, matchConfidence: item.confidence === "exact" ? 1 : item.confidence === "high" ? .9 : 0, paymentRecordId } });
          }
        }, { timeout: 30000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError(409, "Ten wyciąg lub operacja zostały już zaimportowane.", "IMPORT_DUPLICATE");
        throw error;
      }
    }
    const totals: Record<string, number> = {};
    for (const item of matched) totals[item.currency] = Math.round(((totals[item.currency] || 0) + item.amount) * 100) / 100;
    return json({ transactions: matched, format: parsed.format, rowCount: matched.length, matchedCount, totalAmount: totals.PLN || 0, totals, appliedCount, skippedCount });
  } catch (error) { return handleApiError(error); }
}
