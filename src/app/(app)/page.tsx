"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  Circle,
  FileText,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useAppStore, effectiveStatus, STATUS_META, getContractor } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMoney, invoiceTotals, monthKey, monthLabel } from "@/lib/format";
import { CHART_COLORS } from "@/components/charts";
import { todayISO } from "@/lib/utils";
import { EMPTY_COMPANY } from "@/lib/types";
import type { EffectiveStatus } from "@/lib/store";

const RevenueAreaChart = dynamic(
  () => import("@/components/charts").then((m) => m.RevenueAreaChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[260px] w-full rounded-xl" />,
  }
);

const StatusPieChart = dynamic(
  () => import("@/components/charts").then((m) => m.StatusPieChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[240px] w-full rounded-xl" />,
  }
);

const TopContractorsBar = dynamic(
  () => import("@/components/charts").then((m) => m.TopContractorsBar),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[240px] w-full rounded-xl" />,
  }
);

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
  delay,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "indigo" | "emerald" | "red" | "sky" | "amber";
  delay: number;
  tooltip?: string;
}) {
  const tones = {
    indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.06, duration: 0.35 }}
    >
      <Card className="border-border/50 bg-card/60 backdrop-blur-md rounded-2xl shadow-xs">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
                {tooltip && <InfoTooltip text={tooltip} />}
              </div>
              <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums text-foreground">{value}</p>
              {sub && <p className="mt-1 text-[11.5px] text-muted-foreground">{sub}</p>}
            </div>
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { invoices, contractors, company, companies, ksef } = useAppStore();
  const today = todayISO();
  const companySafe = company ?? EMPTY_COMPANY;
  const ksefSafe = ksef ?? { environment: "demo" as const, tokenSet: false, tokenMask: "", certName: "", autoValidate: true };

  const hasCompany = Boolean(
    companies.length > 0 ||
    (companySafe.companyName || companySafe.name)?.trim().length
  );
  const hasKsef = Boolean(ksefSafe.tokenSet || ksefSafe.environment === "production" || ksefSafe.environment === "test");
  const hasInvoices = invoices.length > 0;

  if (invoices.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Pulpit</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Podsumowanie finansowe i status e-Faktur</p>
          </div>
          <Link
            href="/invoices/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
          >
            <Plus className="h-4 w-4" /> Wystaw fakturę
          </Link>
        </div>

        {/* Minimalist Apple Empty State */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-md p-8 sm:p-12 text-center rounded-2xl shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Witaj w Fakturo</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground leading-relaxed">
            Wystawiaj dokumenty w formacie FA(3), pobieraj dane z GUS w 1 kliknięcie i wysyłaj faktury bezpośrednio do KSeF.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/invoices/new"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              <Plus className="h-4 w-4" /> Wystaw pierwszą fakturę
            </Link>
            <Link
              href="/settings/companies"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-4 text-xs font-medium text-foreground transition-all hover:bg-muted/60 active:scale-95"
            >
              <Building2 className="h-4 w-4 text-muted-foreground" /> Skonfiguruj firmę
            </Link>
            <Link
              href="/ksef"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-4 text-xs font-medium text-foreground transition-all hover:bg-muted/60 active:scale-95"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> KSeF
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const sales = invoices.filter((i) => i.type === "sale");
  const salesIssued = sales.filter((i) => i.status !== "draft");

  const currentMonth = monthKey(today);
  const monthRevenue = salesIssued
    .filter((i) => monthKey(i.issueDate) === currentMonth)
    .reduce((acc, i) => acc + invoiceTotals(i).gross, 0);

  const overdueTotal = salesIssued
    .filter((i) => effectiveStatus(i) === "overdue")
    .reduce((acc, i) => acc + invoiceTotals(i).gross, 0);

  const pendingTotal = salesIssued
    .filter((i) => ["issued", "sent", "ksef_sent"].includes(effectiveStatus(i)))
    .reduce((acc, i) => acc + invoiceTotals(i).gross, 0);

  const vatDue = salesIssued.reduce((acc, i) => acc + invoiceTotals(i).vat, 0);
  const ksefActive = invoices.filter((i) => i.ksef?.status === "ACTIVE").length;

  // Wykres przychodów — ostatnie 6 miesięcy
  const months: string[] = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const revenueData = months.map((mk) => {
    const items = salesIssued.filter((i) => monthKey(i.issueDate) === mk);
    return {
      label: monthLabel(mk),
      netto: items.reduce((a, i) => a + invoiceTotals(i).net, 0),
      brutto: items.reduce((a, i) => a + invoiceTotals(i).gross, 0),
    };
  });

  const statusCounts = new Map<EffectiveStatus, number>();
  for (const i of salesIssued) {
    const s = effectiveStatus(i);
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
  }
  const statusColor: Record<EffectiveStatus, string> = {
    draft: CHART_COLORS.slate,
    issued: CHART_COLORS.sky,
    overdue: CHART_COLORS.rose,
    paid: CHART_COLORS.emerald,
    ksef_queued: CHART_COLORS.amber,
    ksef_sent: CHART_COLORS.indigo,
    ksef_active: CHART_COLORS.violet,
    ksef_rejected: CHART_COLORS.rose,
  };
  const pieData = [...statusCounts.entries()].map(([s, value]) => ({
    name: STATUS_META[s].label,
    value,
    color: statusColor[s],
  }));

  const byContractor = new Map<string, number>();
  for (const i of salesIssued) {
    byContractor.set(i.contractorId, (byContractor.get(i.contractorId) ?? 0) + invoiceTotals(i).gross);
  }
  const topContractors = [...byContractor.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, value]) => ({
      name: getContractor(contractors, id)?.name ?? "—",
      value: Math.round(value),
    }));

  const recent = [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Czysty nagłówek Dashboardu */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Pulpit</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Podsumowanie finansowe i status e-Faktur</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/invoices/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
          >
            <Plus className="h-4 w-4" /> Wystaw fakturę
          </Link>
        </div>
      </div>

      {/* Karty metryk */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          delay={0}
          tone="indigo"
          label="Przychód (brutto)"
          tooltip="Łączna wartość brutto wystawionych faktur w bieżącym miesiącu."
          value={formatMoney(monthRevenue, "PLN")}
          sub={`${salesIssued.filter((i) => monthKey(i.issueDate) === currentMonth).length} faktur w tym miesiącu`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          delay={1}
          tone="emerald"
          label="Do zapłaty"
          tooltip="Suma kwot z wystawionych faktur oczekujących na płatność."
          value={formatMoney(pendingTotal, "PLN")}
          sub="faktury nieopłacone"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          delay={2}
          tone="red"
          label="Przeterminowane"
          tooltip="Faktury z przekroczonym terminem płatności."
          value={formatMoney(overdueTotal, "PLN")}
          sub="płatności po terminie"
          icon={<Banknote className="h-4 w-4" />}
        />
        <StatCard
          delay={3}
          tone="sky"
          label="VAT należny"
          tooltip="Zarejestrowana kwota podatku VAT ze wszystkich wystawionych faktur."
          value={formatMoney(vatDue, "PLN")}
          sub={`${ksefActive} faktur w KSeF`}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      {/* Szybkie akcje */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/invoices/new"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nowa faktura
        </Link>
        <Link
          href="/invoices"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
        >
          <Receipt className="h-4 w-4" /> Wszystkie faktury
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/contractors"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
        >
          <FileText className="h-4 w-4" /> Kontrahenci
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Przychody — ostatnie 6 miesięcy</CardTitle>
            <CardDescription>Suma netto i brutto faktur sprzedażowych wg daty wystawienia</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart data={revenueData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Statusy faktur</CardTitle>
            <CardDescription>Rozkład statusów (bez szkiców)</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted-foreground">Brak danych.</p>
            ) : (
              <StatusPieChart data={pieData} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Ostatnie faktury</CardTitle>
              <CardDescription>Najnowsze dokumenty w systemie</CardDescription>
            </div>
            <Link
              href="/invoices"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              Zobacz wszystkie <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border/70">
              {recent.map((inv) => {
                const ctr = getContractor(contractors, inv.contractorId);
                const s = effectiveStatus(inv);
                return (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold">
                        {inv.number}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {ctr?.name ?? "—"}
                        </span>
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {formatDate(inv.issueDate)} · {inv.currency}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="text-[13.5px] font-bold tabular-nums">
                        {formatMoney(invoiceTotals(inv).gross, inv.currency)}
                      </span>
                      <Badge className={STATUS_META[s].color}>{STATUS_META[s].label}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Najwięksi kontrahenci</CardTitle>
            <CardDescription>Wg wartości brutto (brutto, PLN)</CardDescription>
          </CardHeader>
          <CardContent>
            {topContractors.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted-foreground">Brak danych.</p>
            ) : (
              <>
                <TopContractorsBar data={topContractors} />
                <p className="mt-2 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                  <ArrowUpRight className="h-3.5 w-3.5" /> wartości w złotych, bez przeliczeń walut
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Środowisko KSeF */}
      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[14px] font-semibold">
                Środowisko KSeF:{" "}
                <span className="uppercase text-accent">{ksefSafe.environment}</span>
              </p>
              <p className="text-[12px] text-muted-foreground">
                {ksefSafe.environment === "demo"
                  ? "Tryb demo — symulacja lokalna."
                  : ksefSafe.environment === "test"
                    ? "Połączono z API MF Test (ksef-test.mf.gov.pl)"
                    : "Połączono z API MF Produkcja (ksef.mf.gov.pl)"}
              </p>
            </div>
          </div>
          <Link
            href="/ksef"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
          >
            Ustawienia KSeF <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
