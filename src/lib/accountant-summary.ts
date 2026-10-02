import { invoiceTotals, round2 } from "@/lib/format";

type Amounts = { lines?: unknown; currency: string; totalNet?: number | null; totalVat?: number | null; totalGross?: number | null };
export type AccountingInvoice = Amounts & { type: string; status: string; documentStatus?: string | null; isProforma?: boolean | null };
export function isAccountingInvoice(invoice: AccountingInvoice) {
  return !invoice.isProforma && !["draft", "cancelled"].includes(invoice.documentStatus || invoice.status);
}
export function financialAmounts(record:Amounts){
 if(Array.isArray(record.lines)&&record.lines.length&&record.lines.every(line=>line&&Number.isFinite(line.quantity)&&Number.isFinite(line.netPrice))){const totals=invoiceTotals({lines:record.lines} as any);return {totalNet:totals.net,totalVat:totals.vat,totalGross:totals.gross};}
 return {totalNet:record.totalNet||0,totalVat:record.totalVat||0,totalGross:record.totalGross||0};
}
export function monthlySummary(sales: Amounts[], costs: Amounts[], currency: string) {
  const invoices = sales.filter(i => i.currency === currency), expenses = costs.filter(i => i.currency === currency);
  const sum = (rows: Amounts[], field: "totalNet" | "totalVat" | "totalGross") => round2(rows.reduce((v, r) => v + (financialAmounts(r)[field] || 0), 0));
  const salesNet = sum(invoices, "totalNet"), salesVat = sum(invoices, "totalVat"), expenseNet = sum(expenses, "totalNet"), expenseVat = sum(expenses, "totalVat");
  return { salesCount: invoices.length, salesNet, salesVat, salesGross: sum(invoices, "totalGross"), expenseCount: expenses.length, expenseNet, expenseVat, expenseGross: sum(expenses, "totalGross"), vatBalance: round2(salesVat - expenseVat), incomeBeforeTax: round2(salesNet - expenseNet) };
}

/** Excel/LibreOffice formula injection and delimiter/quote/newline escaping. */
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text) && typeof value !== "number") text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
