import { round2, roundHalfUp } from "./tax/money";

/** Precision accepted by invoice writes. Preserve invalid values for validation. */
export function normalizeInvoiceLineAmounts<T extends { quantity: number; netPrice: number }>(line: T): T {
  return {
    ...line,
    quantity: Number.isFinite(line.quantity) ? roundHalfUp(line.quantity, 6) : line.quantity,
    netPrice: Number.isFinite(line.netPrice) ? round2(line.netPrice) : line.netPrice,
  };
}
