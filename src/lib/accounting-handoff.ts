import type { Prisma } from "@prisma/client";
import { isAccountingInvoice } from "@/lib/accountant-summary";
import { accountingWorkspaceId, type AccountingTask } from "@/lib/accounting-workspace";

export type HandoffItem = { id: string; label: string; href: string };
export type AccountingHandoff = {
  missing: { count: number; items: HandoffItem[] };
  inbox: { count: number; items: HandoffItem[] };
  unsettled: { count: number; items: HandoffItem[] };
  sources: { count: number; items: HandoffItem[] };
};
/** Advisory preparation only. Does not change accounting eligibility, amounts or closing rules. */
export async function readAccountingHandoff(tx: Prisma.TransactionClient, companyId: string, month: string): Promise<AccountingHandoff> {
  const workspaceId = accountingWorkspaceId(companyId, month);
  const start = new Date(`${month}-01T00:00:00Z`), end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const inboxWhere = { companyId, createdAt: { gte: start, lt: end }, status: { notIn: ["converted", "rejected"] } };
  const [invoices, expenses, workspace, inbox, inboxCount] = await Promise.all([
    tx.invoice.findMany({ where: { sellerCompanyId: companyId, issueDate: { startsWith: `${month}-` } }, select: { id: true, number: true, currency: true, type: true, status: true, documentStatus: true, isProforma: true, issuedAt: true, paymentStatus: true, ksefNumber: true } }),
    tx.expense.findMany({ where: { companyId, issueDate: { startsWith: `${month}-` } }, select: { id: true, number: true, paymentStatus: true, scanId: true, attachmentUrl: true, ksefRefNumber: true } }),
    tx.accountingWorkspace.findUnique({ where: { id: workspaceId }, select: { items: true } }),
    tx.expenseScan.findMany({ where: inboxWhere, select: { id: true, fileName: true }, orderBy: { id: "asc" }, take: 10 }),
    tx.expenseScan.count({ where: inboxWhere }),
  ]);
  const posted = invoices.filter(isAccountingInvoice), purchaseRefs = new Set(posted.filter(i => i.type === "purchase").map(i => i.ksefNumber).filter(Boolean));
  const uniqueExpenses = expenses.filter(e => !e.ksefRefNumber || !purchaseRefs.has(e.ksefRefNumber));
  const missing = ((workspace?.items || []) as unknown as AccountingTask[]).filter(item => item.kind === "missing" && !item.done);
  const unpaidInvoices = posted.filter(i => i.paymentStatus !== "paid" && i.status !== "paid");
  const unpaidExpenses = uniqueExpenses.filter(e => e.paymentStatus !== "paid");
  const sources = uniqueExpenses.filter(e => !e.scanId && !e.attachmentUrl && !e.ksefRefNumber);
  return {
    missing: { count: missing.length, items: missing.slice(0, 10).map(item => ({ id: item.id, label: item.title, href: `/accountant?month=${month}#monthly-tasks` })) },
    inbox: { count: inboxCount, items: inbox.map(item => ({ id: item.id, label: item.fileName || "Dokument bez nazwy", href: `/documents?document=${item.id}` })) },
    unsettled: { count: unpaidInvoices.length + unpaidExpenses.length, items: [...unpaidInvoices.map(i => ({ id: i.id, label: i.number, href: `/invoices/${i.id}` })), ...unpaidExpenses.map(e => ({ id: e.id, label: e.number, href: `/expenses?expenseId=${e.id}` }))].slice(0, 10) },
    sources: { count: sources.length, items: sources.slice(0, 10).map(e => ({ id: e.id, label: e.number, href: `/expenses?expenseId=${e.id}` })) },
  };
}
