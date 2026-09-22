import { ApiError } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { warsawDate } from "@/lib/scheduling";
export const INVOICE_PAGE_SIZE = 30;
const choices = {
  type: ["all", "sale", "purchase", "proforma"],
  approval: ["all", "pending", "approved"],
  currency: ["all", "PLN", "EUR", "USD"],
  status: ["all", "paid", "draft", "issued", "overdue", "ksef_queued", "ksef_sent", "ksef_active", "ksef_rejected"],
};
export function invoiceSearchParams(params: URLSearchParams) {
  const selected = {} as Record<keyof typeof choices, string>;
  for (const [key, values] of Object.entries(choices)) {
    const value = params.get(key) || "all";
    if (!values.includes(value)) throw new ApiError(400, "Nieprawidłowy filtr faktur.");
    selected[key as keyof typeof choices] = value;
  }
  const search = (params.get("search") || "").trim();
  if (search.length > 150) throw new ApiError(400, "Zapytanie jest za długie.");
  const cursor = params.get("cursor");
  if (cursor && !objectId(cursor)) throw new ApiError(400, "Nieprawidłowa strona.");
  return { ...selected, search, cursor };
}
export function effectiveStatusExpression(today = warsawDate()) {
  const overdue = { $and: [{ $gt: ["$dueDate", ""] }, { $lt: ["$dueDate", today] }] };
  return { $switch: { branches: [
    { case: { $eq: ["$status", "paid"] }, then: "paid" },
    { case: { $eq: ["$status", "draft"] }, then: "draft" },
    { case: { $eq: ["$ksef.status", "QUEUED"] }, then: "ksef_queued" },
    { case: { $eq: ["$ksef.status", "REJECTED"] }, then: "ksef_rejected" },
    { case: overdue, then: "overdue" },
    { case: { $eq: ["$ksef.status", "ACTIVE"] }, then: "ksef_active" },
    { case: { $eq: ["$ksef.status", "SENT"] }, then: "ksef_sent" },
  ], default: "issued" } };
}
export function literalRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
