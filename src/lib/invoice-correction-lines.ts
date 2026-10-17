import type { InvoiceLine } from "./types";
import { normalizeInvoiceLineAmounts } from "./invoice-input";

/** Convert the desired final positions into signed rows of a separate correction. */
export function correctionDifferenceLines(before: InvoiceLine[], after: InvoiceLine[]): InvoiceLine[] {
  const previous = before.map(normalizeInvoiceLineAmounts);
  const current = after.filter(line => line.name.trim() && line.quantity !== 0).map(normalizeInvoiceLineAmounts);
  const remaining = new Map(current.map(line => [line.id, line]));
  const result: InvoiceLine[] = [];
  const same = (a: InvoiceLine, b: InvoiceLine) => a.name === b.name && a.unit === b.unit &&
    a.quantity === b.quantity && a.netPrice === b.netPrice && a.vatRate === b.vatRate;
  previous.forEach((line, index) => {
    const replacement = remaining.get(line.id);
    remaining.delete(line.id);
    if (replacement && same(line, replacement)) return;
    result.push({ ...line, id: `correction-before-${index}`, quantity: -line.quantity });
    if (replacement) result.push({ ...replacement, id: `correction-after-${index}` });
  });
  for (const [index, line] of [...remaining.values()].entries()) result.push({ ...line, id: `correction-new-${index}` });
  // A formal correction can leave every amount unchanged. Keep a zero-sum
  // before/after pair rather than manufacturing a new sale or a zero quantity.
  if (!result.length && previous.length) {
    result.push({ ...previous[0], id: "correction-before-0", quantity: -previous[0].quantity },
      { ...previous[0], id: "correction-after-0" });
  }
  return result;
}
