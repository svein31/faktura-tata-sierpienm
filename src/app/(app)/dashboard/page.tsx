"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Crown, Plus, RefreshCw } from "lucide-react";
import { useOverview } from "@/lib/use-overview";
import { useAppStore } from "@/lib/store";
import { formatMoney, monthLabel } from "@/lib/format";
import { OnboardingBanner } from "@/components/ui/page-guide";

const RevenueAreaChart = dynamic(() => import("@/components/charts").then(m => m.RevenueAreaChart), { ssr: false });
const money = (amount: number, currency: string) => formatMoney(amount, currency as Parameters<typeof formatMoney>[1]);

export default function DashboardPage() {
  const { data, error, companyId, reload } = useOverview();
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

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">Przegląd</h1><p className="text-xs text-muted-foreground">Najważniejsze sprawy wybranej firmy</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {showUpgrade && <Link
          href="/settings/account?tab=billing"
          className="group relative inline-flex min-h-10 items-center gap-1.5 overflow-hidden rounded-lg border border-violet-300/60 bg-gradient-to-r from-violet-800 via-purple-700 to-amber-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-violet-900/30 transition-[transform,box-shadow,filter] duration-300 hover:brightness-110 hover:shadow-lg hover:shadow-violet-500/35 motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/25 blur-md transition-transform duration-700 motion-safe:group-hover:translate-x-[500%] motion-reduce:hidden" />
          <Crown aria-hidden="true" className="relative size-4 text-amber-200 transition-transform duration-300 motion-safe:group-hover:-rotate-12 motion-safe:group-hover:scale-110" />
          <span className="relative">Kup Pro</span>
        </Link>}
        <button onClick={reload} aria-label="Odśwież przegląd" className="rounded-lg border p-2.5 text-muted-foreground hover:text-foreground"><RefreshCw className="size-4" /></button>
        <Link href="/invoices/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="size-4" /> Nowa faktura</Link>
      </div>
    </header>
    {data && <OnboardingBanner hasCompany={Boolean(company?.nip)} hasKsef={Boolean(ksef?.tokenSet || ksef?.certName)} hasInvoices={Boolean(data.recent.length)} />}
    {!companyId && <p className="rounded-xl border p-4 text-sm">Wybierz firmę, aby zobaczyć podsumowanie.</p>}
    {error && <div role="alert" className="rounded-xl border border-rose-500/30 p-4 text-sm">{error} <button onClick={reload} className="ml-2 text-primary underline">Spróbuj ponownie</button></div>}
    {companyId && !data && !error && <p role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Wczytywanie przeglądu…</p>}
    {data && <>
      <section aria-label="Sprawy wymagające działania" className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><h2 className="text-sm font-semibold">Do załatwienia <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{data.actionTotal}</span></h2><span className="text-xs text-muted-foreground">{data.actionTotal > 8 ? "8 najpilniejszych" : "Bieżące zadania"}</span></div>
        {data.actions.length ? <div className="divide-y">{data.actions.map(action => <Link key={action.id} href={action.href} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary"><span className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground sm:w-28">{action.kind}</span><span className="min-w-0 flex-1 truncate text-sm font-medium" title={action.label + " — " + action.detail}>{action.label} <span className="ml-2 font-normal text-muted-foreground">{action.detail}</span></span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></Link>)}</div> : <p className="px-4 py-5 text-sm text-muted-foreground">Brak pilnych spraw dla tej firmy.</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground"><Link href="/cost-reviews" className="hover:text-primary">Akceptacje: {data.counts.reviews}</Link><Link href="/accountant" className="hover:text-primary">Zadania: {data.counts.tasks}</Link><Link href="/invoices" className="hover:text-primary">Po terminie: {data.counts.overdue}</Link><Link href="/ksef" className="hover:text-primary">KSeF: {data.counts.rejected + data.counts.uncertain}</Link></div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Przychody" className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">Przychód brutto · bieżący miesiąc</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(current?.gross || 0, currency)}</p>{comparison !== null && <p className="text-xs text-muted-foreground">{comparison >= 0 ? "+" : ""}{comparison.toFixed(1)}% względem poprzedniego miesiąca</p>}</div><div className="flex gap-1" aria-label="Waluta">{data.currencies.map(c => <button key={c} onClick={() => setSelectedCurrency(c)} aria-pressed={currency === c} className={`rounded-md px-2 py-1 text-xs ${currency === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c}</button>)}</div></div>
          <div className="mt-3 h-[185px]"><RevenueAreaChart data={chart} height={185} /></div><Link href="/analytics" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">Analityka <ArrowRight className="size-3" /></Link>
        </section>
        <section aria-label="Stan KSeF" className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">KSeF</h2><span className="text-xs text-muted-foreground">{ksef?.environment === "production" ? "Produkcja" : ksef?.environment === "test" ? "Test" : "Demo"}</span></div><p className="mt-2 text-2xl font-semibold tabular-nums">{data.ksefQueue.filter(t => t.status === "failed" || t.status === "verify_needed").length}</p><p className="text-xs text-muted-foreground">zadań do sprawdzenia w ostatnich 20</p><div className="mt-4 flex items-center justify-between gap-2 border-t pt-3"><span className="text-xs text-muted-foreground">{gateway === "ok" ? "Bramka dostępna" : gateway === "error" ? "Błąd bramki" : "Bramka nie sprawdzona"}</span><button onClick={checkGateway} disabled={gateway === "loading"} className="text-xs font-medium text-primary disabled:opacity-50">{gateway === "loading" ? "Sprawdzam…" : "Sprawdź"}</button></div><Link href="/ksef" className="mt-3 inline-flex items-center gap-1 text-xs text-primary">Stan i komunikaty <ArrowRight className="size-3" /></Link></section>
      </div>
      <details className="rounded-xl border bg-card"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Ostatnie dokumenty</summary><div className="divide-y border-t">{data.recent.map(inv => <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex justify-between gap-3 px-4 py-2 text-sm hover:bg-muted/50"><span className="truncate">{inv.number}</span><span className="shrink-0 tabular-nums text-muted-foreground">{money(inv.gross || 0, inv.currency)}</span></Link>)}{data.recent.length === 0 && <p className="p-4 text-sm text-muted-foreground">Brak dokumentów.</p>}</div></details>
    </>}
  </div>;
}
