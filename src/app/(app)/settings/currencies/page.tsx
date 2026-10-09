"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Globe,
  TrendingUp,
  RefreshCw,
  Landmark,
  Calculator,
  ArrowRightLeft,
  Building2,
  HelpCircle,
  FileCheck2,
  ExternalLink,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CurrencyRateInfo {
  code: string;
  name: string;
  symbol: string;
  rate: number;
  tableNumber: string;
  effectiveDate: string;
}

const TRACKED_CURRENCIES = [
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "USD", name: "Dolar amerykański", symbol: "$" },
  { code: "GBP", name: "Funt szterling", symbol: "£" },
  { code: "CHF", name: "Frank szwajcarski", symbol: "CHF" },
  { code: "NOK", name: "Korona norweska", symbol: "kr" },
  { code: "SEK", name: "Korona szwedzka", symbol: "kr" },
  { code: "CAD", name: "Dolar kanadyjski", symbol: "C$" },
];

export default function CurrenciesPage() {
  const { company, selectedCompanyId, companies } = useAppStore();
  const activeCompany = companies.find((c) => c.id === selectedCompanyId) || company;

  const [rates, setRates] = React.useState<Record<string, CurrencyRateInfo>>({});
  const [loading, setLoading] = React.useState(true);
  const [lastRefreshed, setLastRefreshed] = React.useState<string | null>(null);

  // Kalkulator walutowy
  const [calcAmount, setCalcAmount] = React.useState<number>(1000);
  const [calcFrom, setCalcFrom] = React.useState<string>("EUR");
  const [calcTo, setCalcTo] = React.useState<string>("PLN");

  const fetchRates = React.useCallback(async () => {
    setLoading(true);
    const newRates: Record<string, CurrencyRateInfo> = {};
    const today = new Date().toISOString().slice(0, 10);

    try {
      await Promise.all(
        TRACKED_CURRENCIES.map(async (c) => {
          try {
            const res = await fetch(`/api/nbp?currency=${c.code}&issueDate=${today}&saleDate=${today}`);
            if (res.ok) {
              const data = await res.json();
              newRates[c.code] = {
                code: c.code,
                name: c.name,
                symbol: c.symbol,
                rate: data.rate,
                tableNumber: data.tableNumber,
                effectiveDate: data.effectiveDate,
              };
            }
          } catch {
            // fallback
          }
        })
      );
      setRates(newRates);
      setLastRefreshed(new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // Obliczenie przeliczenia w kalkulatorze
  const calculatedResult = React.useMemo(() => {
    if (!calcAmount || calcAmount <= 0) return 0;
    if (calcFrom === calcTo) return calcAmount;

    // Kwota w PLN
    let inPln = calcAmount;
    if (calcFrom !== "PLN") {
      const fromRate = rates[calcFrom]?.rate || 1;
      inPln = calcAmount * fromRate;
    }

    // Z PLN na walutę docelową
    if (calcTo === "PLN") {
      return Math.round(inPln * 100) / 100;
    }

    const toRate = rates[calcTo]?.rate || 1;
    return Math.round((inPln / toRate) * 100) / 100;
  }, [calcAmount, calcFrom, calcTo, rates]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Multi-waluta & Kursy NBP (Art. 31a)"
        description="Oficjalne tabele średnich kursów walut NBP, automatyczne przeliczanie kwot na fakturach VAT oraz rachunki walutowe ze SWIFT/IBAN."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRates}
            disabled={loading}
            className="gap-1.5 text-xs border-border/70"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span>Odśwież kursy</span>
          </Button>
        }
      />

      {/* Tabela średnich kursów NBP */}
      <Card className="border border-border/70 bg-card/75 backdrop-blur-md rounded-2xl shadow-apple-sm overflow-hidden">
        <div className="p-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <span>Bieżące kursy średnie Narodowego Banku Polskiego (Tabela A)</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pobierane automatycznie zgodnie z art. 31a ustawy o VAT na dzień poprzedzający zdarzenie gospodarcze
            </p>
          </div>
          {lastRefreshed && (
            <span className="text-[11px] text-muted-foreground font-mono">
              Ostatnia synchronizacja: {lastRefreshed}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/50 bg-muted/30 text-muted-foreground font-medium">
              <tr>
                <th className="py-3 px-4">Waluta</th>
                <th className="py-3 px-4">Kod ISO</th>
                <th className="py-3 px-4">Średni kurs NBP (PLN)</th>
                <th className="py-3 px-4">Numer tabeli NBP</th>
                <th className="py-3 px-4">Data notowania</th>
                <th className="py-3 px-4 text-right">Zastosowanie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {TRACKED_CURRENCIES.map((c) => {
                const info = rates[c.code];
                return (
                  <tr key={c.code} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                          {c.symbol}
                        </span>
                        <span>{c.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                      {c.code}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-foreground text-sm tabular-nums">
                      {info ? `${info.rate.toFixed(4)} zł` : "Pobieranie..."}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-muted-foreground">
                      {info?.tableNumber || "—"}
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">
                      {info?.effectiveDate || "—"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Badge tone="default" className="text-[10px]">
                        Faktury & KSeF
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Siatka: Kalkulator Walutowy + Rachunki Walutowe Firmy */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Kalkulator Walutowy */}
        <Card className="border border-border/70 bg-card/75 p-5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:shadow-apple-md space-y-4">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <Calculator className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Kalkulator przeliczeń walutowych</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="currency-calc-amount" className="text-xs text-muted-foreground">Kwota</Label>
              <Input
                id="currency-calc-amount"
                type="number"
                value={calcAmount || ""}
                onChange={(e) => setCalcAmount(Number(e.target.value))}
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Z waluty</Label>
              <Select
                value={calcFrom}
                onChange={(e) => setCalcFrom(e.target.value)}
                className="mt-1 h-9 text-xs"
              >
                <option value="PLN">PLN (Złoty polski)</option>
                {TRACKED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.name})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Na walutę</Label>
              <Select
                value={calcTo}
                onChange={(e) => setCalcTo(e.target.value)}
                className="mt-1 h-9 text-xs"
              >
                <option value="PLN">PLN (Złoty polski)</option>
                {TRACKED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.name})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground">Wynik przeliczenia:</span>
              <p className="text-2xl font-bold tracking-tight text-primary mt-0.5">
                {calculatedResult.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} {calcTo}
              </p>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              {calcFrom !== "PLN" && rates[calcFrom] && (
                <p>1 {calcFrom} = {rates[calcFrom].rate.toFixed(4)} PLN</p>
              )}
              {calcTo !== "PLN" && rates[calcTo] && (
                <p>1 {calcTo} = {rates[calcTo].rate.toFixed(4)} PLN</p>
              )}
            </div>
          </div>
        </Card>

        {/* Rachunki walutowe firmy */}
        <Card className="border border-border/70 bg-card/75 p-5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:shadow-apple-md space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              <h3 className="text-sm font-semibold text-foreground">Rachunki walutowe firmy</h3>
            </div>
            <Link prefetch={false}
              href="/settings/companies"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <span>Edytuj w profilu</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {activeCompany?.bankAccounts && activeCompany.bankAccounts.length > 0 ? (
              activeCompany.bankAccounts.map((acc, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border/50 bg-card p-3 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{acc.bankName || "Rachunek firmowy"}</span>
                      <Badge tone="default" className="text-[10px]">
                        {acc.currency || "PLN"}
                      </Badge>
                      {acc.isDefault && (
                        <Badge tone="primary" className="text-[10px]">
                          Domyślny
                        </Badge>
                      )}
                    </div>
                    <p className="font-mono text-muted-foreground mt-1">{acc.accountNumber}</p>
                  </div>
                  {acc.swiftBic && (
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground">SWIFT / BIC</span>
                      <p className="font-mono font-bold text-foreground">{acc.swiftBic}</p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                <p>Główny rachunek: <span className="font-mono text-foreground">{activeCompany?.iban || "Brak IBAN"}</span></p>
                <p className="mt-1 text-[11px]">
                  Możesz dodać dedykowane rachunki w EUR i USD w zakładce Moje Firmy.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Podstawa prawna: Art. 31a ustawy o VAT */}
      <Card className="border border-border/70 bg-card/75 p-5 backdrop-blur-md rounded-2xl shadow-apple-sm space-y-3">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
          <Info className="h-4 w-4" />
          <h4 className="text-xs font-semibold uppercase tracking-wider">
            Zasady prawne przeliczania walut obcych (Art. 31a ustawy o VAT)
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground leading-relaxed">
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-1.5">
            <span className="font-semibold text-foreground">Reguła ogólna (art. 31a ust. 1):</span>
            <p>
              Przeliczenia na złote dokonuje się według kursu średniego danej waluty obcej ogłoszonego przez Narodowy Bank Polski na <b>ostatni dzień roboczy poprzedzający dzień powstania obowiązku podatkowego</b>.
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-1.5">
            <span className="font-semibold text-foreground">Wystawienie przed sprzedażą (art. 31a ust. 2):</span>
            <p>
              Gdy podatnik wystawia fakturę przed powstaniem obowiązku podatkowego, przeliczenia dokonuje się według kursu średniego ogłoszonego przez NBP na <b>ostatni dzień roboczy poprzedzający dzień wystawienia faktury</b>.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
