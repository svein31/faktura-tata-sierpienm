"use client";
import * as React from "react";
import { useAppStore } from "@/lib/store";
import type { Invoice } from "@/lib/types";
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
  const [revision, reload] = React.useReducer(n => n + 1, 0);
  const mutations = useAppStore(s => s.invoices);
  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    const timer = setTimeout(() => {
      fetch(url, { signal: controller.signal }).then(async res => {
        const data = await res.json(); if (!res.ok) throw new Error(data.error || "Nie udało się pobrać faktur.");
        if (!controller.signal.aborted) setState({ url, data });
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [url, revision, mutations, enabled]);
  React.useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") reload(); }; document.addEventListener("visibilitychange", refresh); return () => document.removeEventListener("visibilitychange", refresh); }, []);
  const data = enabled && state.url === url ? state.data : EMPTY;
  return { ...data, loading, error, reload, page: cursors.length, key: url,
    first: () => setPaging({ key: filterKey, cursors: [""] }),
    previous: () => setPaging({ key: filterKey, cursors: cursors.slice(0, -1) }),
    next: () => { if (data.nextCursor) setPaging({ key: filterKey, cursors: [...cursors, data.nextCursor] }); },
  };
}
