"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BarChart3, Percent, Receipt, Wallet } from "lucide-react";
import { useAppStore, effectiveStatus, STATUS_META, getContractor } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import {
  formatMoney,
  invoiceTotals,
  monthKey,
  monthLabel,
  round2,
  vatPercent,
} from "@/lib/format";
import {
  RevenueAreaChart,
  StatusPieChart,
  VatStackedBarChart,
  CHART_COLORS,
} from "@/components/charts";
import type { EffectiveStatus } from "@/lib/store";

function MiniStat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] text-muted-foreground">{label}</p>
          <p className="text-[17px] font-bold tabular-nums leading-tight">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { invoices, contractors } = useAppStore();

  const sales = invoices.filter((i) => i.type === "sale" && i.status !== "draft");

  const totalNet = sales.reduce((a, i) => a + invoiceTotals(i).net, 0);
  const totalGross = sales.reduce((a, i) => a + invoiceTotals(i).gross, 0);
  const totalVat = sales.reduce((a, i) => a + invoiceTotals(i).vat, 0);
  const avgInvoice = sales.length ? totalGross / sales.length : 0;
  const plnGross = sales
    .filter((i) => i.currency === "PLN")
    .reduce((a, i) => a + invoiceTotals(i).gross, 0);

  // Ostatnie 6 miesięcy
  const months: string[] = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const revenueData = months.map((mk) => {
    const items = sales.filter((i) => monthKey(i.issueDate) === mk);
    return {
      label: monthLabel(mk),
      netto: round2(items.reduce((a, i) => a + invoiceTotals(i).net, 0)),
      brutto: round2(items.reduce((a, i) => a + invoiceTotals(i).gross, 0)),
    };
  });

  // VAT wg stawki — suma za cały okres (procentowy udział)
  const vatByRate: Record<string, number> = {};
  for (const i of sales) {
    const t = invoiceTotals(i);
    for (const [rate, amount] of Object.entries(t.vatByRate)) {
      vatByRate[rate] = round2((vatByRate[rate] ?? 0) + (amount ?? 0));
    }
  }
  const vatTotal = Object.values(vatByRate).reduce((a, b) => a + b, 0) || 1;
  const vatShareData = Object.entries(vatByRate).map(([rate, value]) => ({
    rate,
    value,
    pct: round2((value / vatTotal) * 100),
  }));

  const vatStackData = months.map((mk) => {
    const items = sales.filter((i) => monthKey(i.issueDate) === mk);
    const row: { label: string; "23": number; "8": number; "5": number; "0": number; zw: number } = {
      label: monthLabel(mk),
      "23": 0,
      "8": 0,
      "5": 0,
      "0": 0,
      zw: 0,
    };
    for (const i of items) {
      const t = invoiceTotals(i);
      for (const [rate, amount] of Object.entries(t.vatByRate)) {
        if (rate === "23" || rate === "8" || rate === "5" || rate === "0") {
          row[rate] = round2(row[rate] + (amount ?? 0));
        } else {
          row.zw = round2(row.zw + (amount ?? 0));
        }
      }
    }
    return row;
  });

  // Waluty
  const currencyData = (["PLN", "EUR", "USD"] as const)
    .map((c) => ({
      name: c,
      value: round2(sales.filter((i) => i.currency === c).reduce((a, i) => a + invoiceTotals(i).gross, 0)),
    }))
    .filter((d) => d.value > 0);
  const currencyColor: Record<string, string> = {
    PLN: CHART_COLORS.indigo,
    EUR: CHART_COLORS.emerald,
    USD: CHART_COLORS.amber,
  };

  // Statusy
  const statusCounts = new Map<EffectiveStatus, number>();
  for (const i of sales) {
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

  // Wg kontrahenta
  const byContractor = new Map<string, { count: number; gross: number }>();
  for (const i of sales) {
    const cur = byContractor.get(i.contractorId) ?? { count: 0, gross: 0 };
    cur.count += 1;
    cur.gross += i.currency === "PLN" ? invoiceTotals(i).gross : invoiceTotals(i).gross;
    byContractor.set(i.contractorId, cur);
  }
  const contractorRows = [...byContractor.entries()]
    .sort((a, b) => b[1].gross - a[1].gross)
    .map(([id, v]) => ({
      name: getContractor(contractors, id)?.name ?? "—",
      count: v.count,
      gross: round2(v.gross),
    }));

  return (
    <div>
      <PageHeader
        title="Analityka"
        description="Przychody, podatek VAT i struktura sprzedaży — na podstawie faktur w systemie."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Przychód netto (wszystko)" value={formatMoney(totalNet, "PLN")} sub="faktury sprzedaży" icon={<BarChart3 className="h-4 w-4" />} />
        <MiniStat label="Przychód brutto" value={formatMoney(totalGross, "PLN")} sub="w tym VAT" icon={<Wallet className="h-4 w-4" />} />
        <MiniStat label="Podatek VAT (należny)" value={formatMoney(totalVat, "PLN")} sub="suma kwot VAT" icon={<Percent className="h-4 w-4" />} />
        <MiniStat label="Średnia wartość faktury" value={formatMoney(avgInvoice, "PLN")} sub={`${sales.length} dokumentów · PLN: ${formatMoney(plnGross, "PLN")}`} icon={<Receipt className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Przychody miesięczne</CardTitle>
            <CardDescription>Netto i brutto wg daty wystawienia (ostatnie 6 miesięcy)</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueAreaChart data={revenueData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Podatek VAT wg stawek</CardTitle>
            <CardDescription>Udział stawek w sumie VAT</CardDescription>
          </CardHeader>
          <CardContent>
            {vatShareData.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted-foreground">Brak danych.</p>
            ) : (
              <div className="space-y-2.5">
                {vatShareData.map((v) => (
                  <div key={v.rate}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="font-medium">
                        {v.rate === "23" || v.rate === "8" || v.rate === "5" || v.rate === "0"
                          ? `stawka ${v.rate}%`
                          : v.rate === "zw"
                            ? "zwolnione (zw.)"
                            : "nie podlega (np.)"}
                      </span>
                      <span className="text-muted-foreground">
                        {formatMoney(v.value, "PLN")} · {v.pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(v.pct, 2)}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{
                          background:
                            v.rate === "23"
                              ? CHART_COLORS.indigo
                              : v.rate === "8"
                                ? CHART_COLORS.sky
                                : v.rate === "5"
                                  ? CHART_COLORS.emerald
                                  : v.rate === "0"
                                    ? CHART_COLORS.slate
                                    : CHART_COLORS.amber,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>VAT miesięcznie (w ujęciu stawek)</CardTitle>
            <CardDescription>Wysokość podatku wg stawki — ostatnie 6 miesięcy</CardDescription>
          </CardHeader>
          <CardContent>
            <VatStackedBarChart data={vatStackData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Statusy faktur</CardTitle>
            <CardDescription>Liczba dokumentów wg statusu</CardDescription>
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

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Waluty</CardTitle>
            <CardDescription>Wartość brutto wg waluty (suma, bez przeliczeń)</CardDescription>
          </CardHeader>
          <CardContent>
            {currencyData.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted-foreground">Brak danych.</p>
            ) : (
              <div className="space-y-2.5">
                {currencyData.map((c) => (
                  <div key={c.name}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-muted-foreground">{formatMoney(c.value, c.name)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.max((c.value / Math.max(...currencyData.map((x) => x.value))) * 100, 2)}%`,
                        }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ background: currencyColor[c.name] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kontrahenci — wartość sprzedaży</CardTitle>
            <CardDescription>Wartości brutto (bez przeliczania walut)</CardDescription>
          </CardHeader>
          <CardContent>
            {contractorRows.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted-foreground">Brak danych.</p>
            ) : (
              <div className="divide-y divide-border/70">
                {contractorRows.map((r, idx) => (
                  <div key={r.name} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
                        style={{
                          background:
                            idx === 0 ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))",
                          color:
                            idx === 0 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate text-[13px] font-medium">{r.name}</span>
                      <Badge tone="outline" className="hidden sm:inline-flex">
                        {r.count} faktur
                      </Badge>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums">
                      {formatMoney(r.gross, "PLN")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-center text-[11.5px] text-muted-foreground">
        Analiza dotyczy faktur sprzedażowych (bez szkiców). Kursy walut nie są przeliczane — wartości
        EUR/USD pozostają w walucie dokumentu.
      </p>
    </div>
  );
}
