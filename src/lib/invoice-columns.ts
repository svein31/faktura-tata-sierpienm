export const INVOICE_COLUMNS = [
  { id: "contractor", label: "Kontrahent", width: 200, defaultVisible: true },
  { id: "issueDate", label: "Data wystawienia", width: 140, defaultVisible: true },
  { id: "dueDate", label: "Termin płatności", width: 140, defaultVisible: true },
  { id: "gross", label: "Wartość brutto", width: 150, defaultVisible: true },
  { id: "payment", label: "Płatność", width: 180, defaultVisible: true },
  { id: "ksef", label: "Status KSeF", width: 170, defaultVisible: true },
  { id: "currency", label: "Waluta", width: 90, defaultVisible: false },
  { id: "approval", label: "Akceptacja księgowa", width: 180, defaultVisible: false },
] as const;
export type InvoiceColumnId = typeof INVOICE_COLUMNS[number]["id"];
export const DEFAULT_INVOICE_COLUMNS: InvoiceColumnId[] = INVOICE_COLUMNS.filter(column => column.defaultVisible).map(column => column.id);
export function normalizeInvoiceColumns(value: unknown): InvoiceColumnId[] {
  if (!Array.isArray(value)) return [...DEFAULT_INVOICE_COLUMNS];
  const result = INVOICE_COLUMNS.filter(column => value.includes(column.id)).map(column => column.id);
  return value.length && !result.length ? [...DEFAULT_INVOICE_COLUMNS] : result;
}
export function invoiceColumnsKey(userId: string, companyId: string | null) {
  return userId ? `fakturaprosto:invoice-columns:v1:${encodeURIComponent(userId)}:${encodeURIComponent(companyId || "unassigned")}` : "";
}
