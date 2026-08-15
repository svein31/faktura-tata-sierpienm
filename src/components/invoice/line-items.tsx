"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { lineGross, lineNet, vatRateLabel } from "@/lib/format";
import { formatMoney } from "@/lib/format";
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

  const totalGross = lines.reduce((acc, l) => acc + lineGross(l), 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-2.5 py-2 w-10">#</th>
              <th className="px-2 py-2">Produkt / usługa</th>
              <th className="px-2 py-2 w-24">Ilość</th>
              <th className="px-2 py-2 w-20">J.m.</th>
              <th className="px-2 py-2 w-32 text-right">Cena netto</th>
              <th className="px-2 py-2 w-24">VAT</th>
              <th className="px-2 py-2 w-32 text-right">Brutto</th>
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Brak pozycji — dodaj pierwszą pozycję faktury.
                </td>
              </tr>
            )}
            {lines.map((line, i) => (
              <motion.tr
                key={line.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="border-b border-border/60 last:border-0"
              >
                <td className="px-2.5 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-col gap-1">
                    <Input
                      value={line.name}
                      onChange={(e) => update(line.id, { name: e.target.value })}
                      placeholder="Nazwa towaru / usługi"
                      disabled={disabled}
                      className="h-8"
                    />
                    {products.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => e.target.value && applyProduct(line.id, e.target.value)}
                        disabled={disabled}
                        className="h-7 w-full cursor-pointer rounded-md border border-dashed border-border bg-transparent px-2 text-[11.5px] text-muted-foreground hover:border-primary/50 hover:text-foreground focus:outline-none"
                        aria-label="Wstaw z katalogu"
                      >
                        <option value="">↳ wstaw z katalogu…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatMoney(p.netPrice, currency)} / {p.unit}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity}
                    onChange={(e) => update(line.id, { quantity: Number(e.target.value) || 0 })}
                    disabled={disabled}
                    className="h-8 text-right"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    value={line.unit}
                    onChange={(e) => update(line.id, { unit: e.target.value })}
                    disabled={disabled}
                    className="h-8"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.netPrice}
                    onChange={(e) => update(line.id, { netPrice: Number(e.target.value) || 0 })}
                    disabled={disabled}
                    className="h-8 text-right"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Select
                    value={line.vatRate}
                    onChange={(e) => update(line.id, { vatRate: e.target.value as VatRate })}
                    disabled={disabled}
                    className="h-8"
                  >
                    {VAT_RATES.map((r) => (
                      <option key={r} value={r}>
                        {vatRateLabel(r)}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                  {formatMoney(lineGross(line), currency)}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button
                    onClick={() => onChange(lines.filter((x) => x.id !== line.id))}
                    disabled={disabled}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                    aria-label="Usuń pozycję"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, newLine()])}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" /> Dodaj pozycję
        </Button>
        <p className="text-[13px] text-muted-foreground">
          Razem brutto:{" "}
          <span className={cn("font-bold tabular-nums text-foreground")}>
            {formatMoney(totalGross, currency)}
          </span>
        </p>
      </div>
    </div>
  );
}
