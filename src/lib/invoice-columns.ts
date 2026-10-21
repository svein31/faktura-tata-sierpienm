export const INVOICE_COLUMNS = [
  { id: "contractor", label: "Kontrahent", width: 176, defaultVisible: true },
  // The date stays below the document number; its separate column is optional.
  { id: "issueDate", label: "Data wystawienia", width: 120, defaultVisible: false },
  { id: "dueDate", label: "Termin płatności", width: 120, defaultVisible: true },
  { id: "gross", label: "Wartość brutto", width: 136, defaultVisible: true },
  { id: "ksef", label: "Status KSeF", width: 136, defaultVisible: true },
  { id: "currency", label: "Waluta", width: 90, defaultVisible: false },
  { id: "approval", label: "Akceptacja księgowa", width: 180, defaultVisible: false },
  // Keep payment immediately before actions so the two pinned columns remain
  // adjacent at both scroll extremes, including saved views with extra columns.
  { id: "payment", label: "Płatność", width: 144, defaultVisible: true },
] as const;
export type InvoiceColumnId = typeof INVOICE_COLUMNS[number]["id"];
export const INVOICE_DOCUMENT_WIDTH = 216;
export const INVOICE_ACTIONS_WIDTH = 176;
export const DEFAULT_INVOICE_COLUMNS: InvoiceColumnId[] = INVOICE_COLUMNS.filter(column => column.defaultVisible).map(column => column.id);
export function normalizeInvoiceColumns(value: unknown): InvoiceColumnId[] {
  if (!Array.isArray(value)) return [...DEFAULT_INVOICE_COLUMNS];
  const result = INVOICE_COLUMNS.filter(column => value.includes(column.id)).map(column => column.id);
  return value.length && !result.length ? [...DEFAULT_INVOICE_COLUMNS] : result;
}
export function invoiceColumnsKey(userId: string, companyId: string | null) {
  return userId ? `fakturaprosto:invoice-columns:v1:${encodeURIComponent(userId)}:${encodeURIComponent(companyId || "unassigned")}` : "";
}
