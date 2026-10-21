import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { parseStatement } from "@/lib/banking/statement-parser";
import { reconcile, type ReconciliationCandidate } from "@/lib/banking/reconciliation";
import { requireCompanyAccess } from "@/lib/permissions";
import { companyAccess, companyWriteAccess, fenceCompanyWrite } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { recordAuditLog } from "@/lib/audit";
import { isAccountingInvoice } from "@/lib/accountant-summary";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { allocationAmount, moneyCents } from "@/lib/banking/allocation";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req);
    const content = String(body.content ?? body.csvContent ?? "").trim();
    if (!content) throw new ApiError(400, "Wybierz wyciąg bankowy.");
    if (body.applyPayments !== undefined && typeof body.applyPayments !== "boolean") throw new ApiError(400, "Nieprawidłowy tryb importu.");
    if (body.reviewMode !== undefined && typeof body.reviewMode !== "boolean") throw new ApiError(400, "Nieprawidłowy tryb podglądu.");
    const companyId = body.companyId == null ? null : body.companyId;
    if (companyId !== null && !objectId(companyId)) throw new ApiError(400, "Wybierz poprawną firmę.");
    if (companyId) {
      const access = await requireCompanyAccess(user.id, companyId, body.applyPayments ? "canRecordPayments" : undefined);
      if (!access.ok) throw new ApiError(access.status, access.error);
    }
    let parsed;
    try { parsed = parseStatement(content, String(body.format || body.bankFormat || "")); }
    catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "Niepoprawny wyciąg."); }
    if (companyId && parsed.transactions.some(t => t.accountIban)) {
      const accounts = await prisma.companyBankAccount.findMany({ where: { companyId }, select: { accountNumber: true } });
      const company = await prisma.companyProfile.findUnique({ where: { id: companyId }, select: { bankAccount: true } });
      const normalizeAccount = (v: string) => v.replace(/\s/g, "").replace(/^PL/i, "");
      const ownAccounts = new Set([...accounts.map(a => a.accountNumber), company?.bankAccount || ""].filter(Boolean).map(normalizeAccount));
      if (parsed.transactions.some(t => t.accountIban && !ownAccounts.has(normalizeAccount(t.accountIban)))) throw new ApiError(400, "Rachunek wyciągu nie należy do wybranej firmy. Dodaj go w ustawieniach firmy.");
    }
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
    const candidates: ReconciliationCandidate[] = posted.map(i => ({ id: i.id, kind: "invoice", number: i.number, type: i.type === "sale" ? "sale" : "purchase", currency: i.currency, totalGross: i.totalGross || 0, paidAmount: i.paidAmount || 0, documentRevision: String(i.version), contractorName: contactMap.get(i.contractorId)?.name, contractorNip: contactMap.get(i.contractorId)?.nip || undefined }));
    for (const e of costs) if (!e.ksefRefNumber || !refs.has(e.ksefRefNumber)) candidates.push({ id: e.id, kind: "expense", number: e.number, type: "purchase", currency: e.currency, totalGross: e.totalGross, paidAmount: 0, documentRevision: e.updatedAt.toISOString(), contractorName: e.contractorName, contractorNip: e.nip || undefined });
    const matched = reconcile(parsed.transactions, candidates, body.reviewMode === true || body.selections !== undefined), matchedCount = matched.filter(t => t.matchedInvoiceId || t.matchedExpenseId).length;
    type Selection = { transactionId: string; documentId: string; documentRevision: string; kind: "invoice" | "expense"; amount: number };
    const selections = body.selections === undefined ? null : new Map<string, Selection>();
    if (selections) {
      if (!companyId || !Array.isArray(body.selections) || body.selections.length > matched.length) throw new ApiError(400, "Nieprawidłowa lista zatwierdzonych dopasowań.");
      for (const value of body.selections) {
        const selected = value as Partial<Selection> | null;
        if (!selected || typeof selected.transactionId !== "string" || selections.has(selected.transactionId) || !matched.some(item => item.id === selected.transactionId && !item.reversal) || !objectId(selected.documentId) || !["invoice", "expense"].includes(String(selected.kind)) || typeof selected.amount !== "number" || typeof selected.documentRevision !== "string" || !selected.documentRevision || selected.documentRevision.length > 80) throw new ApiError(400, "Nieprawidłowe zatwierdzone dopasowanie.");
        try { if (moneyCents(selected.amount) <= 0) throw new Error("Kwota musi być dodatnia."); }
        catch { throw new ApiError(400, "Kwota przypisania musi być dodatnia i podana z dokładnością do grosza."); }
        selections.set(selected.transactionId, selected as Selection);
      }
    }
    const confirmed = matched.map(item => selections ? { ...item,
      matchedInvoiceId: selections.get(item.id)?.kind === "invoice" ? selections.get(item.id)!.documentId : undefined,
      matchedExpenseId: selections.get(item.id)?.kind === "expense" ? selections.get(item.id)!.documentId : undefined,
    } : item);
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
            await fenceCompanyWrite(tx, companyId);
          }
          await tx.bankStatementImport.create({ data: { userId: user.id, filename: String(body.filename || "wyciag").slice(0, 200), bankFormat: parsed.format, rowCount: matched.length, matchedCount, totalAmount: Math.round(matched.reduce((s, t) => s + t.amount, 0) * 100) / 100, fileHash } });
          const duplicates = new Map<string, number>();
          for (const item of confirmed) {
            const identity = hash(JSON.stringify(item.externalReference ? [companyId || user.id, item.accountIban || "", item.externalReference, ...(item.reversal ? ["reversal"] : [])] : [companyId || user.id, item.accountIban || "", item.date, item.amount, item.currency, item.title, item.senderAccount || ""]));
            const occurrence = duplicates.get(identity) || 0; duplicates.set(identity, occurrence + 1);
            const externalId = item.externalReference ? identity : identity + ":" + occurrence;
            if (await tx.bankTransaction.findUnique({ where: { userId_externalId: { userId: ownerId, externalId } } })) { skippedCount++; continue; }
            let paymentRecordId: string | undefined, allocated = 0, documentNumber: string | undefined;
            if (item.matchedInvoiceId) {
              const invoice = await tx.invoice.findFirst({ where: { id: item.matchedInvoiceId, ...scope } });
              if (!invoice || !isAccountingInvoice(invoice) || invoice.isCorrection || ["proforma", "advance_final"].includes(invoice.documentKind || "") || invoice.type !== (item.amount > 0 ? "sale" : "purchase") || invoice.currency !== item.currency) throw new ApiError(409, "Dokument zmienił się od podglądu importu.");
              if (selections && selections.get(item.id)!.documentRevision !== String(invoice.version)) throw new ApiError(409, "Faktura zmieniła się od podglądu. Wczytaj propozycje ponownie.");
              if (invoice.sellerCompanyId) await (companyId ? companyAccess : companyWriteAccess)(tx, user.id, invoice.sellerCompanyId, "canRecordPayments");
              else if (user.role === "viewer") throw new ApiError(403, "Brak uprawnień do rejestracji płatności.");
              await assertAccountingPeriodsOpen(tx, [{ companyId: invoice.sellerCompanyId, issueDate: invoice.issueDate }]);
              const total = invoice.totalGross || 0;
              let amount: number;
              try { amount = allocationAmount(Math.abs(item.amount), (moneyCents(total) - moneyCents(invoice.paidAmount || 0)) / 100, selections?.get(item.id)?.amount); }
              catch { throw new ApiError(409, "Kwota operacji przekracza saldo faktury lub saldo zmieniło się od podglądu. Zweryfikuj dopasowanie."); }
              const paid = (moneyCents(invoice.paidAmount || 0) + moneyCents(amount)) / 100;
              const full = Math.round(paid * 100) === Math.round(total * 100);
              const change = await tx.invoice.updateMany({ where: { id: invoice.id, version: invoice.version }, data: { paidAmount: paid, paymentStatus: full ? "paid" : "partially_paid", status: full ? "paid" : invoice.status, version: { increment: 1 } } });
              if (change.count !== 1) throw new ApiError(409, "Faktura zmieniła się podczas rozliczenia.");
              const payment = await tx.paymentRecord.create({ data: { userId: user.id, invoiceId: invoice.id, amount, method: "transfer", paidAt: new Date(item.date + "T12:00:00Z"), note: "Wyciąg: " + item.title.slice(0, 200) } });
              paymentRecordId = payment.id; allocated = amount; documentNumber = invoice.number; appliedCount++;
              await recordAuditLog({ client: tx, companyId: invoice.sellerCompanyId, userId: user.id, userName: user.name, userEmail: user.email, entityType: "invoice", entityId: invoice.id, documentId: invoice.id, action: "bank_payment_applied", diff: { paidAmount: { old: invoice.paidAmount || 0, new: paid } }, details: { currency: item.currency, paymentRecordId } });
            } else if (item.matchedExpenseId) {
              const expense = await tx.expense.findFirst({ where: { id: item.matchedExpenseId, companyId, paymentStatus: "unpaid" } });
              if (!expense || item.amount >= 0 || expense.currency !== item.currency) throw new ApiError(409, "Wydatek wymaga zgodnej waluty i wypłaty.");
              if (selections && selections.get(item.id)!.documentRevision !== expense.updatedAt.toISOString()) throw new ApiError(409, "Wydatek zmienił się od podglądu. Wczytaj propozycje ponownie.");
              try { allocated = allocationAmount(Math.abs(item.amount), expense.totalGross, selections?.get(item.id)?.amount, true); }
              catch { throw new ApiError(409, "Wydatek wymaga pełnej kwoty i aktualnego salda."); }
              documentNumber = expense.number;
              await assertAccountingPeriodsOpen(tx, [{ companyId: expense.companyId, issueDate: expense.issueDate }]);
              const change = await tx.expense.updateMany({ where: { id: expense.id, updatedAt: expense.updatedAt, paymentStatus: "unpaid" }, data: { paymentStatus: "paid", paidAt: new Date(item.date + "T12:00:00Z") } });
              if (change.count !== 1) throw new ApiError(409, "Wydatek zmienił się podczas rozliczenia.");
              appliedCount++;
              await recordAuditLog({ client: tx, companyId, userId: user.id, userName: user.name, entityType: "expense", entityId: expense.id, documentId: expense.id, action: "bank_payment_applied", diff: { paymentStatus: { old: "unpaid", new: "paid" } } });
            }
            const hasMatch = Boolean(item.matchedInvoiceId || item.matchedExpenseId);
            await tx.bankTransaction.create({ data: { userId: ownerId, externalId, accountId: companyId, accountIban: item.accountIban, bookingDate: item.date, amount: item.amount, allocatedAmount: allocated,
              ...(hasMatch ? { allocations: [{ documentId: item.matchedInvoiceId || item.matchedExpenseId!, kind: item.matchedInvoiceId ? "invoice" : "expense", number: documentNumber || "", amount: allocated, ...(paymentRecordId ? { paymentRecordId } : {}), actorId: user.id, at: new Date().toISOString() }] } : {}),
              currency: item.currency, direction: item.amount > 0 ? "in" : "out", description: item.title, counterpartyName: item.senderName, counterpartyIban: item.senderAccount, source: parsed.format, matchSignals: item.reversal ? ["reversal"] : hasMatch ? ["confirmed"] : [], matchCandidates: item.candidates,
              matchStatus: hasMatch ? moneyCents(allocated) < Math.abs(moneyCents(item.amount)) ? "partially_matched" : "matched" : item.ambiguous ? "ambiguous" : "unmatched", matchedInvoiceId: item.matchedInvoiceId, matchedExpenseId: item.matchedExpenseId, matchedInvoiceNumber: documentNumber, matchConfidence: hasMatch ? 1 : 0, paymentRecordId } });
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
