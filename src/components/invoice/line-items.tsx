"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Plus, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  lineGross,
  lineNet,
  lineVat,
  vatRateLabel,
  vatRateBadgeClass,
  formatMoney,
  round2,
  invoiceTotals,
} from "@/lib/format";
import { VAT_RATES } from "@/lib/format";
import type { Currency, InvoiceLine, Product, VatRate } from "@/lib/types";
import { uid } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function newLine(): InvoiceLine {
  return { id: uid("l"), name: "", quantity: 1, unit: "szt.", netPrice: 0, vatRate: "23" };
}

export function LineItemsEditor({
  lines,
  onChange,
  currency,
  products,
  disabled,
}: {
  lines: InvoiceLine[];
  onChange: (lines: InvoiceLine[]) => void;
  currency: Currency;
  products: Product[];
  disabled?: boolean;
}) {
  const update = (id: string, patch: Partial<InvoiceLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const applyProduct = (id: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    onChange(
      lines.map((l) =>
        l.id === id
          ? { ...l, name: p.name, unit: p.unit, netPrice: p.netPrice, vatRate: p.vatRate }
          : l
      )
    );
  };

  const totals = invoiceTotals({ lines });

  // VAT grouped summary — only include rates that have lines
  const vatGroups = Object.entries(totals.vatByRate)
    .filter(([, vat]) => lines.some((l) => l.vatRate === (Object.entries(totals.vatByRate).find(([r, v]) => v === vat)?.[0] ?? "")))
    .sort(([a], [b]) => {
      const order: Record<string, number> = { "23": 0, "8": 1, "5": 2, "0": 3, zw: 4, np: 5, oo: 6 };
      return (order[a] ?? 9) - (order[b] ?? 9);
    });

  // Actually compute per-rate net totals
  const netByRate: Partial<Record<VatRate, number>> = {};
  for (const line of lines) {
    netByRate[line.vatRate] = round2((netByRate[line.vatRate] ?? 0) + lineNet(line));
  }

  return (
    <div className="space-y-4">
      {/* ── Tabela pozycji ── */}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md shadow-sm">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 w-9">#</th>
              <th className="px-2 py-2.5">Produkt / usługa</th>
              <th className="px-2 py-2.5 w-20 text-right">Ilość</th>
              <th className="px-2 py-2.5 w-16">J.m.</th>
              <th className="px-2 py-2.5 w-28 text-right">Cena netto</th>
              <th className="px-2 py-2.5 w-20 text-center">VAT</th>
              <th className="px-2 py-2.5 w-28 text-right">Wart. netto</th>
              <th className="px-2 py-2.5 w-24 text-right">Kwota VAT</th>
              <th className="px-2 py-2.5 w-28 text-right">Brutto</th>
              <th className="px-2 py-2.5 w-9" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
                      <Package className="h-5 w-5 opacity-50" />
                    </div>
                    <p className="text-[12.5px]">Brak pozycji — dodaj pierwszą pozycję faktury.</p>
                  </div>
                </td>
              </tr>
            )}
            <AnimatePresence initial={false}>
              {lines.map((line, i) => {
                const net = lineNet(line);
                const vat = lineVat(line);
                const gross = lineGross(line);
                return (
                  <motion.tr
                    key={line.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    {/* # */}
                    <td className="px-3 py-2 text-center text-[11px] text-muted-foreground font-medium">
                      {i + 1}
                    </td>

                    {/* Nazwa */}
                    <td className="px-2 py-1.5 min-w-[180px]">
                      <div className="flex flex-col gap-1">
                        <Input
                          value={line.name}
                          onChange={(e) => update(line.id, { name: e.target.value })}
                          placeholder="Nazwa towaru / usługi"
                          disabled={disabled}
                          className="h-8 text-[12.5px]"
                        />
                        {products.length > 0 && (
                          <div className="relative">
                            <select
                              value=""
                              onChange={(e) => e.target.value && applyProduct(line.id, e.target.value)}
                              disabled={disabled}
                              className="h-6 w-full cursor-pointer rounded-md border border-dashed border-border/70 bg-transparent pl-2 pr-6 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground focus:outline-none appearance-none"
                              aria-label="Wstaw z katalogu"
                            >
                              <option value="">↳ wstaw z katalogu…</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} — {formatMoney(p.netPrice, currency)} / {p.unit}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1 h-3.5 w-3.5 text-muted-foreground/60" />
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Ilość */}
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={line.quantity}
                        onChange={(e) => update(line.id, { quantity: Number(e.target.value) || 0 })}
                        disabled={disabled}
                        className="h-8 text-right text-[12.5px]"
                      />
                    </td>

                    {/* J.m. */}
                    <td className="px-2 py-1.5">
                      <Input
                        value={line.unit}
                        onChange={(e) => update(line.id, { unit: e.target.value })}
                        disabled={disabled}
                        className="h-8 text-[12.5px]"
                      />
                    </td>

                    {/* Cena netto */}
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.netPrice}
                        onChange={(e) => update(line.id, { netPrice: Number(e.target.value) || 0 })}
                        disabled={disabled}
                        className="h-8 text-right text-[12.5px]"
                      />
                    </td>

                    {/* Stawka VAT */}
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col items-center gap-1">
                        <Select
                          value={line.vatRate}
                          onChange={(e) => update(line.id, { vatRate: e.target.value as VatRate })}
                          disabled={disabled}
                          className="h-8 text-center text-[12px]"
                        >
                          {VAT_RATES.map((r) => (
                            <option key={r} value={r}>
                              {vatRateLabel(r)}
                            </option>
                          ))}
                        </Select>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ring-1 ring-inset",
                            vatRateBadgeClass(line.vatRate)
                          )}
                        >
                          {vatRateLabel(line.vatRate)}
                        </span>
                      </div>
                    </td>

                    {/* Wartość netto */}
                    <td className="px-2 py-1.5 text-right tabular-nums text-[12.5px] font-medium text-foreground">
                      {formatMoney(net, currency)}
                    </td>

                    {/* Kwota VAT */}
                    <td className="px-2 py-1.5 text-right tabular-nums text-[12px] text-muted-foreground">
                      {vat > 0 ? formatMoney(vat, currency) : (
                        <span className="text-[11px] font-medium text-muted-foreground/60">—</span>
                      )}
                    </td>

                    {/* Brutto */}
                    <td className="px-2 py-1.5 text-right tabular-nums text-[13px] font-bold text-foreground">
                      {formatMoney(gross, currency)}
                    </td>

                    {/* Usuń */}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => onChange(lines.filter((x) => x.id !== line.id))}
                        disabled={disabled}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40"
                        aria-label="Usuń pozycję"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* ── Przycisk dodania + podsumowanie ogólne ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, newLine()])}
          disabled={disabled}
          className="rounded-xl gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Dodaj pozycję
        </Button>
        <div className="flex items-center gap-4 text-[13px]">
          <span className="text-muted-foreground">
            Netto:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatMoney(totals.net, currency)}
            </span>
          </span>
          <span className="text-muted-foreground">
            VAT:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatMoney(totals.vat, currency)}
            </span>
          </span>
          <span className="text-muted-foreground">
            Brutto:{" "}
            <span className="text-[14px] font-bold tabular-nums text-foreground">
              {formatMoney(totals.gross, currency)}
            </span>
          </span>
        </div>
      </div>

      {/* ── Tabela podsumowania VAT (wg stawek) ── */}
      {lines.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
          <div className="px-4 py-2 border-b border-border/40 bg-muted/30">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Podsumowanie VAT wg stawek
            </p>
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/30">
                <th className="px-4 py-2 text-left">Stawka VAT</th>
                <th className="px-4 py-2 text-right">Wartość netto</th>
                <th className="px-4 py-2 text-right">Kwota VAT</th>
                <th className="px-4 py-2 text-right">Wartość brutto</th>
              </tr>
            </thead>
            <tbody>
              {(Object.entries(netByRate) as [VatRate, number][]).map(([rate, net]) => {
                const vatAmount = totals.vatByRate[rate] ?? 0;
                const gross = round2(net + vatAmount);
                return (
                  <tr key={rate} className="border-b border-border/20 last:border-0">
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                          vatRateBadgeClass(rate)
                        )}
                      >
                        {vatRateLabel(rate)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-foreground">{formatMoney(net, currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {vatAmount > 0 ? formatMoney(vatAmount, currency) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-foreground">{formatMoney(gross, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border/60 bg-muted/30 font-bold">
                <td className="px-4 py-2.5 text-[11.5px] font-bold text-foreground">RAZEM</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMoney(totals.net, currency)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMoney(totals.vat, currency)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[14px] text-primary">{formatMoney(totals.gross, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
