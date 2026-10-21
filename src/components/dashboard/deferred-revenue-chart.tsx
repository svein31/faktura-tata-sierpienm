"use client";
import * as React from "react";
import { formatMoney, monthLabel } from "@/lib/format";
import type { Currency } from "@/lib/types";
import type { Overview } from "@/lib/use-overview";

/** Monthly points use native SVG without downloading the full reporting runtime. */
export function DeferredRevenueChart({ months, currency }: { months: Overview["months"]; currency: string }) {
  const [focused, setFocused] = React.useState<string | null>(null);
  const points = months.map((month, index) => {
    const value = month.values.find(value => value.currency === currency);
    return { key: month.key, label: monthLabel(month.key), net: value?.net || 0, gross: value?.gross || 0,
      x: months.length < 2 ? 500 : index * 1000 / (months.length - 1) };
  });
  const low = Math.min(0, ...points.flatMap(point => [point.net, point.gross]));
  const high = Math.max(0, ...points.flatMap(point => [point.net, point.gross]));
  const range = high - low || 1;
  const y = (value: number) => 140 - (value - low) / range * 130;
  const path = (field: "net" | "gross") => points.map((point, index) => `${index ? "L" : "M"}${point.x},${y(point[field])}`).join(" ");
  const selected = points.find(point => point.key === focused);
  const money = (value: number) => formatMoney(value, currency as Currency);
  return <div className="relative mt-5 h-[210px]" data-revenue-chart="lightweight">
    <div className="grid h-[160px] grid-cols-[64px_minmax(0,1fr)] gap-2 pr-3">
      <div aria-hidden="true" className="relative text-right text-xs tabular-nums text-muted-foreground">
        {[0, 1, 2, 3, 4].map(index => <span key={index} className="absolute right-0 -translate-y-1/2" style={{ top: `${10 + index * 32.5}px` }}>
          {new Intl.NumberFormat("pl-PL", { notation: "compact", maximumFractionDigits: 1 }).format(high - range * index / 4)}
        </span>)}
      </div>
      <div className="relative min-w-0" onMouseLeave={() => setFocused(null)}>
        <svg aria-hidden="true" viewBox="0 0 1000 150" preserveAspectRatio="none" className="h-[150px] w-full overflow-visible">
          {[10, 42.5, 75, 107.5, 140].map(tick => <line key={tick} x1="0" x2="1000" y1={tick} y2={tick} stroke="hsl(var(--border))" vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />)}
          <path d={path("net")} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d={path("gross")} fill="none" stroke="hsl(var(--chart-2))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {selected && <line x1={selected.x} x2={selected.x} y1="0" y2="150" stroke="hsl(var(--muted-foreground))" vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />}
        </svg>
        {points.map(point => <button key={point.key} type="button" aria-label={`${point.label}: netto ${money(point.net)}, brutto ${money(point.gross)}`}
          onMouseEnter={() => setFocused(point.key)} onFocus={() => setFocused(point.key)} onBlur={() => setFocused(null)} onClick={() => setFocused(point.key)}
          onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setFocused(null); } }}
          className="absolute top-0 h-[150px] w-6 -translate-x-1/2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ left: `${point.x / 10}%` }} />)}
        <div aria-hidden="true" className="flex justify-between gap-1 text-[11px] text-muted-foreground">{points.map(point => <span key={point.key}>{point.label}</span>)}</div>
      </div>
    </div>
    <div aria-hidden="true" className="mt-4 flex justify-center gap-5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-primary" />Netto</span>
      <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-[hsl(var(--chart-2))]" />Brutto</span>
    </div>
    {selected && <div role="status" className="pointer-events-none absolute right-3 top-0 max-w-full rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-[var(--shadow-popup)]">
      <p className="font-medium">{selected.label}</p><p>Netto: {money(selected.net)}</p><p>Brutto: {money(selected.gross)}</p>
    </div>}
  </div>;
}
