"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { PieChart, Layers, Percent, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney, invoiceTotals, monthKey } from "@/lib/format";
import type { Invoice } from "@/lib/types";

interface VatRateBreakdown {
  rate: string;
  label: string;
  net: number;
  vat: number;
  gross: number;
  percentage: number;
  color: string;
  bgColor: string;
  borderColor: string;
}

const RATE_COLORS: Record<string, { color: string; bgColor: string; borderColor: string }> = {
  "23": {
    color: "text-foreground",
    bgColor: "bg-[hsl(var(--chart-1))]",
    borderColor: "border-border",
  },
  "8": {
    color: "text-foreground",
    bgColor: "bg-[hsl(var(--chart-2))]",
    borderColor: "border-border",
  },
  "5": {
    color: "text-foreground",
    bgColor: "bg-[hsl(var(--chart-3))]",
    borderColor: "border-border",
  },
  "0": {
    color: "text-foreground",
    bgColor: "bg-[hsl(var(--chart-4))]",
    borderColor: "border-border",
  },
  "zw": {
    color: "text-foreground",
    bgColor: "bg-[hsl(var(--chart-5))]",
    borderColor: "border-border",
  },
  "np": {
    color: "text-foreground",
    bgColor: "bg-[hsl(var(--chart-6))]",
    borderColor: "border-border",
  },
  "oo": {
    color: "text-foreground",
    bgColor: "bg-[hsl(var(--chart-7))]",
    borderColor: "border-border",
  },
};

const DEFAULT_RATE_STYLE = {
  color: "text-muted-foreground",
  bgColor: "bg-primary",
  borderColor: "border-primary/40",
};

export function VatDistributionChart({ invoices }: { invoices: Invoice[] }) {
  const [period, setPeriod] = React.useState<"month" | "all">("month");

  const currentMonth = React.useMemo(() => {
    return new Date().toISOString().slice(0, 7);
  }, []);

  const relevantInvoices = React.useMemo(() => {
    return invoices.filter((i) => {
      if (i.type !== "sale" || i.status === "draft") return false;
      if (period === "month") {
        return monthKey(i.issueDate) === currentMonth;
      }
      return true;
    });
  }, [invoices, period, currentMonth]);

  const breakdown = React.useMemo(() => {
    const map = new Map<string, { net: number; vat: number; gross: number }>();

    for (const inv of relevantInvoices) {
      if (Array.isArray(inv.lines) && inv.lines.length > 0) {
        for (const line of inv.lines) {
          const rateKey = String(line.vatRate || "23").toLowerCase();
          const net = (line.quantity || 1) * (line.netPrice || 0);
          let vat = 0;
          if (["zw", "np", "oo", "0"].includes(rateKey)) {
            vat = 0;
          } else {
            const numRate = parseFloat(rateKey) || 0;
            vat = (net * numRate) / 100;
          }
          const gross = net + vat;

          const current = map.get(rateKey) || { net: 0, vat: 0, gross: 0 };
          current.net += net;
          current.vat += vat;
          current.gross += gross;
          map.set(rateKey, current);
        }
      } else {
        const totals = invoiceTotals(inv);
        const current = map.get("23") || { net: 0, vat: 0, gross: 0 };
        current.net += totals.net;
        current.vat += totals.vat;
        current.gross += totals.gross;
        map.set("23", current);
      }
    }

    const totalGrossAll = Array.from(map.values()).reduce((acc, val) => acc + val.gross, 0);

    const list: VatRateBreakdown[] = Array.from(map.entries())
      .map(([rate, data]) => {
        const style = RATE_COLORS[rate] || DEFAULT_RATE_STYLE;
        const percentage = totalGrossAll > 0 ? (data.gross / totalGrossAll) * 100 : 0;
        return {
          rate,
          label: rate.toUpperCase() === "ZW" ? "ZW (Zwolnione)" : rate.toUpperCase() === "NP" ? "NP (Nie podlega)" : `${rate}%`,
          net: data.net,
          vat: data.vat,
          gross: data.gross,
          percentage,
          ...style,
        };
      })
      .sort((a, b) => b.gross - a.gross);

    return { list, totalGrossAll };
  }, [relevantInvoices]);

  const totalVatCalculated = breakdown.list.reduce((acc, i) => acc + i.vat, 0);

  return (
    <Card className="h-full rounded-xl border border-border/80 bg-card p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Percent className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Rozkład stawek VAT</h3>
              <p className="text-xs text-muted-foreground">
                {period === "month" ? "Bieżący miesiąc rozliczeniowy" : "Wszystkie wystawione faktury"}
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-xl bg-muted/40 p-1 border border-border/60 text-xs">
            <button
              type="button"
              onClick={() => setPeriod("month")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                period === "month" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Ten miesiąc
            </button>
            <button
              type="button"
              onClick={() => setPeriod("all")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                period === "all" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Cały okres
            </button>
          </div>
        </div>

        {/* Pasek postępu reprezentujący udziały stawek */}
        {breakdown.list.length > 0 ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40 p-0.5 border border-border/60">
                {breakdown.list.map((item) => (
                  <motion.div
                    key={item.rate}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(item.percentage, 3)}%` }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className={`h-full first:rounded-l-full last:rounded-r-full ${item.bgColor}`}
                    title={`${item.label}: ${item.percentage.toFixed(1)}% (${formatMoney(item.gross, "PLN")})`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
                <span>Podatek VAT należny: <strong className="text-foreground">{formatMoney(totalVatCalculated, "PLN")}</strong></span>
                <span>Obrót brutto: <strong className="text-foreground">{formatMoney(breakdown.totalGrossAll, "PLN")}</strong></span>
              </div>
            </div>

            {/* Siatka poszczególnych stawek */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {breakdown.list.map((item, idx) => (
                <motion.div
                  key={item.rate}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.2 }}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.bgColor}`} />
                    <div>
                      <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <span>{item.label}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          ({item.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Netto: {formatMoney(item.net, "PLN")}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-foreground tabular-nums">
                      {formatMoney(item.vat, "PLN")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      VAT
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Percent}
            title="Brak danych w wybranym okresie"
            description="Wystaw lub zaimportuj faktury sprzedaży, aby zobaczyć strukturę stawek VAT."
            className="py-8"
          />
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
        <span>Zgodne ze strukturą deklaracji JPK_V7M/K</span>
        <span className="text-primary font-medium">Auto-aktualizacja</span>
      </div>
    </Card>
  );
}
