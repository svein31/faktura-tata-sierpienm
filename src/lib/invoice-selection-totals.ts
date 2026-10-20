import type { Invoice } from "./types";
import { invoiceTotals, round2 } from "./format";

export type InvoiceCurrencyTotal = { currency: string; count: number; net: number; vat: number; gross: number; drafts: number; proformas: number };
/** Sum document values, never convert currencies or infer a sales/cost balance. */
export function invoiceSelectionTotals(invoices: readonly Invoice[], selectedIds: readonly string[]): InvoiceCurrencyTotal[] {
  const selected = new Set(selectedIds), seen = new Set<string>(), groups = new Map<string, InvoiceCurrencyTotal>();
  for (const invoice of invoices) {
    if (!selected.has(invoice.id) || seen.has(invoice.id)) continue;
    seen.add(invoice.id);
    const group = groups.get(invoice.currency) || {currency: invoice.currency, count: 0, net: 0, vat: 0, gross: 0, drafts: 0, proformas: 0};
    const calculated = invoiceTotals(invoice);
    group.net = round2(group.net + (invoice.totalNet ?? calculated.net));
    group.vat = round2(group.vat + (invoice.totalVat ?? calculated.vat));
    group.gross = round2(group.gross + (invoice.totalGross ?? calculated.gross));
    group.count++;
    if (invoice.status === "draft" || invoice.documentStatus === "draft") group.drafts++;
    if (invoice.isProforma) group.proformas++;
    groups.set(invoice.currency, group);
  }
  return [...groups.values()].sort((a,b) => a.currency === b.currency ? 0 : a.currency === "PLN" ? -1 : b.currency === "PLN" ? 1 : a.currency.localeCompare(b.currency));
}
