import { round2, roundHalfUp } from "./tax/money";

/** Precision accepted by invoice writes. Preserve invalid values for validation. */
export function normalizeInvoiceLineAmounts<T extends { quantity: number; netPrice: number }>(line: T): T {
  return {
    ...line,
    quantity: Number.isFinite(line.quantity) ? roundHalfUp(line.quantity, 6) : line.quantity,
    netPrice: Number.isFinite(line.netPrice) ? round2(line.netPrice) : line.netPrice,
  };
}

function numericVatPercent(vatRate: string): number {
  return vatRate === "23" || vatRate === "8" || vatRate === "5" || vatRate === "0" ? Number(vatRate) : 0;
}

/** Unit gross price computed from unit net price and VAT rate (consistent with lineGross for qty = 1). */
export function unitGrossFromNet(netPrice: number, vatRate: string): number {
  if (!Number.isFinite(netPrice)) return 0;
  const net = round2(netPrice);
  const rate = numericVatPercent(vatRate);
  if (rate === 0) return net;
  return round2(net + round2((net * rate) / 100));
}

/** Unit net price computed from unit gross price and VAT rate (two-way Netto <-> Brutto). */
export function unitNetFromGross(grossPrice: number, vatRate: string): number {
  if (!Number.isFinite(grossPrice)) return 0;
  const gross = round2(grossPrice);
  const rate = numericVatPercent(vatRate);
  if (rate === 0) return gross;
  const approx = round2(gross / (1 + rate / 100));
  if (unitGrossFromNet(approx, vatRate) === gross) return approx;
  for (const delta of [-0.01, 0.01]) {
    const candidate = round2(approx + delta);
    if (candidate >= 0 && unitGrossFromNet(candidate, vatRate) === gross) return candidate;
  }
  return approx;
}
