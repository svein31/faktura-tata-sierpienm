"use client";
import * as React from "react";
import { useAppStore } from "@/lib/store";
import type { Invoice } from "@/lib/types";
import { createInvoiceSearchLifecycle } from "@/lib/invoice-search-lifecycle";
type Result = { invoices: Invoice[]; total: number; counts: { all: number; sale: number; purchase: number; proforma: number; approved: number }; nextCursor: string | null };
const EMPTY: Result = { invoices: [], total: 0, counts: { all: 0, sale: 0, purchase: 0, proforma: 0, approved: 0 }, nextCursor: null };
export function useInvoiceSearch(filters: Record<string, string>, enabled = true) {
  const filterKey = new URLSearchParams(filters).toString();
  const [paging, setPaging] = React.useState<{ key: string; cursors: string[] }>({ key: "", cursors: [""] });
  const cursors = paging.key === filterKey ? paging.cursors : [""];
  const cursor = cursors[cursors.length - 1];
  const url = `/api/invoices/search?${filterKey}&cursor=${cursor}`;
  const [state, setState] = React.useState<{ url: string; data: Result }>({ url: "", data: EMPTY });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [revision, refresh] = React.useReducer(n => n + 1, 0);
  const lifecycle = React.useRef<ReturnType<typeof createInvoiceSearchLifecycle> | null>(null);
  React.useEffect(() => {
    const current = createInvoiceSearchLifecycle(window, refresh, () => {
      setLoading(false); setError("Przerwano pobieranie faktur. Spróbuj ponownie.");
    });
    lifecycle.current = current;
    return () => { current.dispose(); lifecycle.current = null; };
  }, []);
  const reload = React.useCallback((event?: { isTrusted?: boolean }) => {
    lifecycle.current?.retry(event);
    refresh();
  }, []);
  const mutations = useAppStore(s => s.invoices);
  const previousSearch = React.useRef(filters.search ?? "");
  React.useEffect(() => {
    const current = lifecycle.current;
    if (!enabled || !current || current.departing) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { clearTimeout(timer); controller.abort(); };
    const release = current.track(cancel);
    setLoading(true); setError("");
    const search = filters.search ?? "";
    const debounce = previousSearch.current !== search;
    previousSearch.current = search;
    const request = () => {
      if (controller.signal.aborted || current.departing) return;
      fetch(url, { signal: controller.signal }).then(async res => {
        const data = await res.json(); if (!res.ok) throw new Error(data.error || "Nie udało się pobrać faktur.");
        if (!controller.signal.aborted) setState({ url, data });
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { release(); if (!controller.signal.aborted) setLoading(false); });
    };
    // Debounce typing only. Initial load, page changes and explicit refreshes
    // should start the request immediately, without an artificial 200 ms wait.
    if (debounce) timer = setTimeout(request, 200);
    else request();
    return () => { cancel(); release(); };
  }, [url, revision, mutations, enabled, filters.search]);
  React.useEffect(() => { const visible = () => { if (document.visibilityState === "visible" && !lifecycle.current?.departing) refresh(); }; document.addEventListener("visibilitychange", visible); return () => document.removeEventListener("visibilitychange", visible); }, []);
  const data = enabled && state.url === url ? state.data : EMPTY;
  return { ...data, loading, error, reload, page: cursors.length, key: url,
    first: () => setPaging({ key: filterKey, cursors: [""] }),
    previous: () => setPaging({ key: filterKey, cursors: cursors.slice(0, -1) }),
    next: () => { if (data.nextCursor) setPaging({ key: filterKey, cursors: [...cursors, data.nextCursor] }); },
  };
}
