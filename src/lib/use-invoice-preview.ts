"use client";
import * as React from "react";
import type { Invoice } from "./types";
import type { InvoiceSearchResult, useInvoiceSearch } from "./use-invoice-search";

type Source = ReturnType<typeof useInvoiceSearch>;
type Preview = { key: string; anchorId: string; id: string; initialPage: number; pageIndex: number; cursors: string[]; data: InvoiceSearchResult };

/** Independent read-only paging keeps the list under the modal completely still. */
export function useInvoicePreview(source: Source, onAccessLost: () => void) {
  const [state, setState] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [retryDirection, setRetryDirection] = React.useState<-1 | 1>(1);
  const current = React.useRef(state); current.current = state;
  const input = React.useRef(source); input.current = source;
  const denied = React.useRef(onAccessLost); denied.current = onAccessLost;
  const request = React.useRef<AbortController | null>(null);
  const epoch = React.useRef(0);
  const commit = React.useCallback((value: Preview | null) => { current.current = value;setState(value); }, []);
  const cancel = React.useCallback(() => {epoch.current++;request.current?.abort();request.current = null;setBusy(false);}, []);
  const close = React.useCallback(() => {cancel();commit(null);setError("");}, [cancel,commit]);
  const open = (invoice: Invoice) => {
    cancel();setError("");
    commit({key: source.key, anchorId: invoice.id, id: invoice.id, initialPage: source.page-1, pageIndex: source.page-1, cursors: [...source.cursors], data: source});
  };
  const data = state?.pageIndex === state?.initialPage ? source : state?.data;
  const index = data?.invoices.findIndex(invoice => invoice.id === state?.id) ?? -1;
  const valid = state?.key === source.key && source.invoices.some(invoice => invoice.id === state.anchorId);
  const invoice = valid && index >= 0 ? data?.invoices[index] : undefined;
  React.useEffect(() => {
    if (state && (!valid || !invoice)) close();
  }, [state,valid,invoice,close]);
  React.useEffect(() => () => {epoch.current++;request.current?.abort();}, []);

  const move = async (direction: -1 | 1) => {
    const selected = current.current, initial = input.current;
    if (!selected || selected.key !== initial.key || request.current) return;
    const page = selected.pageIndex === selected.initialPage ? initial : selected.data;
    const position = page.invoices.findIndex(invoice => invoice.id === selected.id);
    if (position < 0) return;
    const neighbor = page.invoices[position+direction];
    setError("");
    if (neighbor) {commit({...selected,id:neighbor.id});return;}
    if (direction === -1 && selected.pageIndex === 0 || direction === 1 && !page.nextCursor) return;
    const targetPage = selected.pageIndex+direction;
    const cursor = direction === 1 ? page.nextCursor : selected.cursors[targetPage];
    if (cursor == null) return;
    // Returning to the list's page reuses its live authorized rows, not a cache.
    if (targetPage === selected.initialPage) {
      const target = direction === 1 ? initial.invoices[0] : initial.invoices.at(-1);
      if (target) commit({...selected,id:target.id,pageIndex:targetPage,data:initial});
      return;
    }
    const controller = new AbortController(), token = ++epoch.current;
    request.current = controller;setBusy(true);setRetryDirection(direction);
    const url = new URL(initial.key, window.location.origin);url.searchParams.set("cursor",cursor);
    try {
      const response = await fetch(url.pathname+url.search,{signal:controller.signal});
      if (controller.signal.aborted || epoch.current !== token || input.current.key !== selected.key) return;
      if (response.status === 401 || response.status === 403) {close();input.current.reload();denied.current();return;}
      const result = await response.json().catch(()=>null);
      if (!response.ok || !result || !Array.isArray(result.invoices)) throw new Error(result?.error || "Nie udało się pobrać kolejnych faktur. Spróbuj ponownie.");
      if (!result.invoices.length) throw new Error("Lista dokumentów zmieniła się. Zamknij podgląd i odśwież listę.");
      if (controller.signal.aborted || epoch.current !== token || input.current.key !== selected.key) return;
      const target = direction === 1 ? result.invoices[0] : result.invoices.at(-1);
      const cursors = [...selected.cursors];cursors[targetPage] = cursor;
      commit({...selected,id:target.id,pageIndex:targetPage,cursors,data:result});
    } catch (cause) {
      if (!controller.signal.aborted && epoch.current === token && input.current.key === selected.key) setError(cause instanceof Error ? cause.message : "Nie udało się pobrać dokumentów. Spróbuj ponownie.");
    } finally {
      if (request.current === controller) {request.current = null;setBusy(false);}
    }
  };
  return {invoice,open,close,move,busy,error,retry:()=>move(retryDirection),
    position:index+1, count:data?.invoices.length || 0, page:(state?.pageIndex ?? 0)+1,
    hasPrevious: Boolean(invoice && (index>0 || state && state.pageIndex>0)),
    hasNext: Boolean(invoice && data && (index<data.invoices.length-1 || data.nextCursor)),
  };
}
