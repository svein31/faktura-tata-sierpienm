import type { Invoice } from "./types";
import { todayISO } from "./utils";

/** Read-only labels: transmission state must never stand in for payment state. */
export function invoicePaymentPresentation(invoice: Invoice, today = todayISO()) {
  const neutral = "border border-border bg-muted/30 text-muted-foreground";
  if (invoice.documentStatus === "cancelled") return {label: "Anulowana", color: neutral, dot: "bg-muted-foreground"};
  if (invoice.status === "draft") return {label: "Szkic", color: neutral, dot: "bg-muted-foreground"};
  if (invoice.paymentStatus === "paid" || invoice.status === "paid") return {label: "Opłacona", color: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500"};
  if (invoice.isCorrection) return {label: "Rozliczenie korekty", color: neutral, dot: "bg-muted-foreground"};
  const overdue = invoice.paymentStatus === "overdue" || Boolean(invoice.dueDate && invoice.dueDate < today);
  const partial = invoice.paymentStatus === "partially_paid" || (invoice.paidAmount ?? 0) > 0;
  if (overdue) return {label: partial ? "Częściowo · po terminie" : "Po terminie", color: "border border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300", dot: "bg-rose-500"};
  if (partial) return {label: "Częściowo opłacona", color: "border border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300", dot: "bg-amber-500"};
  return {label: "Do zapłaty", color: neutral, dot: "bg-muted-foreground"};
}
