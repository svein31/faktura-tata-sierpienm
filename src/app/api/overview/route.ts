import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { round2 } from "@/lib/format";
import { overviewPipeline, type OverviewRaw } from "@/lib/overview-aggregate";
import type { AccountingTask } from "@/lib/accounting-workspace";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { CompanyRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = { id: string; kind: string; label: string; detail: string; href: string; priority: number };
type Money = { currency: string; net: number; vat: number; gross: number; count: number };
const normalizeMoney = (row: { net: number; vat: number; gross: number; count: number }, currency: string): Money =>
  ({ currency, net: round2(row.net), vat: round2(row.vat), gross: round2(row.gross), count: row.count });

/** Scoped MongoDB grouping: only bounded actions, top clients and summary buckets cross the API boundary. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams;
    const companyId = params.get("companyId");
    const selectedMonths = Number(params.get("months") || 6);
    if (![6, 12, 24].includes(selectedMonths)) throw new ApiError(400, "Nieprawidłowy okres raportu.");
    const { company, role } = await companyAccess(prisma, user.id, companyId);
    const member = await prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: company.id, userId: user.id } } });
    const canExport = role === "owner" || (member?.canExport ?? DEFAULT_ROLE_PERMISSIONS[role as CompanyRole].canExport);
    const canSendKsef = role === "owner" || (member?.canSendKsef ?? DEFAULT_ROLE_PERMISSIONS[role as CompanyRole].canSendKsef);
    const now = new Date();
    const today = now.toISOString().slice(0, 10), month = today.slice(0, 7);
    const months = Array.from({ length: selectedMonths }, (_, index) => {
      const date = new Date(`${month}-01T12:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - (selectedMonths - 1 - index));
      return date.toISOString().slice(0, 7);
    });
    const [raw, reviews, workspaces, queue] = await Promise.all([
      prisma.invoice.aggregateRaw({ pipeline: overviewPipeline(company.id, today, months) }) as unknown as Promise<OverviewRaw[]>,
      canExport ? prisma.costReview.findMany({ where: { companyId: company.id, status: "pending" }, select: { id: true, number: true, steps: true, currentStep: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }) : Promise.resolve([]),
      canExport ? prisma.accountingWorkspace.findMany({ where: { companyId: company.id }, select: { id: true, month: true, items: true }, orderBy: { month: "desc" }, take: 3 }) : Promise.resolve([]),
      canSendKsef ? prisma.ksefQueueTask.findMany({ where: { invoice: { sellerCompanyId: company.id } }, select: {
        id: true, invoiceId: true, status: true, attempts: true, maxAttempts: true,
        environment: true, updatedAt: true, nextAttemptAt: true,
        invoice: { select: { number: true } },
      }, orderBy: { updatedAt: "desc" }, take: 20 }) : Promise.resolve([]),
    ]);
    const data = raw[0], finance = data?.finance[0];
    const zero = { rejected: 0, uncertain: 0, overdue: 0, drafts: 0, offline: 0 };
    const counts = { ...(data?.counts[0] || zero), reviews: 0, tasks: 0 };
    const actions: Action[] = [...(data?.actions || [])];
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
    for (const row of finance?.months || []) {
      const list = byMonth.get(row._id.month) || [];
      list.push(normalizeMoney(row, row._id.currency));
      byMonth.set(row._id.month, list);
    }
    const rateGroups = new Map<string, { rate: string; value: number }[]>();
    for (const row of finance?.rates || []) {
      const list = rateGroups.get(row._id.currency) || [];
      list.push({ rate: row._id.rate, value: round2(row.value) });
      rateGroups.set(row._id.currency, list);
    }
    const contractors = new Map<string, { id: string; count: number; gross: number }[]>();
    for (const row of finance?.contractors || []) {
      const list = contractors.get(row._id.currency) || [];
      list.push({ id: row._id.contractorId, count: row.count, gross: round2(row.gross) });
      contractors.set(row._id.currency, list);
    }
    const totalActions = counts.rejected + counts.uncertain + counts.overdue + counts.drafts + counts.offline + counts.reviews + counts.tasks;
    const previousMonth = months.at(-2)!;
    const totals = (finance?.totals || []).map(row => normalizeMoney(row, row._id)).sort((a, b) => a.currency.localeCompare(b.currency));
    return json({
      checkedAt: new Date().toISOString(), counts, actions: actions.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label)).slice(0, 8),
      actionTotal: totalActions, currencies: totals.map(row => row.currency), totals,
      currentMonth: byMonth.get(month) || [], previousMonth: byMonth.get(previousMonth) || [],
      months: months.map(key => ({ key, values: byMonth.get(key) || [] })),
      vatByRate: [...rateGroups].map(([currency, rates]) => ({ currency, rates })),
      statusCounts: (finance?.status || []).map(row => ({ name: row._id, value: row.value })),
      contractors: [...contractors].map(([currency, rows]) => ({ currency, rows })),
      recent: data?.recent || [],
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
    });
  } catch (error) { return handleApiError(error); }
}
