"use client";

import * as React from "react";
import { useSessionUser } from "./session-context";
import { DEFAULT_INVOICE_VIEW, invoiceViewKey, normalizeInvoiceView, type InvoiceView } from "./invoice-view";

/** Explicit navigation preference, limited to this browser session and owner/company. */
export function useInvoiceView(companyId: string | null) {
  const user = useSessionUser();
  const key = invoiceViewKey(user.id, companyId);
  const [state, setState] = React.useState({ key: "", value: DEFAULT_INVOICE_VIEW });
  const value = state.key === key ? state.value : DEFAULT_INVOICE_VIEW;
  const latest = React.useRef({ key, value });
  latest.current = { key, value };
  React.useLayoutEffect(() => {
    let saved: InvoiceView = DEFAULT_INVOICE_VIEW;
    try {
      const raw = key ? sessionStorage.getItem(key) : null;
      if (raw && raw.length <= 4096) saved = normalizeInvoiceView(JSON.parse(raw));
    } catch { /* Storage unavailable: the view still works for this visit. */ }
    latest.current = { key, value: saved };
    setState({ key, value: saved });
  }, [key]);
  const update = React.useCallback((patch: Partial<InvoiceView>) => {
    const next = normalizeInvoiceView({ ...(latest.current.key === key ? latest.current.value : DEFAULT_INVOICE_VIEW), ...patch });
    latest.current = { key, value: next };
    setState({ key, value: next });
    try { if (key) sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* Optional persistence. */ }
  }, [key]);
  return { value, update };
}
