import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { invoiceTotals, round2 } from "@/lib/format";
import type { Invoice } from "@/lib/types";
import type { AccountingTask } from "@/lib/accounting-workspace";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { CompanyRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = { id: string; kind: string; label: string; detail: string; href: string; priority: number };
type Money = { currency: string; net: number; vat: number; gross: number; count: number };

/** Small company-scoped response; invoice lines never leave the server. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const companyId = new URL(req.url).searchParams.get("companyId");
    const { company, role } = await companyAccess(prisma, user.id, companyId);
    const member = await prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: company.id, userId: user.id } } });
    const canExport = role === "owner" || (member?.canExport ?? DEFAULT_ROLE_PERMISSIONS[role as CompanyRole].canExport);
    const canSendKsef = role === "owner" || (member?.canSendKsef ?? DEFAULT_ROLE_PERMISSIONS[role as CompanyRole].canSendKsef);
    const [invoices, reviews, workspaces, queue] = await Promise.all([
      prisma.invoice.findMany({ where: { sellerCompanyId: company.id }, select: {
        id: true, number: true, type: true, status: true, documentStatus: true,
        issueDate: true, dueDate: true, currency: true, lines: true, totalNet: true,
        totalVat: true, totalGross: true, contractorId: true, isProforma: true,
        ksefStatus: true, ksefNumber: true, isOffline: true, paymentStatus: true,
      } }),
      canExport ? prisma.costReview.findMany({ where: { companyId: company.id, status: "pending" }, select: { id: true, number: true, steps: true, currentStep: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }) : Promise.resolve([]),
      canExport ? prisma.accountingWorkspace.findMany({ where: { companyId: company.id }, select: { id: true, month: true, items: true }, orderBy: { month: "desc" }, take: 3 }) : Promise.resolve([]),
      canSendKsef ? prisma.ksefQueueTask.findMany({ where: { invoice: { sellerCompanyId: company.id } }, select: {
        id: true, invoiceId: true, status: true, attempts: true, maxAttempts: true,
        environment: true, updatedAt: true, nextAttemptAt: true,
        invoice: { select: { number: true } },
      }, orderBy: { updatedAt: "desc" }, take: 20 }) : Promise.resolve([]),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const previous = new Date(`${month}-01T12:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    const previousMonth = previous.toISOString().slice(0, 7);
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(`${month}-01T12:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - (5 - index));
      return date.toISOString().slice(0, 7);
    });
    const totals = new Map<string, Money>();
    const byMonth = new Map<string, Map<string, Money>>();
    const vatByRate = new Map<string, Map<string, number>>();
    const byContractor = new Map<string, Map<string, { count: number; gross: number }>>();
    const statusCounts = new Map<string, number>();
    const actions: Action[] = [];
    const counts = { rejected: 0, uncertain: 0, overdue: 0, drafts: 0, offline: 0, reviews: 0, tasks: 0 };
    const recent = [...invoices].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5).map(i => ({ id: i.id, number: i.number, currency: i.currency, gross: i.totalGross, issueDate: i.issueDate }));
    const addAction = (action: Action) => { actions.push(action); };

    for (const i of invoices) {
      const href = `/invoices/${i.id}`;
      if (i.ksefStatus === "rejected") { counts.rejected++; addAction({ id: `rejected:${i.id}`, kind: "KSeF", label: `Odrzucono ${i.number}`, detail: "Sprawdź dokument i powód odrzucenia", href, priority: 0 }); }
      if (i.ksefStatus === "verify_needed") { counts.uncertain++; addAction({ id: `uncertain:${i.id}`, kind: "KSeF", label: `Sprawdź wynik ${i.number}`, detail: "Zweryfikuj stan w KSeF przed ponowieniem", href, priority: 0 }); }
      if (i.isOffline && !i.ksefNumber && i.ksefStatus !== "accepted") { counts.offline++; addAction({ id: `offline:${i.id}`, kind: "Offline", label: `Do wysłania: ${i.number}`, detail: "Dokument utworzony offline", href, priority: 1 }); }
      if (i.status === "draft" || i.documentStatus === "draft") { counts.drafts++; addAction({ id: `draft:${i.id}`, kind: "Szkic", label: i.number, detail: "Dokończ dokument", href, priority: 3 }); }
      if (i.type === "sale" && i.status !== "draft" && i.status !== "paid" && i.paymentStatus !== "paid" && i.dueDate && i.dueDate < today) {
        counts.overdue++; addAction({ id: `overdue:${i.id}`, kind: "Po terminie", label: i.number, detail: `Termin: ${i.dueDate}`, href, priority: 2 });
      }
      if (i.type !== "sale" || i.status === "draft" || i.isProforma) continue;
      const computed = invoiceTotals({ lines: (Array.isArray(i.lines) ? i.lines : []) as unknown as Invoice["lines"] });
      // Historical totals can be absent; currency buckets are never summed together.
      const money = { currency: i.currency, net: i.totalNet || computed.net, vat: i.totalVat || computed.vat, gross: i.totalGross || computed.gross, count: 1 };
      const accumulate = (map: Map<string, Money>, key: string) => {
        const old = map.get(key) || { currency: i.currency, net: 0, vat: 0, gross: 0, count: 0 };
        map.set(key, { currency: i.currency, net: round2(old.net + money.net), vat: round2(old.vat + money.vat), gross: round2(old.gross + money.gross), count: old.count + 1 });
      };
      accumulate(totals, i.currency);
      const invoiceMonth = i.issueDate.slice(0, 7);
      if (!byMonth.has(invoiceMonth)) byMonth.set(invoiceMonth, new Map());
      accumulate(byMonth.get(invoiceMonth)!, i.currency);
      if (!vatByRate.has(i.currency)) vatByRate.set(i.currency, new Map());
      const vat = vatByRate.get(i.currency)!;
      for (const [rate, amount] of Object.entries(computed.vatByRate)) vat.set(rate, round2((vat.get(rate) || 0) + amount));
      if (!byContractor.has(i.currency)) byContractor.set(i.currency, new Map());
      const clients = byContractor.get(i.currency)!;
      const client = clients.get(i.contractorId) || { count: 0, gross: 0 };
      clients.set(i.contractorId, { count: client.count + 1, gross: round2(client.gross + money.gross) });
      const status = i.ksefStatus === "rejected" ? "KSeF: odrzucona" : i.paymentStatus === "paid" || i.status === "paid" ? "Opłacona" : i.dueDate && i.dueDate < today ? "Po terminie" : "Wystawiona";
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    }

    for (const r of reviews) {
      const steps = Array.isArray(r.steps) ? r.steps as { userId?: string }[] : [];
      if (steps[r.currentStep]?.userId !== user.id) continue;
      counts.reviews++;
      addAction({ id: `review:${r.id}`, kind: "Akceptacja", label: r.number, detail: "Twoja decyzja w obiegu kosztów", href: `/cost-reviews?reviewId=${r.id}`, priority: 1 });
    }
    for (const workspace of workspaces) {
      const tasks = Array.isArray(workspace.items) ? workspace.items as AccountingTask[] : [];
      for (const task of tasks) {
        if (task.done || task.assigneeId !== user.id) continue;
        counts.tasks++;
        addAction({ id: `task:${workspace.id}:${task.id}`, kind: "Księgowość", label: task.title, detail: `Okres ${workspace.month}`, href: `/accountant?month=${workspace.month}`, priority: 2 });
      }
    }
    const ksefQueue = queue.map(task => ({
      id: task.id, invoiceId: task.invoiceId, number: task.invoice.number,
      status: task.status, attempts: task.attempts, maxAttempts: task.maxAttempts,
      environment: task.environment, updatedAt: task.updatedAt.toISOString(),
      nextAttemptAt: task.nextAttemptAt?.toISOString() || null,
      guidance: task.status === "verify_needed" ? "Sprawdź stan dokumentu w KSeF przed ponowieniem."
        : task.status === "failed" ? "Otwórz fakturę i sprawdź błąd przed ponowieniem."
        : task.status === "completed" ? "Zakończono przetwarzanie."
        : "Zadanie oczekuje na przetworzenie.",
    }));
    return json({
      checkedAt: new Date().toISOString(), counts,
      actions: actions.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label)).slice(0, 8),
      actionTotal: actions.length,
      currencies: [...totals.keys()].sort(),
      totals: [...totals.values()],
      currentMonth: [...(byMonth.get(month)?.values() || [])],
      previousMonth: [...(byMonth.get(previousMonth)?.values() || [])],
      months: months.map(key => ({ key, values: [...(byMonth.get(key)?.values() || [])] })),
      vatByRate: [...vatByRate].map(([currency, rates]) => ({ currency, rates: [...rates].map(([rate, value]) => ({ rate, value })) })),
      statusCounts: [...statusCounts].map(([name, value]) => ({ name, value })),
      contractors: [...byContractor].map(([currency, clients]) => ({ currency, rows: [...clients].sort((a, b) => b[1].gross - a[1].gross).slice(0, 8).map(([id, value]) => ({ id, ...value })) })),
      recent, ksefQueue,
    });
  } catch (error) { return handleApiError(error); }
}
