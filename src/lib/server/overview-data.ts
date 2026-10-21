import "server-only";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { round2 } from "@/lib/format";
import { overviewPipeline, type OverviewRaw } from "@/lib/overview-aggregate";
import type { AccountingTask } from "@/lib/accounting-workspace";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { CompanyRole } from "@/lib/types";
import { bankTransactionScope } from "@/lib/banking/scope";
import { bankBalance, PENDING_BANK_STATUSES } from "@/lib/banking/allocation";

type Action = { id: string; kind: string; label: string; detail: string; href: string; priority: number };
type Money = { currency: string; net: number; vat: number; gross: number; count: number };
const normalizeMoney = (row: { net: number; vat: number; gross: number; count: number }, currency: string): Money =>
  ({ currency, net: round2(row.net), vat: round2(row.vat), gross: round2(row.gross), count: row.count });

/** Scoped MongoDB grouping shared by API and the authenticated server render. */
export async function readAuthorizedOverview(user: { id: string }, params: URLSearchParams) {
  const companyId = params.get("companyId");
  const selectedMonths = Number(params.get("months") || 6);
  if (![6, 12, 24].includes(selectedMonths)) throw new ApiError(400, "Nieprawidłowy okres raportu.");
  const { company, role } = await companyAccess(prisma, user.id, companyId);
  const member = await prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: company.id, userId: user.id } } });
  const canExport = role === "owner" || (member?.canExport ?? DEFAULT_ROLE_PERMISSIONS[role as CompanyRole].canExport);
  const canSendKsef = role === "owner" || (member?.canSendKsef ?? DEFAULT_ROLE_PERMISSIONS[role as CompanyRole].canSendKsef);
  const pendingBankWhere = bankTransactionScope(prisma, company.id).then(scope => ({ ...scope, matchStatus: { in: PENDING_BANK_STATUSES } }));
  const now = new Date();
  const today = now.toISOString().slice(0, 10), month = today.slice(0, 7);
  const months = Array.from({ length: selectedMonths }, (_, index) => {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - (selectedMonths - 1 - index));
    return date.toISOString().slice(0, 7);
  });
  const [raw, reviews, workspaces, queue, unmatchedCount, unmatched] = await Promise.all([
    prisma.invoice.aggregateRaw({ pipeline: overviewPipeline(company.id, today, months) }) as unknown as Promise<OverviewRaw[]>,
    canExport ? prisma.costReview.findMany({ where: { companyId: company.id, status: "pending" }, select: { id: true, number: true, steps: true, currentStep: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }) : Promise.resolve([]),
    canExport ? prisma.accountingWorkspace.findMany({ where: { companyId: company.id }, select: { id: true, month: true, items: true }, orderBy: { month: "desc" }, take: 3 }) : Promise.resolve([]),
    canSendKsef ? prisma.ksefQueueTask.findMany({ where: { invoice: { sellerCompanyId: company.id } }, select: {
      id: true, invoiceId: true, status: true, attempts: true, maxAttempts: true,
      environment: true, updatedAt: true, nextAttemptAt: true,
      invoice: { select: { number: true } },
    }, orderBy: { updatedAt: "desc" }, take: 20 }) : Promise.resolve([]),
    pendingBankWhere.then(where => prisma.bankTransaction.count({ where })),
    pendingBankWhere.then(where => prisma.bankTransaction.findMany({ where, select: { id: true, description: true, amount: true, allocatedAmount: true, matchStatus: true, currency: true, bookingDate: true }, orderBy: { bookingDate: "asc" }, take: 8 })),
  ]);
  const data = raw[0];
  const zero = { rejected: 0, uncertain: 0, overdue: 0, drafts: 0, offline: 0, missingUpo: 0 };
  const counts = { ...(data?.counts[0] || zero), reviews: 0, tasks: 0, unmatched: unmatchedCount };
  const actions: Action[] = [...(data?.actions || [])];
  for (const transaction of unmatched) actions.push({ id: "bank:" + transaction.id, kind: "Bank", label: transaction.description || "Transakcja bankowa", detail: transaction.bookingDate + " · do rozliczenia " + bankBalance(transaction).available.toFixed(2) + " " + transaction.currency, href: "/finances?transactionId=" + transaction.id, priority: 2 });
  for (const review of reviews) {
    const steps = Array.isArray(review.steps) ? review.steps as { userId?: string }[] : [];
    if (steps[review.currentStep]?.userId !== user.id) continue;
    counts.reviews++;
    actions.push({ id: `review:${review.id}`, kind: "Akceptacja", label: review.number, detail: "Twoja decyzja w obiegu kosztów", href: `/cost-reviews?reviewId=${review.id}`, priority: 1 });
  }
  for (const workspace of workspaces) {
    const tasks = Array.isArray(workspace.items) ? workspace.items as AccountingTask[] : [];
    for (const task of tasks) {
      if (task.done || task.assigneeId !== user.id) continue;
      counts.tasks++;
      actions.push({ id: `task:${workspace.id}:${task.id}`, kind: "Księgowość", label: task.title, detail: `Okres ${workspace.month}`, href: `/accountant?month=${workspace.month}`, priority: 2 });
    }
  }
  const byMonth = new Map<string, Money[]>();
  for (const row of data?.months || []) {
    const list = byMonth.get(row._id.month) || [];
    list.push(normalizeMoney(row, row._id.currency));
    byMonth.set(row._id.month, list);
  }
  const rateGroups = new Map<string, { rate: string; value: number }[]>();
  for (const row of data?.rates || []) {
    const list = rateGroups.get(row._id.currency) || [];
    list.push({ rate: row._id.rate, value: round2(row.value) });
    rateGroups.set(row._id.currency, list);
  }
  const contractors = new Map<string, { id: string; count: number; gross: number }[]>();
  for (const row of data?.contractors || []) {
    const list = contractors.get(row._id.currency) || [];
    list.push({ id: row._id.contractorId, count: row.count, gross: round2(row.gross) });
    contractors.set(row._id.currency, list);
  }
  const totalActions = counts.rejected + counts.uncertain + counts.overdue + counts.drafts + counts.offline + counts.missingUpo + counts.unmatched + counts.reviews + counts.tasks;
  const previousMonth = months.at(-2)!;
  const totals = (data?.totals || []).map(row => normalizeMoney(row, row._id)).sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    checkedAt: new Date().toISOString(), counts, actions: actions.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label)).slice(0, 8),
    actionTotal: totalActions, currencies: totals.map(row => row.currency), totals,
    currentMonth: byMonth.get(month) || [], previousMonth: byMonth.get(previousMonth) || [],
    months: months.map(key => ({ key, values: byMonth.get(key) || [] })),
    vatByRate: [...rateGroups].map(([currency, rates]) => ({ currency, rates })),
    statusCounts: (data?.status || []).map(row => ({ name: row._id, value: row.value })),
    contractors: [...contractors].map(([currency, rows]) => ({ currency, rows })),
    recent: data?.recent || [],
    onboardingDocument: data?.onboarding?.[0] ? { ...data.onboarding[0], companyId: company.id } : null,
    ksefQueue: queue.map(task => ({
      id: task.id, invoiceId: task.invoiceId, number: task.invoice.number,
      status: task.status, attempts: task.attempts, maxAttempts: task.maxAttempts,
      environment: task.environment, updatedAt: task.updatedAt.toISOString(),
      nextAttemptAt: task.nextAttemptAt?.toISOString() || null,
      guidance: task.status === "verify_needed" ? "Sprawdź stan dokumentu w KSeF przed ponowieniem."
        : task.status === "failed" ? "Otwórz fakturę i sprawdź błąd przed ponowieniem."
        : task.status === "completed" ? "Zakończono przetwarzanie."
        : "Zadanie oczekuje na przetworzenie.",
    })),
  };
}

export type OverviewData = Awaited<ReturnType<typeof readAuthorizedOverview>>;
