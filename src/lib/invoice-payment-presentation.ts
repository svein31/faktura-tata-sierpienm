import type { Invoice } from "./types";
import { todayISO } from "./utils";

/** Read-only labels: transmission state must never stand in for payment state. */
export function invoicePaymentPresentation(invoice: Invoice, today = todayISO()) {
  const neutral = "border border-border bg-muted/30 text-muted-foreground";
  if (invoice.documentStatus === "cancelled") return {label: "Anulowana", color: neutral, dot: "bg-muted-foreground"};
  if (invoice.status === "draft") return {label: "Szkic", color: neutral, dot: "bg-muted-foreground"};
  if (invoice.paymentStatus === "paid" || invoice.status === "paid") return {label: "Opłacona", color: "border border-[hsl(var(--status-paid)/0.2)] bg-[hsl(var(--status-paid)/0.08)] text-[hsl(var(--status-paid))]", dot: "bg-[hsl(var(--status-paid))]"};
  if (invoice.isCorrection) return {label: "Rozliczenie korekty", color: neutral, dot: "bg-muted-foreground"};
  const overdue = invoice.paymentStatus === "overdue" || Boolean(invoice.dueDate && invoice.dueDate < today);
  const partial = invoice.paymentStatus === "partially_paid" || (invoice.paidAmount ?? 0) > 0;
  if (overdue) return {label: partial ? "Częściowo · po terminie" : "Po terminie", color: "border border-[hsl(var(--status-overdue)/0.2)] bg-[hsl(var(--status-overdue)/0.08)] text-[hsl(var(--status-overdue))]", dot: "bg-[hsl(var(--status-overdue))]"};
  if (partial) return {label: "Częściowo opłacona", color: "border border-[hsl(var(--status-pending)/0.2)] bg-[hsl(var(--status-pending)/0.08)] text-[hsl(var(--status-pending))]", dot: "bg-[hsl(var(--status-pending))]"};
  return {label: "Do zapłaty", color: neutral, dot: "bg-muted-foreground"};
}
