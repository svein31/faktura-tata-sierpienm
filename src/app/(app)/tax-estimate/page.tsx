"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
type Estimate = { revenueNet: number; costsNet: number; vatBalance: number; incomeTax: number; social: number; health: number; total: number; warnings: string[]; steps: { label: string; value: number }[] };
export default function TaxEstimatePage() {
  const companyId = useAppStore(s => s.selectedCompanyId), [month, setMonth] = useState(new Date().toISOString().slice(0, 7)), [mode, setMode] = useState("skala"), [zus, setZus] = useState("full"), [citRate, setCitRate] = useState("19"), [rate, setRate] = useState("8.5");
  const [numbers, setNumbers] = useState({ previousIncome: "0", paid: "0", healthPaid: "0", loss: "0" }), [data, setData] = useState<Estimate | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    const timer = setTimeout(() => { if (companyId) fetch("/api/tax-estimate?" + new URLSearchParams({ companyId, month, mode, zus, citRate, ryczaltRate: rate, ...numbers }), { signal: controller.signal }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); }); }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [companyId, month, mode, zus, citRate, rate, numbers]);
  return <div className="space-y-5"><PageHeader title="Prognoza podatków B2B" description="Scenariusz PIT lub klasycznego CIT, VAT i składek na podstawie dokumentów wybranej firmy." /><Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-sm">Miesiąc<Input type="month" min="2025-01" max="2026-12" value={month} onChange={e => setMonth(e.target.value)} /></label>
    <label className="text-sm">Opodatkowanie<Select value={mode} onChange={e => setMode(e.target.value)}><option value="skala">JDG — skala</option><option value="liniowy">JDG — liniowy 19%</option><option value="ryczalt">JDG — ryczałt</option><option value="cit">Spółka — klasyczny CIT</option></Select></label>
    {mode === "cit" ? <label className="text-sm">Stawka CIT<Select value={citRate} onChange={e => setCitRate(e.target.value)}><option value="19">19%</option><option value="9">9% — po potwierdzeniu warunków</option></Select></label> : <label className="text-sm">Wariant ZUS<Select value={zus} onChange={e => setZus(e.target.value)}><option value="full">Pełny ZUS</option><option value="preferential">Preferencyjny</option><option value="ulga_na_start">Ulga na start</option><option value="none">Bez składek społecznych</option></Select></label>}
    {mode === "ryczalt" && <label className="text-sm">Stawka ryczałtu<Select value={rate} onChange={e => setRate(e.target.value)}>{[2, 3, 5.5, 8.5, 10, 12, 14, 15, 17].map(v => <option key={v} value={v}>{v}%</option>)}</Select></label>}
    {([["previousIncome", "Dochód poprzedniego miesiąca"], ["paid", "Zapłacone zaliczki od początku roku"], ["healthPaid", "Zapłacone składki zdrowotne od początku roku"], ["loss", "Strata do odliczenia"]] as const).map(([key, label]) => <label className="text-sm" key={key}>{label}<Input type="number" min="0" step="0.01" value={numbers[key]} onChange={e => setNumbers(n => ({ ...n, [key]: e.target.value }))} /></label>)}
    </Card>{!companyId && <p>Wybierz firmę w górnym pasku.</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
    {data && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Przychód netto", data.revenueNet], ["Koszty netto", data.costsNet], ["VAT — saldo orientacyjne", data.vatBalance], [mode === "cit" ? "Zaliczka CIT" : "Zaliczka PIT", data.incomeTax], ["Składki społeczne", data.social], ["Składka zdrowotna", data.health], ["Prognozowana suma", data.total]].map(([label, value]) => <Card key={String(label)} className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{formatMoney(Number(value), "PLN")}</p></Card>)}</div><Card className="space-y-2 p-5"><h2 className="font-semibold">Założenia i zakres prognozy</h2>{data.warnings.map((warning, i) => <p className="text-sm text-muted-foreground" key={i}>{warning}</p>)}</Card><details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Sprawdź obliczenia</summary>{data.steps.map((s, i) => <p key={i} className="mt-2 text-sm">{s.label}: {formatMoney(s.value, "PLN")}</p>)}</details></>}
  </div>;
}
