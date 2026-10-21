export const PENDING_BANK_STATUSES = ["unmatched", "ambiguous", "partially_matched"];
export type BankAllocation = { documentId: string; kind: "invoice" | "expense"; number: string; amount: number; paymentRecordId?: string; actorId: string; at: string };

/** All comparisons use safe integer cents; never silently round submitted fractions. */
export function moneyCents(value: number) {
  if (!Number.isFinite(value) || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001 || !Number.isSafeInteger(Math.round(value * 100))) throw new Error("Nieprawidłowa kwota. Podaj kwotę z dokładnością do grosza.");
  return Math.round(value * 100);
}
export function parseBankAmount(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replace(",", "."));
  try { return moneyCents(amount) >= 0 ? amount : null; } catch { return null; }
}
export function bankBalance(transaction: { amount: number; allocatedAmount?: number | null; matchStatus: string }) {
  const total = Math.abs(moneyCents(transaction.amount));
  const legacyClosed = ["matched", "manual", "ignored"].includes(transaction.matchStatus);
  const allocated = transaction.allocatedAmount == null ? legacyClosed ? total : 0 : moneyCents(transaction.allocatedAmount);
  if (allocated < 0 || allocated > total) throw new Error("Nieprawidłowe saldo transakcji. Sprawdź wcześniejsze rozliczenia.");
  return { total: total / 100, allocated: allocated / 100, available: (total - allocated) / 100 };
}
export function allocationAmount(available: number, remaining: number, requested: unknown, fullExpense = false) {
  const value = requested === undefined ? available : requested;
  if (typeof value !== "number") throw new Error("Podaj kwotę przypisania.");
  const cents = moneyCents(value), availableCents = moneyCents(available), remainingCents = moneyCents(remaining);
  if (cents <= 0 || cents > availableCents || cents > remainingCents) throw new Error("Kwota przypisania przekracza dostępne środki lub saldo dokumentu.");
  if (fullExpense && cents !== remainingCents) throw new Error("Wydatek wymaga rozliczenia pełnego salda.");
  return cents / 100;
}
