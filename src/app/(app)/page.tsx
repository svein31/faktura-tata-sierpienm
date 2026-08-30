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
import { useAppStore, effectiveStatus, STATUS_META, getContractor } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney, invoiceTotals, monthKey, monthLabel } from "@/lib/format";
import { RevenueAreaChart, StatusPieChart, TopContractorsBar, CHART_COLORS } from "@/components/charts";
import { todayISO } from "@/lib/utils";
import { EMPTY_COMPANY } from "@/lib/types";
import type { EffectiveStatus } from "@/lib/store";

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
  delay,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "indigo" | "emerald" | "red" | "sky" | "amber";
  delay: number;
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
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
              <p className="mt-1.5 text-[22px] font-bold tracking-tight tabular-nums">{value}</p>
              {sub && <p className="mt-1 text-[11.5px] text-muted-foreground">{sub}</p>}
            </div>
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Elegancki onboarding dla nowego użytkownika (pusty dashboard). */
function Onboarding() {
  const { company, companies, ksef, contractors, products } = useAppStore();

  const activeComp = companies.find((c) => c.isDefault) ?? companies[0] ?? company;
  const companyDone = Boolean(
    (activeComp && (activeComp.companyName || activeComp.name)?.trim().length) ||
    companies.length > 0
  );
  const ksefDone = !!ksef && ksef.environment !== "demo";
  const steps = [
    {
      done: companyDone,
      icon: <Building2 className="h-4 w-4" />,
      title: "Uzupełnij profil firmy / spółki",
      desc: "Nazwa, NIP z bazy GUS, adres i numer konta bankowego dla wystawianych faktur.",
      cta: { href: "/settings/companies", label: "Zarządzaj firmami" },
    },
    {
      done: ksefDone,
      icon: <ShieldCheck className="h-4 w-4" />,
      title: "Skonfiguruj KSeF",
      desc: "Wybierz środowisko (demo/test/produkcja). W tej wersji wysyłka działa w trybie demo.",
      cta: { href: "/ksef", label: "Ustawienia KSeF" },
    },
    {
      done: false,
      icon: <Receipt className="h-4 w-4" />,
      title: "Wystaw pierwszą fakturę",
      desc: `Dodaj kontrahenta (lub utwórz go w kreatorze) i zapisz fakturę ${
        contractors.length === 0 ? "— możesz też dodać go od razu w kreatorze" : ""
      }.`,
      cta: { href: "/invoices/new", label: "Nowa faktura" },
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="overflow-hidden border-primary/20">
        <div className="bg-gradient-to-br from-indigo-500/10 via-transparent to-emerald-500/10 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Witaj w Fakturo! 👋</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                Twoje konto jest gotowe i w pełni izolowane — na start nie zawiera żadnych danych.
                Wykonaj trzy kroki, aby przygotować je do wystawiania faktur i wysyłki do KSeF.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${
                  s.done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      s.done ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.icon}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Krok {i + 1}
                  </span>
                </div>
                <p className="mt-3 text-[13.5px] font-semibold">{s.title}</p>
                <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{s.desc}</p>
                <Link
                  href={s.cta.href}
                  className={`mt-3 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors ${
                    s.done
                      ? "text-muted-foreground"
                      : "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  }`}
                >
                  {s.done ? "Ukończono" : s.cta.label}
                  {!s.done && <ArrowRight className="h-3.5 w-3.5" />}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/70 bg-background/50 px-4 py-3 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Circle className="h-2.5 w-2.5 fill-muted-foreground/40 text-muted-foreground/40" />
              Kontrahenci: <b className="text-foreground">{contractors.length}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <Circle className="h-2.5 w-2.5 fill-muted-foreground/40 text-muted-foreground/40" />
              Produkty/usługi: <b className="text-foreground">{products.length}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <Circle className="h-2.5 w-2.5 fill-muted-foreground/40 text-muted-foreground/40" />
              Faktury: <b className="text-foreground">0</b> — wszystko, co dodasz, zapisywane jest
              bezpiecznie na Twoim koncie.
            </span>
          </div>
        </div>
      </Card>

      {/* Quick actions */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/invoices/new"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nowa faktura
        </Link>
        <Link
          href="/contractors"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
        >
          <Building2 className="h-4 w-4" /> Dodaj kontrahenta
        </Link>
        <Link
          href="/ksef"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
        >
          <ShieldCheck className="h-4 w-4" /> Ustawienia KSeF
        </Link>
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { invoices, contractors, company, ksef } = useAppStore();
  const today = todayISO();
  const companySafe = company ?? EMPTY_COMPANY;
  const ksefSafe = ksef ?? { environment: "demo" as const, tokenSet: false, tokenMask: "", certName: "", autoValidate: true };

  if (invoices.length === 0) {
    return (
      <div className="space-y-6">
        <Onboarding />
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
      {/* Karty */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          delay={0}
          tone="indigo"
          label="Przychód (brutto) — ten miesiąc"
          value={formatMoney(monthRevenue, "PLN")}
          sub={`${salesIssued.filter((i) => monthKey(i.issueDate) === currentMonth).length} faktur`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          delay={1}
          tone="emerald"
          label="Do zapłaty"
          value={formatMoney(pendingTotal, "PLN")}
          sub="faktury wystawione, nieopłacone"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          delay={2}
          tone="red"
          label="Przeterminowane"
          value={formatMoney(overdueTotal, "PLN")}
          sub="płatności po terminie"
          icon={<Banknote className="h-4 w-4" />}
        />
        <StatCard
          delay={3}
          tone="sky"
          label="VAT należny (brutto)"
          value={formatMoney(vatDue, "PLN")}
          sub={`${ksefActive} dokumentów aktywnych w KSeF`}
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
