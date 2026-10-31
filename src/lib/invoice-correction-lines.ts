import type { InvoiceLine } from "./types";
import { normalizeInvoiceLineAmounts } from "./invoice-input";

/** Convert the desired final positions into signed rows of a separate correction. */
export function correctionDifferenceLines(before: InvoiceLine[], after: InvoiceLine[]): InvoiceLine[] {
  const seenPrev = new Set<string>();
  const previous = before.map((line, index) => {
    const normalized = normalizeInvoiceLineAmounts(line);
    const rawId = line.id && String(line.id).trim() ? String(line.id).trim() : "";
    const id = rawId && !seenPrev.has(rawId) ? rawId : `__positional_${index}`;
    seenPrev.add(id);
    return { ...normalized, id };
  });
  const seenCurr = new Set<string>();
  const current = after
    .map((line, index) => {
      const normalized = normalizeInvoiceLineAmounts(line);
      const rawId = line.id && String(line.id).trim() ? String(line.id).trim() : "";
      const id = rawId && !seenCurr.has(rawId) ? rawId : `__positional_${index}`;
      seenCurr.add(id);
      return { ...normalized, id };
    })
    .filter(line => line.name.trim() && line.quantity !== 0);
  const remaining = new Map(current.map(line => [line.id, line]));
  const result: InvoiceLine[] = [];
  const same = (a: InvoiceLine, b: InvoiceLine) => a.name === b.name && a.unit === b.unit &&
    a.quantity === b.quantity && a.netPrice === b.netPrice && a.vatRate === b.vatRate;
  previous.forEach((line, index) => {
    const replacement = remaining.get(line.id);
    remaining.delete(line.id);
    if (replacement && same(line, replacement)) return;
    if (line.quantity !== 0) result.push({ ...line, id: `correction-before-${index}`, quantity: -line.quantity });
    if (replacement) result.push({ ...replacement, id: `correction-after-${index}` });
  });
  for (const [index, line] of [...remaining.values()].entries()) result.push({ ...line, id: `correction-new-${index}` });
  // A formal correction can leave every amount unchanged. Keep a zero-sum
  // before/after pair rather than manufacturing a new sale or a zero quantity.
  if (!result.length && previous.length) {
    const base = previous.find(l => l.quantity !== 0) ?? previous[0];
    if (base.quantity !== 0) {
      result.push({ ...base, id: "correction-before-0", quantity: -base.quantity },
        { ...base, id: "correction-after-0" });
    }
  }
  return result;
}
