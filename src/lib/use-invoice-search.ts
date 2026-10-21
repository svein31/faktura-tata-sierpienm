"use client";
import * as React from "react";
import { useAppStore } from "@/lib/store";
import type { Contractor, Invoice } from "@/lib/types";
import { createInvoiceSearchLifecycle } from "@/lib/invoice-search-lifecycle";
export type InvoiceSearchResult = { invoices: Invoice[]; contractors?: Contractor[]; total: number; counts: { all: number; sale: number; purchase: number; proforma: number; approved: number }; nextCursor: string | null };
type Result = InvoiceSearchResult;
export type InitialInvoiceSearch = { url: string; data: Result; etag?: string };
const EMPTY: Result = { invoices: [], total: 0, counts: { all: 0, sale: 0, purchase: 0, proforma: 0, approved: 0 }, nextCursor: null };
export function useInvoiceSearch(filters: Record<string, string>, enabled = true, initialSearch?: InitialInvoiceSearch) {
  const filterKey = new URLSearchParams(filters).toString();
  const [paging, setPaging] = React.useState<{ key: string; cursors: string[] }>({ key: "", cursors: [""] });
  const cursors = paging.key === filterKey ? paging.cursors : [""];
  const cursor = cursors[cursors.length - 1];
  const url = `/api/invoices/search?${filterKey}&cursor=${cursor}`;
  const mutations = useAppStore(s => s.invoices);
  const initialSnapshot = React.useRef({
    search: enabled && initialSearch?.url === url ? initialSearch : undefined,
    mutations,
  });
  const seedValid = React.useRef(Boolean(initialSnapshot.current.search));
  const validator = React.useRef({ url, etag: initialSnapshot.current.search?.etag });
  const [state, setState] = React.useState<{ url: string; data: Result }>(() => initialSnapshot.current.search ?? { url: "", data: EMPTY });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(!initialSnapshot.current.search);
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
  const previousSearch = React.useRef(filters.search ?? "");
  React.useEffect(() => {
    const current = lifecycle.current;
    if (!enabled) { seedValid.current = false; return; }
    if (!current || current.departing) return;
    if (validator.current.url !== url) validator.current = { url, etag: undefined };
    // Revalidate a matching SSR snapshot immediately without hiding its rows
    // or marking the ready list as loading. RSC history may restore an older
    // payload, so the seed must never replace the authenticated API request.
    const revalidateInitialSeed = seedValid.current && initialSnapshot.current.search?.url === url && revision === 0 && initialSnapshot.current.mutations === mutations;
    if (!revalidateInitialSeed) seedValid.current = false;
    // Discard data after leaving its exact query, including a server seed.
    // A rapid A -> B -> A must not revive A before either response settles.
    // Same-query reloads and transient failures retain their current snapshot.
    setState(current => current.url === url ? current : { url, data: EMPTY });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { clearTimeout(timer); controller.abort(); };
    const release = current.track(cancel);
    if (!revalidateInitialSeed) setLoading(true);
    setError("");
    const search = filters.search ?? "";
    const debounce = previousSearch.current !== search;
    previousSearch.current = search;
    const request = () => {
      if (controller.signal.aborted || current.departing) return;
      fetch(url, { signal: controller.signal, cache: "no-store", headers: validator.current.etag ? { "If-None-Match": validator.current.etag } : undefined }).then(async res => {
        if (res.status === 304 && validator.current.url === url && validator.current.etag) return;
        // History may restore an older authorized SSR payload. An explicit
        // loss of access must remove those rows even if error JSON is invalid.
        if ((res.status === 401 || res.status === 403) && !controller.signal.aborted) {
          validator.current = { url, etag: undefined };
          setState({ url, data: EMPTY });
        }
        const data = await res.json(); if (!res.ok) throw new Error(data.error || "Nie udało się pobrać faktur.");
        if (!controller.signal.aborted) validator.current = { url, etag: res.headers?.get("etag") || undefined };
        if (!controller.signal.aborted) setState(current => {
          // Revalidating an unchanged SSR result must not reconcile both
          // invoice layouts again. The complete authorized payload is compared;
          // changed values and access failures still replace/remove the rows.
          if (current.url === url && JSON.stringify(current.data) === JSON.stringify(data)) return current;
          return { url, data };
        });
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { release(); if (!controller.signal.aborted) { seedValid.current = false; setLoading(false); } });
    };
    // Debounce typing only. Initial load, page changes and explicit refreshes
    // should start the request immediately, without an artificial 200 ms wait.
    if (debounce) timer = setTimeout(request, 200);
    else request();
    return () => { cancel(); release(); };
  }, [url, revision, mutations, enabled, filters.search]);
  React.useEffect(() => { const visible = () => { if (document.visibilityState === "visible" && !lifecycle.current?.departing) refresh(); }; document.addEventListener("visibilitychange", visible); return () => document.removeEventListener("visibilitychange", visible); }, []);
  const data = enabled && state.url === url ? state.data : EMPTY;
  return { ...data, loading, error, reload, page: cursors.length, cursors, key: url,
    first: () => setPaging({ key: filterKey, cursors: [""] }),
    previous: () => setPaging({ key: filterKey, cursors: cursors.slice(0, -1) }),
    next: () => { if (data.nextCursor) setPaging({ key: filterKey, cursors: [...cursors, data.nextCursor] }); },
  };
}
