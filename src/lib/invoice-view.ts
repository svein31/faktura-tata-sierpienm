import type { EffectiveStatus } from "./store";

export type InvoiceView = {
  search: string; statusFilter: "all" | EffectiveStatus;
  typeFilter: "all" | "sale" | "purchase" | "proforma";
  approvalFilter: "all" | "pending" | "approved"; currencyFilter: "all" | "PLN" | "EUR" | "USD";
  sortOrder: "date_desc" | "date_asc"; density: "comfortable" | "compact";
};
export const DEFAULT_INVOICE_VIEW: InvoiceView = {
  search: "", statusFilter: "all", typeFilter: "all", approvalFilter: "all", currencyFilter: "all",
  sortOrder: "date_desc", density: "comfortable",
};
const choices = {
  statusFilter: ["all", "paid", "draft", "issued", "overdue", "ksef_queued", "ksef_sent", "ksef_active", "ksef_rejected"],
  typeFilter: ["all", "sale", "purchase", "proforma"], approvalFilter: ["all", "pending", "approved"],
  currencyFilter: ["all", "PLN", "EUR", "USD"], sortOrder: ["date_desc", "date_asc"], density: ["comfortable", "compact"],
};
export function normalizeInvoiceView(input: unknown): InvoiceView {
  const result = { ...DEFAULT_INVOICE_VIEW };
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  const value = input as Record<string, unknown>;
  if (typeof value.search === "string") result.search = value.search.slice(0, 150);
  for (const [key, allowed] of Object.entries(choices)) {
    if (typeof value[key] === "string" && allowed.includes(value[key] as string)) Object.assign(result, { [key]: value[key] });
  }
  return result;
}
export function invoiceViewKey(userId: string, companyId: string | null) {
  return userId ? `fakturaprosto:invoice-view:v1:${encodeURIComponent(userId)}:${encodeURIComponent(companyId || "unassigned")}` : "";
}
