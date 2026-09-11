"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode2,
  FileEdit,
  FileText,
  Filter,
  Layers,
  Plus,
  Radio,
  Receipt,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useAppStore, effectiveStatus, STATUS_META, getContractor } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime, formatMoney, invoiceTotals, monthKey, monthLabel } from "@/lib/format";
import { todayISO } from "@/lib/utils";
import { EMPTY_COMPANY } from "@/lib/types";
import type { EffectiveStatus } from "@/lib/store";
import type { Invoice } from "@/lib/types";

const RevenueAreaChart = dynamic(
  () => import("@/components/charts").then((m) => m.RevenueAreaChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[240px] w-full rounded-2xl" />,
  }
);

interface ActionCardProps {
  title: string;
  count: number;
  subtext: string;
  icon: React.ReactNode;
  tone: "rose" | "amber" | "indigo" | "sky" | "slate" | "emerald";
  filterHref: string;
  delay?: number;
}

function ActionCard({ title, count, subtext, icon, tone, filterHref, delay = 0 }: ActionCardProps) {
  const toneClasses = {
    rose: {
      border: "border-rose-500/25 dark:border-rose-500/30 hover:border-rose-500/50",
      bg: "bg-rose-500/5 dark:bg-rose-500/10",
      iconBg: "bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-rose-500/30",
      badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    },
    amber: {
      border: "border-amber-500/25 dark:border-amber-500/30 hover:border-amber-500/50",
      bg: "bg-amber-500/5 dark:bg-amber-500/10",
      iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30",
      badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    },
    indigo: {
      border: "border-indigo-500/25 dark:border-indigo-500/30 hover:border-indigo-500/50",
      bg: "bg-indigo-500/5 dark:bg-indigo-500/10",
      iconBg: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 ring-indigo-500/30",
      badge: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
    },
    sky: {
      border: "border-sky-500/25 dark:border-sky-500/30 hover:border-sky-500/50",
      bg: "bg-sky-500/5 dark:bg-sky-500/10",
      iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-sky-500/30",
      badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    },
    slate: {
      border: "border-border/70 hover:border-border",
      bg: "bg-muted/40",
      iconBg: "bg-muted text-muted-foreground ring-border/50",
      badge: "bg-muted text-foreground/80 border-border/60",
    },
    emerald: {
      border: "border-emerald-500/25 dark:border-emerald-500/30 hover:border-emerald-500/50",
      bg: "bg-emerald-500/5 dark:bg-emerald-500/10",
      iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30",
      badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    },
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link href={filterHref} className="block group">
        <Card
          className={`relative overflow-hidden rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md ${toneClasses.border} ${toneClasses.bg}`}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-muted-foreground">{title}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                    {count}
                  </span>
                  {count > 0 && (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${toneClasses.badge}`}
                    >
                      Wymaga reakcji
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted-foreground truncate">{subtext}</p>
              </div>

              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105 ${toneClasses.iconBg}`}
              >
                {icon}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1 text-[11.5px] font-medium text-primary opacity-90 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
              <span>Zobacz listę</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { invoices, contractors, company, ksef } = useAppStore();
  const today = todayISO();
  const companySafe = company ?? EMPTY_COMPANY;
  const ksefSafe = ksef ?? {
    environment: "demo" as const,
    tokenSet: false,
    tokenMask: "",
    certName: "",
    autoValidate: true,
  };

  // Stan połączenia KSeF
  const [pinging, setPinging] = React.useState(false);
  const [ksefStatus, setKsefStatus] = React.useState<{
    ok: boolean;
    pingMs?: number;
    checkedAt?: string;
  }>({
    ok: true,
    pingMs: ksefSafe.environment === "demo" ? 12 : 64,
    checkedAt: new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
  });

  const checkConnection = async () => {
    setPinging(true);
    try {
      const res = await fetch("/api/ksef/test-connection");
      const data = await res.json();
      setKsefStatus({
        ok: data.success,
        pingMs: data.pingMs,
        checkedAt: new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
      });
    } catch {
      setKsefStatus({
        ok: false,
        checkedAt: new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
      });
    } finally {
      setPinging(false);
    }
  };

  // 1. Grupowanie dokumentów pod kątem pytań „Co wymaga działania?”
  const rejectedInvoices = invoices.filter(
    (i) => i.ksefStatus === "rejected" || (i.status as string) === "ksef_rejected"
  );
  const queuedInvoices = invoices.filter(
    (i) =>
      i.ksefStatus === "queued" ||
      i.ksefStatus === "sending" ||
      i.ksefStatus === "verify_needed" ||
      i.status === "ksef_sent"
  );
  const overdueInvoices = invoices.filter((i) => {
    if (i.paymentStatus === "overdue") return true;
    if (i.status === "paid") return false;
    return Boolean(i.dueDate && i.dueDate < today);
  });
  const draftInvoices = invoices.filter(
    (i) => i.documentStatus === "draft" || i.status === "draft"
  );
  const offlineInvoices = invoices.filter(
    (i) => i.isOffline && (!i.ksefNumber || i.ksefStatus !== "accepted")
  );

  // Ostatnie faktury
  const recentInvoices = [...invoices]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  // Statystyki finansowe
  const currentMonth = monthKey(today);
  const salesIssued = invoices.filter((i) => i.type === "sale" && i.status !== "draft");
  const monthRevenue = salesIssued
    .filter((i) => monthKey(i.issueDate) === currentMonth)
    .reduce((acc, i) => acc + (i.totalGross || invoiceTotals(i).gross), 0);

  // Wykres 6 miesięcy
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
      netto: items.reduce((a, i) => a + (i.totalNet || invoiceTotals(i).net), 0),
      brutto: items.reduce((a, i) => a + (i.totalGross || invoiceTotals(i).gross), 0),
    };
  });

  const envLabel = {
    production: "Produkcja (MF)",
    test: "Środowisko Testowe (MF)",
    demo: "Symulator DEMO (Lokalny)",
  }[ksefSafe.environment];

  const envBadgeTone = {
    production: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    test: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    demo: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  }[ksefSafe.environment];

  return (
    <div className="space-y-8">
      {/* ── NAGŁÓWEK GŁÓWNY Z WYRAŹNYM PRZYCISKIEM „NOWA FAKTURA” ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Co wymaga działania?
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${envBadgeTone}`}
            >
              KSeF: {envLabel}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
            Bieżące powiadomienia, kolejka e-Faktur KSeF i status płatności kontrahentów.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/invoices/new"
            id="dashboard-new-invoice-btn"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Nowa faktura</span>
          </Link>
        </div>
      </div>

      {/* ── 5 LICZNIKÓW AKCJI („CO WYMAGA DZIAŁANIA?”) ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* 1. Faktury odrzucone */}
        <ActionCard
          title="Faktury odrzucone"
          count={rejectedInvoices.length}
          subtext={
            rejectedInvoices.length === 0
              ? "Brak odrzuconych dokumentów"
              : "Wymagają poprawy i ponowienia"
          }
          icon={<AlertOctagon className="h-5 w-5" />}
          tone="rose"
          filterHref="/invoices?status=ksef_rejected"
          delay={0}
        />

        {/* 2. Oczekujące na wysyłkę / w kolejce KSeF */}
        <ActionCard
          title="KSeF: W kolejce / wysyłane"
          count={queuedInvoices.length}
          subtext={
            queuedInvoices.length === 0
              ? "Kolejka przetworzona"
              : "Trwa wysyłka lub oczekiwanie na UPO"
          }
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
          filterHref="/invoices?status=ksef_sent"
          delay={1}
        />

        {/* 3. Należności po terminie */}
        <ActionCard
          title="Należności po terminie"
          count={overdueInvoices.length}
          subtext={
            overdueInvoices.length === 0
              ? "Wszystkie płatności w terminie"
              : "Zaległości wymagające kontaktu"
          }
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="rose"
          filterHref="/invoices?status=overdue"
          delay={2}
        />

        {/* 4. Szkice do dokończenia */}
        <ActionCard
          title="Szkice do dokończenia"
          count={draftInvoices.length}
          subtext={
            draftInvoices.length === 0
              ? "Brak otwartych szkiców"
              : "Niewystawione wersje robocze"
          }
          icon={<FileEdit className="h-5 w-5" />}
          tone="sky"
          filterHref="/invoices?status=draft"
          delay={3}
        />

        {/* 5. Dokumenty offline */}
        <ActionCard
          title="Dokumenty offline"
          count={offlineInvoices.length}
          subtext={
            offlineInvoices.length === 0
              ? "Brak faktur offline"
              : "Oczekują na przesłanie do KSeF"
          }
          icon={<Zap className="h-5 w-5" />}
          tone="indigo"
          filterHref="/invoices?status=offline"
          delay={4}
        />
      </div>

      {/* ── KAFEL POŁĄCZENIA Z KSEF + PRZYCHÓD MIESIĄCA ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* KSeF Connection Widget */}
        <Card className="rounded-2xl border border-border/80 bg-card/90 shadow-sm p-5">
          <div className="flex items-center justify-between border-b border-border/60 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div
                className={`h-2.5 w-2.5 rounded-full ${ksefStatus.ok ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}
              />
              <span className="text-sm font-semibold text-foreground">Bramka KSeF 2.0</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={checkConnection}
              disabled={pinging}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-3 w-3 ${pinging ? "animate-spin" : ""}`} />
              <span>{pinging ? "Test…" : "Sprawdź"}</span>
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Środowisko:</span>
              <span className="font-semibold text-foreground">{envLabel}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Status bramki:</span>
              <span className={ksefStatus.ok ? "text-emerald-500 font-medium" : "text-rose-500 font-medium"}>
                {ksefStatus.ok ? "Dostępna (Online)" : "Błąd połączenia"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Czas odpowiedzi (ping):</span>
              <span className="font-mono font-medium text-foreground">
                {ksefStatus.pingMs ? `${ksefStatus.pingMs} ms` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Token autoryzacyjny:</span>
              <span className="font-medium text-foreground">
                {ksefSafe.tokenSet ? "Skonfigurowany ✓" : "Brak (tryb lokalny)"}
              </span>
            </div>
          </div>

          <div className="mt-5 border-t border-border/60 pt-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Sprawdzono: {ksefStatus.checkedAt || "dzisiaj"}
            </span>
            <Link
              href="/ksef?tab=settings"
              className="text-[11.5px] font-medium text-primary hover:underline"
            >
              Konfiguracja KSeF →
            </Link>
          </div>
        </Card>

        {/* Wykres Przychodu */}
        <div className="lg:col-span-2">
          <Card className="h-full rounded-2xl border border-border/80 bg-card/90 shadow-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3.5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Przychód w tym miesiącu</p>
                <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                  {formatMoney(monthRevenue, "PLN")}
                </p>
              </div>
              <Link
                href="/analytics"
                className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
              >
                <span>Pełna analityka</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-4">
              <RevenueAreaChart data={revenueData} />
            </div>
          </Card>
        </div>
      </div>

      {/* ── OSTATNIE DOKUMENTY Z SZYBKIMI AKCJAMI ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Ostatnio wystawione dokumenty
          </h2>
          <Link
            href="/invoices"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            <span>Wszystkie faktury ({invoices.length})</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recentInvoices.length === 0 ? (
          <Card className="p-8 text-center rounded-2xl border-dashed border-border/80">
            <Receipt className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-semibold text-foreground">Brak wystawionych faktur</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Rozpocznij fakturowanie klikając przycisk poniżej.
            </p>
            <Link
              href="/invoices/new"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Wystaw fakturę
            </Link>
          </Card>
        ) : (
          <div className="rounded-2xl border border-border/80 bg-card/90 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-4">Numer</th>
                    <th className="py-3 px-4">Kontrahent</th>
                    <th className="py-3 px-4">Data wystawienia</th>
                    <th className="py-3 px-4">Kwota Brutto</th>
                    <th className="py-3 px-4">Stan KSeF</th>
                    <th className="py-3 px-4">Płatność</th>
                    <th className="py-3 px-4 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {recentInvoices.map((inv) => {
                    const contractor = getContractor(contractors, inv.contractorId);
                    const totals = invoiceTotals(inv);
                    const isKsefAccepted = inv.ksefStatus === "accepted" || Boolean(inv.ksefNumber);
                    const isKsefRejected = inv.ksefStatus === "rejected";

                    return (
                      <tr
                        key={inv.id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="py-3.5 px-4 font-semibold text-foreground whitespace-nowrap">
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="hover:text-primary transition-colors flex items-center gap-1.5"
                          >
                            <span>{inv.number}</span>
                            {inv.isCorrection && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                KOR
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-foreground/90 max-w-[200px] truncate">
                          {contractor?.name || "—"}
                        </td>
                        <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                          {formatDate(inv.issueDate)}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-foreground whitespace-nowrap tabular-nums">
                          {formatMoney(inv.totalGross ?? totals.gross, inv.currency)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isKsefAccepted ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>Przyjęta</span>
                            </span>
                          ) : isKsefRejected ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                              <AlertOctagon className="h-3.5 w-3.5" />
                              <span>Odrzucona</span>
                            </span>
                          ) : inv.ksefStatus === "queued" || inv.status === "ksef_sent" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              <Clock className="h-3.5 w-3.5" />
                              <span>W kolejce</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              Niewysłana
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {inv.paymentStatus === "paid" || inv.status === "paid" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Opłacona
                            </span>
                          ) : inv.paymentStatus === "partially_paid" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-sky-500/15 text-sky-600 border border-sky-500/20">
                              Częściowo
                            </span>
                          ) : inv.dueDate && inv.dueDate < today ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              Po terminie
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-muted text-muted-foreground border border-border">
                              Nieopłacona
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <span>Szczegóły</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
