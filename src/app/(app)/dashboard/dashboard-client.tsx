"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, CalendarDays, Crown, Landmark, Plus, RefreshCw, TrendingUp } from "lucide-react";
import { useOverview, type OverviewSeed } from "@/lib/use-overview";
import { useAppStore } from "@/lib/store";
import { formatMoney, monthLabel } from "@/lib/format";
import { OnboardingBanner } from "@/components/ui/onboarding-banner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const RevenueAreaChart = dynamic(() => import("@/components/charts").then(m => m.RevenueAreaChart), { ssr: false });
const money = (amount: number, currency: string) => formatMoney(amount, currency as Parameters<typeof formatMoney>[1]);

export default function DashboardClient({ initialOverview }: { initialOverview?: OverviewSeed }) {
  const { data, error, companyId, reload } = useOverview(6, initialOverview);
  const company = useAppStore(s => s.company);
  const ksef = useAppStore(s => s.ksef);
  const [showUpgrade, setShowUpgrade] = React.useState(false);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/subscription", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(result => {
        if (!controller.signal.aborted) setShowUpgrade(result?.subscription?.isPro === false && result?.quota?.tier === "free");
      })
      .catch(() => { if (!controller.signal.aborted) setShowUpgrade(false); });
    return () => controller.abort();
  }, []);
  const [selectedCurrency, setSelectedCurrency] = React.useState("PLN");
  const [gateway, setGateway] = React.useState<"idle" | "loading" | "ok" | "error">("idle");
  React.useEffect(() => { setSelectedCurrency("PLN"); setGateway("idle"); }, [companyId]);
  const currency = data?.currencies.includes(selectedCurrency) ? selectedCurrency : data?.currencies[0] || "PLN";
  const current = data?.currentMonth.find(v => v.currency === currency);
  const previous = data?.previousMonth.find(v => v.currency === currency);
  const comparison = previous?.gross ? ((current?.gross || 0) / previous.gross - 1) * 100 : null;
  const chart = data?.months.map(m => {
    const item = m.values.find(v => v.currency === currency);
    return { label: monthLabel(m.key), netto: item?.net || 0, brutto: item?.gross || 0 };
  }) || [];
  const checkGateway = async () => {
    if (!companyId) return;
    setGateway("loading");
    try {
      const response = await fetch("/api/ksef/test-connection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, environment: ksef?.environment || "demo", gatewayOnly: true }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      setGateway(response.ok && result.ok ? "ok" : "error");
    } catch { setGateway("error"); }
  };

  return <div className="space-y-6">
    <PageHeader title="Przegląd" description="Dokumenty, potwierdzenia i płatności wymagające działania" actions={<>
        {/* Reserve the link's natural width before the subscription arrives. */}
        <Link prefetch={false}
          href="/settings/account?tab=billing"
          aria-hidden={!showUpgrade || undefined}
          tabIndex={showUpgrade ? undefined : -1}
          inert={!showUpgrade || undefined}
          className={`group relative inline-flex min-h-10 items-center gap-1.5 overflow-hidden rounded-lg border border-violet-300/60 bg-gradient-to-r from-violet-800 via-purple-700 to-amber-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-violet-900/30 transition-[transform,box-shadow,filter] duration-300 hover:brightness-110 hover:shadow-lg hover:shadow-violet-500/35 motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${!showUpgrade ? "invisible" : ""}`}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/25 blur-md transition-transform duration-700 motion-safe:group-hover:translate-x-[500%] motion-reduce:hidden" />
          <Crown aria-hidden="true" className="relative size-4 text-amber-200 transition-transform duration-300 motion-safe:group-hover:-rotate-12 motion-safe:group-hover:scale-110" />
          <span className="relative">Kup Pro</span>
        </Link>
        <Link prefetch={false} href="/calendar" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/70 bg-card px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"><CalendarDays aria-hidden="true" className="size-4" />Terminarz</Link>
        <Button variant="outline" size="icon" onClick={reload} aria-label="Odśwież przegląd" className="min-h-10 min-w-10"><RefreshCw aria-hidden="true" className="size-4" /></Button>
        <Link prefetch={false} href="/invoices/new" onClick={() => useAppStore.getState().setDraft(null, true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"><Plus aria-hidden="true" className="size-4" /> Nowa faktura</Link>
    </>} />
    {data && <OnboardingBanner hasCompany={Boolean(company?.nip)} hasKsef={Boolean(ksef?.tokenSet || ksef?.certName)} hasInvoices={Boolean(data.recent.length)} />}
    {!companyId && <p className="rounded-xl border p-4 text-sm">Wybierz firmę, aby zobaczyć podsumowanie.</p>}
    {error && <div role="alert" className="rounded-xl border border-rose-500/30 p-4 text-sm">{error} <button onClick={reload} className="ml-2 text-primary underline">Spróbuj ponownie</button></div>}
    {companyId && !data && !error && <p role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Wczytywanie przeglądu…</p>}
    {data && <>
      <section aria-label="Sprawy wymagające działania" className="surface-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6"><h2 className="flex items-center gap-2.5 text-base font-semibold">Do załatwienia <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-0.5 text-xs tabular-nums text-primary">{data.actionTotal}</span></h2><span className="text-xs text-muted-foreground">{data.actionTotal > 8 ? "8 najpilniejszych" : "Bieżące zadania"}</span></div>
        {data.actions.length ? <div className="divide-y divide-border/50">{data.actions.map(action => <Link prefetch={false} key={action.id} href={action.href} className="group flex min-h-16 items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40 sm:px-6"><span className="hidden w-28 shrink-0 text-xs font-medium text-muted-foreground sm:block">{action.kind}</span><span className="min-w-0 flex-1 space-y-1 break-words text-sm"><span className="block text-xs text-muted-foreground sm:hidden">{action.kind}</span><span className="block font-medium leading-relaxed">{action.label}</span><span className="block text-[13px] leading-relaxed text-muted-foreground">{action.detail}</span></span><ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" /></Link>)}</div> : <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">Brak pilnych spraw dla tej firmy.</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/60 px-5 py-4 text-xs text-muted-foreground sm:px-6"><Link prefetch={false} href="/finances" className="py-1 transition-colors hover:text-primary">Niedopasowane wpłaty: {data.counts.unmatched}</Link><Link prefetch={false} href="/ksef" className="py-1 transition-colors hover:text-primary">Brak UPO: {data.counts.missingUpo}</Link><Link prefetch={false} href="/cost-reviews" className="py-1 transition-colors hover:text-primary">Akceptacje: {data.counts.reviews}</Link><Link prefetch={false} href="/accountant" className="py-1 transition-colors hover:text-primary">Zadania: {data.counts.tasks}</Link><Link prefetch={false} href="/invoices" className="py-1 transition-colors hover:text-primary">Po terminie: {data.counts.overdue}</Link><Link prefetch={false} href="/ksef" className="py-1 transition-colors hover:text-primary">KSeF: {data.counts.rejected + data.counts.uncertain}</Link></div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Przychody" data-tone="income" className="surface-card min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2 text-[13px] text-muted-foreground"><TrendingUp aria-hidden="true" className="size-4 text-finance-income" /><h2 className="font-medium">Przychód brutto · bieżący miesiąc</h2></div><p className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums text-finance-income">{money(current?.gross || 0, currency)}</p>{comparison !== null && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{comparison >= 0 ? "+" : ""}{comparison.toFixed(1)}% względem poprzedniego miesiąca</p>}</div><div role="group" className="flex max-w-full flex-wrap gap-1 rounded-xl border border-border/60 bg-muted/30 p-1" aria-label="Waluta">{data.currencies.map(c => <button key={c} onClick={() => setSelectedCurrency(c)} aria-pressed={currency === c} className={`min-h-8 rounded-lg px-2.5 text-xs font-medium transition-colors ${currency === c ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{c}</button>)}</div></div>
          <div className="mt-5 h-[210px]"><RevenueAreaChart data={chart} height={210} /></div><Link prefetch={false} href="/analytics" className="mt-3 inline-flex min-h-9 items-center gap-2 text-[13px] font-medium text-primary transition-colors hover:text-foreground">Analityka <ArrowRight aria-hidden="true" className="size-3.5" /></Link>
        </section>
        <section aria-label="Stan KSeF" data-tone="office" className="surface-card p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">KSeF</h2><span className="mt-1 block text-xs text-muted-foreground">{ksef?.environment === "production" ? "Produkcja" : ksef?.environment === "test" ? "Test" : "Demo"}</span></div><span className="finance-icon"><Landmark aria-hidden="true" className="size-[18px]" /></span></div><p className="mt-5 text-3xl font-semibold tabular-nums text-finance-office">{data.ksefQueue.filter(t => t.status === "failed" || t.status === "verify_needed").length}</p><p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">zadań do sprawdzenia w ostatnich 20</p><div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4"><span role="status" className={`text-xs ${gateway === "ok" ? "text-finance-income" : gateway === "error" ? "text-finance-expense" : "text-muted-foreground"}`}>{gateway === "ok" ? "Bramka dostępna" : gateway === "error" ? "Błąd bramki" : "Bramka nie sprawdzona"}</span><Button variant="subtle" size="sm" onClick={checkGateway} disabled={gateway === "loading"}>{gateway === "loading" ? "Sprawdzam…" : "Sprawdź"}</Button></div><Link prefetch={false} href="/ksef" className="mt-4 inline-flex min-h-9 items-center gap-2 text-[13px] font-medium text-primary transition-colors hover:text-foreground">Stan i komunikaty <ArrowRight aria-hidden="true" className="size-3.5" /></Link></section>
      </div>
      <details className="surface-card"><summary className="cursor-pointer rounded-2xl px-5 py-4 text-base font-semibold transition-colors hover:bg-muted/30 sm:px-6">Ostatnie dokumenty</summary><div className="divide-y divide-border/50 border-t border-border/60">{data.recent.map(inv => <Link prefetch={false} key={inv.id} href={`/invoices/${inv.id}`} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm transition-colors hover:bg-muted/40 sm:px-6"><span className="min-w-0 break-words font-medium">{inv.number}</span><span className="tabular-nums text-muted-foreground">{money(inv.gross || 0, inv.currency)}</span></Link>)}{data.recent.length === 0 && <p className="px-5 py-5 text-sm text-muted-foreground sm:px-6">Brak dokumentów.</p>}</div></details>
    </>}
  </div>;
}
