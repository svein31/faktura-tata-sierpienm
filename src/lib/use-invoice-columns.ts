"use client";
import * as React from "react";
import { useSessionUser } from "./session-context";
import { DEFAULT_INVOICE_COLUMNS, invoiceColumnsKey, normalizeInvoiceColumns, type InvoiceColumnId } from "./invoice-columns";

function decode(raw: string | null) {
  try { return raw && raw.length <= 4096 ? normalizeInvoiceColumns(JSON.parse(raw)) : [...DEFAULT_INVOICE_COLUMNS]; }
  catch { return [...DEFAULT_INVOICE_COLUMNS]; }
}
/** Only column preferences are durable. No invoice/customer data is stored. */
export function useInvoiceColumns(companyId: string | null) {
  const user = useSessionUser();
  const key = invoiceColumnsKey(user.id, companyId);
  const [state, setState] = React.useState({ key: "", columns: DEFAULT_INVOICE_COLUMNS });
  const columns = state.key === key ? state.columns : DEFAULT_INVOICE_COLUMNS;
  const latest = React.useRef({key, columns}); latest.current = {key, columns};
  React.useLayoutEffect(() => {
    let columns = [...DEFAULT_INVOICE_COLUMNS];
    try { columns = decode(key ? localStorage.getItem(key) : null); } catch { /* Private browsing/storage restrictions. */ }
    latest.current = {key, columns};setState({key, columns});
    const changed = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      const columns = decode(event.newValue);latest.current = {key, columns};setState({key, columns});
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  const update = React.useCallback((value: unknown) => {
    const columns = normalizeInvoiceColumns(value);latest.current = {key, columns};setState({key, columns});
    try { if (key) localStorage.setItem(key, JSON.stringify(columns)); } catch { /* The current visit remains usable. */ }
  }, [key]);
  const toggle = (id: InvoiceColumnId) => {
    const current = latest.current.key === key ? latest.current.columns : DEFAULT_INVOICE_COLUMNS;
    update(current.includes(id) ? current.filter(column => column !== id) : [...current, id]);
  };
  return {columns, update, toggle, reset: () => update(DEFAULT_INVOICE_COLUMNS)};
}
