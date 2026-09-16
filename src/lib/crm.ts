import { invoiceTotals, round2 } from "./format";
import type { Invoice, Currency } from "./types";

/** Read-only projection; never records or changes a payment. */
export function contractorHistory(invoices: Invoice[], contractorId: string, companyId: string | null) {
  const history = invoices.filter(i => i.contractorId === contractorId && (i.sellerCompanyId || null) === companyId)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.id.localeCompare(a.id));
  const balances = new Map<Currency, { currency: Currency; receivable: number; payable: number }>();
  for (const invoice of history) {
    if (invoice.isProforma || invoice.status === "draft" || invoice.documentStatus === "draft" || invoice.documentStatus === "cancelled") continue;
    const row = balances.get(invoice.currency) || { currency: invoice.currency, receivable: 0, payable: 0 };
    const outstanding = invoice.paymentStatus === "paid" || invoice.status === "paid" ? 0 : round2(invoiceTotals(invoice).gross - (invoice.paidAmount || 0));
    if (invoice.type === "sale") row.receivable = round2(row.receivable + outstanding);
    else row.payable = round2(row.payable + outstanding);
    balances.set(invoice.currency, row);
  }
  return { history, balances: [...balances.values()] };
}
