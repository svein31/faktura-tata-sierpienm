import { ApiError, cleanStr, FieldError } from "./api";
import { isIsoCalendarDate } from "./nbp";
import { round2 } from "./tax/money";

const PAYMENT_METHODS = ["transfer", "cash", "card", "blik", "compensation"];

/** Validate before a ledger write; JavaScript Date alone normalises 30 February. */
export function parseInvoicePayment(body: Record<string, unknown>, now = new Date()) {
  if (typeof body.amount !== "number" && typeof body.amount !== "string") throw new FieldError("amount", "Podaj kwotę wpłaty.");
  const rawAmount = typeof body.amount === "number" ? body.amount : Number(body.amount.trim());
  const amount = round2(rawAmount);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > 1e12 || amount <= 0) throw new FieldError("amount", "Kwota wpłaty musi być dodatnia i mieścić się w obsługiwanym zakresie.");
  const method = cleanStr(body.method, 30, "method") || "transfer";
  if (!PAYMENT_METHODS.includes(method)) throw new FieldError("method", "Wybierz poprawną metodę płatności.");
  const note = cleanStr(body.note, 1000, "note") || null;
  const value = cleanStr(body.paidAt, 40, "paidAt");
  const paidAt = value ? new Date(value) : now;
  if (value && (!isIsoCalendarDate(value.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value) || !Number.isFinite(paidAt.getTime()))) throw new FieldError("paidAt", "Podaj poprawną datę wpłaty.");
  if (!Number.isFinite(paidAt.getTime())) throw new ApiError(400, "Nieprawidłowa data wpłaty.");
  return { amount, method, note, paidAt };
}
