import type { InvoiceLine, PaymentMethod } from "./types";
import { VAT_RATES } from "./format";

export type SuggestedLine = Pick<InvoiceLine, "name" | "unit" | "netPrice" | "vatRate"> & { uses: number };
export type InvoiceSuggestions = {
  contractors: { id: string; name: string; nip: string; uses: number }[];
  lines: SuggestedLine[];
  terms: { method: PaymentMethod; days: number; sourceNumber: string } | null;
};
type History = { contractorId: string; currency: string; lines: unknown; number: string; paymentMethod: string; paymentTermDays: number };

/** Input is an authorized, recent-first company slice, never a global history. */
export function summarizeInvoiceSuggestions(rows: History[], currency: string, contractorId?: string | null) {
  const uses = new Map<string, number>(), items = new Map<string, SuggestedLine>();
  for (const row of rows) uses.set(row.contractorId, (uses.get(row.contractorId) || 0) + 1);
  for (const row of rows) {
    if (row.currency !== currency || contractorId && row.contractorId !== contractorId || !Array.isArray(row.lines)) continue;
    const seen = new Set<string>();
    for (const item of row.lines) {
      if (!item || typeof item !== "object") continue;
      const line = item as Partial<InvoiceLine> & { discount?: unknown };
      if (typeof line.name !== "string" || !line.name.trim() || line.name.length > 2000 || typeof line.unit !== "string" ||
        typeof line.netPrice !== "number" || !Number.isFinite(line.netPrice) || line.netPrice < 0 || !VAT_RATES.includes(line.vatRate!) ||
        line.discount !== undefined && line.discount !== 0) continue;
      const value = { name: line.name, unit: line.unit, netPrice: line.netPrice, vatRate: line.vatRate! };
      const key = JSON.stringify(value);
      if (seen.has(key)) continue;
      seen.add(key);
      const previous = items.get(key);
      items.set(key, { ...value, uses: (previous?.uses || 0) + 1 });
    }
  }
  const latest = contractorId ? rows.find(row => row.contractorId === contractorId) : undefined;
  const methods = ["transfer", "cash", "card", "blik", "compensation"];
  return {
    uses,
    lines: [...items.values()].sort((a, b) => b.uses - a.uses).slice(0, 5),
    terms: latest && methods.includes(latest.paymentMethod) && Number.isInteger(latest.paymentTermDays) && latest.paymentTermDays >= 0 && latest.paymentTermDays <= 365
      ? { method: latest.paymentMethod as PaymentMethod, days: latest.paymentTermDays, sourceNumber: latest.number } : null,
  };
}
