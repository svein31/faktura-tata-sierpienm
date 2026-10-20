import { round2 as roundMoney } from "./tax/money";
import type { Currency, Invoice, InvoiceLine, VatRate } from "./types";

const fmtCache = new Map<string, Intl.NumberFormat>();
let dateFormatter: Intl.DateTimeFormat | undefined;
let monthFormatter: Intl.DateTimeFormat | undefined;

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
  dateFormatter ??= new Intl.DateTimeFormat("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" });
  return dateFormatter.format(d);
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
    case "23":
    case "8":
    case "5":
    case "0":
    case "zw":
    case "np":
    case "oo": return "bg-muted text-foreground ring-border";
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
  if (Number.isNaN(d.getTime())) return d.toLocaleDateString("pl-PL", { month: "short", year: "2-digit" });
  monthFormatter ??= new Intl.DateTimeFormat("pl-PL", { month: "short", year: "2-digit" });
  return monthFormatter.format(d);
}

