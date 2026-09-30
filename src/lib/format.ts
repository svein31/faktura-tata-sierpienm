import { round2 as roundMoney } from "./tax/money";
import type { Currency, Invoice, InvoiceLine, VatRate } from "./types";

const fmtCache = new Map<string, Intl.NumberFormat>();

function getFmt(currency: Currency) {
  const key = currency;
  if (!fmtCache.has(key)) {
    fmtCache.set(
      key,
      new Intl.NumberFormat("pl-PL", { style: "currency", currency, minimumFractionDigits: 2 })
    );
  }
  return fmtCache.get(key)!;
}

export function formatMoney(amount: number, currency: Currency = "PLN"): string {
  return getFmt(currency).format(amount);
}

export function formatNumber(n: number, maxFrac = 2): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: maxFrac }).format(n);
}

export function formatCompact(amount: number, currency: Currency = "PLN"): string {
  const abs = Math.abs(amount);
  const symbol = currency === "PLN" ? "zł" : currency;
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} mln ${symbol}`;
  if (abs >= 1_000) return `${(amount / 1_000).toFixed(0)} tys. ${symbol}`;
  return `${amount.toFixed(0)} ${symbol}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const VAT_RATES: VatRate[] = ["23", "8", "5", "0", "zw", "np", "oo"];

export function vatPercent(rate: VatRate): number {
  if (rate === "23" || rate === "8" || rate === "5" || rate === "0") return Number(rate);
  return 0; // zw, np, oo — brak VAT
}

export function vatRateLabel(rate: VatRate): string {
  switch (rate) {
    case "zw":
      return "zw.";
    case "np":
      return "np.";
    case "oo":
      return "o.o.";
    default:
      return `${rate}%`;
  }
}

/** Kolor badge'a dla stawki VAT (Tailwind className) */
export function vatRateBadgeClass(rate: VatRate): string {
  switch (rate) {
    case "23": return "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 ring-indigo-500/20";
    case "8":  return "bg-sky-500/12 text-sky-600 dark:text-sky-400 ring-sky-500/20";
    case "5":  return "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20";
    case "0":  return "bg-slate-500/12 text-slate-500 ring-slate-500/20";
    case "zw": return "bg-amber-500/12 text-amber-600 dark:text-amber-400 ring-amber-500/20";
    case "np": return "bg-orange-500/12 text-orange-600 dark:text-orange-400 ring-orange-500/20";
    case "oo": return "bg-rose-500/12 text-rose-600 dark:text-rose-400 ring-rose-500/20";
    default:   return "bg-muted text-muted-foreground ring-border";
  }
}

export function round2(n: number): number {
  return roundMoney(n);
}

export function lineNet(line: InvoiceLine): number {
  if (Number.isFinite(line.settlementNet) && Number.isFinite(line.settlementVat)) return round2(line.settlementNet!);
  return round2(line.quantity * line.netPrice);
}

export function lineVat(line: InvoiceLine): number {
  if (Number.isFinite(line.settlementNet) && Number.isFinite(line.settlementVat)) return round2(line.settlementVat!);
  return round2((lineNet(line) * vatPercent(line.vatRate)) / 100);
}

export function lineGross(line: InvoiceLine): number {
  return round2(lineNet(line) + lineVat(line));
}

export interface InvoiceTotals {
  net: number;
  vat: number;
  gross: number;
  vatByRate: Partial<Record<VatRate, number>>;
}

export function invoiceTotals(invoice: Pick<Invoice, "lines">): InvoiceTotals {
  const totals: InvoiceTotals = { net: 0, vat: 0, gross: 0, vatByRate: {} };
  for (const line of invoice.lines) {
    const n = lineNet(line);
    const v = lineVat(line);
    totals.net = round2(totals.net + n);
    totals.vat = round2(totals.vat + v);
    totals.gross = round2(totals.gross + n + v);
    totals.vatByRate[line.vatRate] = round2((totals.vatByRate[line.vatRate] ?? 0) + v);
  }
  return totals;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pl-PL", { month: "short", year: "2-digit" });
}

