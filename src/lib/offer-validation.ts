import { warsawDate } from "@/lib/scheduling";
import { isIsoCalendarDate } from "@/lib/nbp";
import { ApiError } from "@/lib/api";
import { invoiceTotals, VAT_RATES } from "@/lib/format";
import type { InvoiceLine, VatRate } from "@/lib/types";

export function offerAmounts(input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > 200) throw new ApiError(400, "Oferta musi zawierać od 1 do 200 pozycji.");
  const lines = input.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new ApiError(400, "Nieprawidłowa pozycja oferty.");
    const rate = String(raw.vatRate ?? "23").replace(/%$/, "") as VatRate;
    const quantity = Number(raw.quantity), netPrice = Number(raw.netPrice);
    if (!String(raw.name || "").trim() || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9 || !Number.isFinite(netPrice) || netPrice < 0 || netPrice > 1e9 || !VAT_RATES.includes(rate)) throw new ApiError(400, "Sprawdź nazwę, ilość, cenę i stawkę VAT pozycji.");
    return { id: String(raw.id || index).slice(0, 100), name: String(raw.name).trim().slice(0, 1000), unit: String(raw.unit || "szt.").slice(0, 30), quantity, netPrice, vatRate: rate } satisfies InvoiceLine;
  });
  const totals = invoiceTotals({ lines });
  if (totals.gross > 1e12) throw new ApiError(400, "Przekroczono dopuszczalną wartość oferty.");
  return { lines, totalNet: totals.net, totalVat: totals.vat, totalGross: totals.gross };
}

export function assertOfferVersion(actual: number, expected: unknown) {
  if (!Number.isInteger(expected) || actual !== expected) throw new ApiError(409, "Oferta zmieniła się. Odśwież dokument przed zapisaniem decyzji.", "STALE_VERSION");
}

export function offerCanBeDecided(offer: { status: string; validUntil: string }, now = new Date()) {
  return offer.status === "sent" && isIsoCalendarDate(offer.validUntil) && offer.validUntil >= warsawDate(now);
}
