"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useOverview } from "@/lib/use-overview";
import { useAppStore } from "@/lib/store";
import { formatMoney, monthLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

const RevenueAreaChart = dynamic(() => import("@/components/charts").then(m => m.RevenueAreaChart), { ssr: false });
const money = (amount: number, currency: string) => formatMoney(amount, currency as Parameters<typeof formatMoney>[1]);

export default function AnalyticsPage() {
  const { data, error, companyId, reload } = useOverview();
  const contractors = useAppStore(s => s.contractors);
  const [selectedCurrency, setSelectedCurrency] = React.useState("PLN");
  React.useEffect(() => setSelectedCurrency("PLN"), [companyId]);
  const currency = data?.currencies.includes(selectedCurrency) ? selectedCurrency : data?.currencies[0] || "PLN";
  const total = data?.totals.find(item => item.currency === currency);
  const vat = data?.vatByRate.find(item => item.currency === currency)?.rates || [];
  const clients = data?.contractors.find(item => item.currency === currency)?.rows || [];
  const chart = data?.months.map(m => {
    const item = m.values.find(v => v.currency === currency);
    return { label: monthLabel(m.key), netto: item?.net || 0, brutto: item?.gross || 0 };
  }) || [];

  return <div className="space-y-5">
    <PageHeader title="Analityka" description="Sprzedaż według dat wystawienia i waluty." />
    {!companyId && <p className="rounded-xl border p-4 text-sm">Wybierz firmę, aby zobaczyć wyniki.</p>}
    {error && <div role="alert" className="rounded-xl border p-4 text-sm">{error} <button className="ml-2 text-primary underline" onClick={reload}>Spróbuj ponownie</button></div>}
    {companyId && !data && !error && <p role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Wczytywanie analityki…</p>}
    {data && <><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Faktury sprzedaży, bez szkiców i proform. Kwoty pozostają w walucie dokumentu.</p><div role="group" aria-label="Waluta" className="flex gap-1">{data.currencies.map(c => <button key={c} onClick={() => setSelectedCurrency(c)} aria-pressed={c === currency} className={`rounded-lg px-3 py-1.5 text-xs ${currency === c ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{c}</button>)}</div></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Netto", total?.net || 0], ["Brutto", total?.gross || 0], ["VAT", total?.vat || 0], ["Średnia faktura", total?.count ? total.gross / total.count : 0]].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-base font-semibold tabular-nums" title={money(Number(value), currency)}>{money(Number(value), currency)}</p></div>)}</div>
      <section className="rounded-xl border bg-card p-4"><h2 className="mb-3 text-sm font-semibold">Przychody miesięczne · {currency}</h2><RevenueAreaChart data={chart} /></section>
      <div className="grid gap-4 md:grid-cols-2">
        <details className="rounded-xl border bg-card" open><summary className="cursor-pointer p-4 text-sm font-semibold">VAT według stawek</summary><div className="divide-y border-t">{vat.length ? vat.map(row => <div key={row.rate} className="flex justify-between gap-3 px-4 py-2 text-sm"><span>{row.rate}%</span><span className="tabular-nums">{money(row.value, currency)}</span></div>) : <p className="p-4 text-sm text-muted-foreground">Brak danych.</p>}</div></details>
        <details className="rounded-xl border bg-card"><summary className="cursor-pointer p-4 text-sm font-semibold">Kontrahenci · 8 największych</summary><div className="divide-y border-t">{clients.length ? clients.map(row => <div key={row.id} className="flex justify-between gap-3 px-4 py-2 text-sm"><span className="truncate">{contractors.find(c => c.id === row.id)?.name || "Kontrahent"} <span className="text-xs text-muted-foreground">({row.count})</span></span><span className="shrink-0 tabular-nums">{money(row.gross, currency)}</span></div>) : <p className="p-4 text-sm text-muted-foreground">Brak danych.</p>}</div></details>
      </div>
    </>}
  </div>;
}
