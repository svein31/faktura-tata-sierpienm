import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ApiError, cleanStr } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { periodKeys } from "@/lib/accounting-period";
import { accountingWorkspaceId, type AccountingTask } from "@/lib/accounting-workspace";
import { isAccountingInvoice, monthlySummary } from "@/lib/accountant-summary";
import { recordAuditLog } from "@/lib/audit";

export function accountingPeriodKey(companyId: string, month: unknown) {
  accountingWorkspaceId(companyId, month); // validates the whole month, not a prefix
  return periodKeys([{ companyId, issueDate: `${month}-01` }])[0];
}

export async function accountingReadiness(tx: Prisma.TransactionClient, companyId: string, month: string) {
  const [invoices, expenses, workspace, stocktakings] = await Promise.all([
    tx.invoice.findMany({ where: { sellerCompanyId: companyId, issueDate: { startsWith: `${month}-` } }, select: { id: true, type: true, status: true, documentStatus: true, isProforma: true, approvalStatus: true, ksefStatus: true, referenceNumber: true, ksefNumber: true, currency: true, totalNet: true, totalVat: true, totalGross: true } }),
    tx.expense.findMany({ where: { companyId, issueDate: { startsWith: `${month}-` } }, select: { workflowStatus: true, ksefRefNumber: true, currency: true, totalNet: true, totalVat: true, totalGross: true } }),
    tx.accountingWorkspace.findUnique({ where: { id: accountingWorkspaceId(companyId, month) }, select: { items: true } }),
    tx.stocktaking.count({ where: { warehouse: { companyId }, countDate: { startsWith: `${month}-` }, status: { in: ["open", "counting"] } } }),
  ]);
  const active = invoices.filter(i => !i.isProforma && i.documentStatus !== "cancelled" && i.status !== "cancelled");
  const posted = active.filter(isAccountingInvoice);
  const purchases = posted.filter(i => i.type === "purchase");
  const refs = new Set(purchases.map(i => i.ksefNumber).filter(Boolean));
  const uniqueExpenses = expenses.filter(e => !e.ksefRefNumber || !refs.has(e.ksefRefNumber));
  const costs = [...purchases, ...uniqueExpenses], sales = posted.filter(i => i.type === "sale");
  const currencies = [...new Set([...sales, ...costs].map(i => i.currency))].sort();
  const blockers = {
    drafts: active.filter(i => i.documentStatus === "draft" || i.status === "draft").length,
    ksef: active.filter(i => ["queued", "sending", "verify_needed", "rejected"].includes(i.ksefStatus || "") || i.documentStatus === "ready" || i.documentStatus === "rejected" || (!!i.referenceNumber && !i.ksefNumber)).length,
    purchases: purchases.filter(i => i.approvalStatus !== "approved").length,
    expenses: expenses.filter(e => !["verified", "sent_to_accountant"].includes(e.workflowStatus)).length,
    tasks: ((workspace?.items || []) as unknown as AccountingTask[]).filter(i => !i.done).length,
    stocktakings,
  };
  return { blockers, canClose: Object.values(blockers).every(n => n === 0), summary: currencies.map(currency => ({ currency, ...monthlySummary(sales, costs, currency) })) };
}

/** Caller supplies the same transaction used for the period mutex, readiness check and immutable event. */
export async function changeAccountingPeriod(tx: Prisma.TransactionClient, actor: { id: string; name?: string | null; email?: string | null }, body: Record<string, unknown>) {
  const { company, role } = await companyAccess(tx, actor.id, body.companyId, "canExport");
  if (!["close", "reopen"].includes(String(body.action))) throw new ApiError(400, "Wybierz zamknięcie lub ponowne otwarcie.");
  if (role !== "owner" && (role !== "accountant" || body.action === "reopen")) throw new ApiError(403, "Okres zamyka właściciel lub księgowość. Ponowne otwarcie wymaga właściciela.");
  const reason = cleanStr(body.reason, 1000, "uzasadnienie");
  if (!reason) throw new ApiError(400, "Podaj uzasadnienie zmiany okresu.");
  const key = accountingPeriodKey(company.id, body.month);
  const current = await tx.accountingPeriod.upsert({ where: { id: key.id }, create: { ...key, operationKey: randomUUID() }, update: { operationKey: randomUUID() } });
  if (current.version !== body.version) throw new ApiError(409, "Stan miesiąca został zmieniony. Odśwież dane.");
  const status = body.action === "close" ? "closed" : "open";
  if (current.status !== (body.action === "close" ? "open" : "closed")) throw new ApiError(409, "Miesiąc nie ma stanu wymaganego dla tej operacji.");
  const readiness = await accountingReadiness(tx, company.id, key.month);
  if (body.action === "close" && !readiness.canClose) throw new ApiError(409, "Najpierw zakończ zadania, akceptację kosztów i obsługę faktur oczekujących na rozstrzygnięcie.");
  const period = await tx.accountingPeriod.update({ where: { id: key.id, version: current.version }, data: { status, version: { increment: 1 }, closedAt: status === "closed" ? new Date() : null, closedBy: status === "closed" ? actor.id : null } });
  const event = await tx.accountingPeriodEvent.create({ data: { periodId: key.id, companyId: company.id, userId: actor.id, authorName: actor.name || actor.email || "Użytkownik", action: String(body.action), reason, version: period.version, snapshot: readiness } });
  await recordAuditLog({ client: tx, companyId: company.id, userId: actor.id, userName: actor.name, userEmail: actor.email, action: `accountant.period.${body.action}`, entityType: "accountingPeriod", entityId: key.id, details: { month: key.month, reason, version: period.version, eventId: event.id, snapshot: readiness } });
  return { period, readiness };
}
