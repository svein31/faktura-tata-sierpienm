"use client";
import * as React from "react";
import { useAppStore } from "./store";
import type { Contractor, Product } from "./types";

const EMPTY = { contractors: [] as Contractor[], products: [] as Product[] };
export function useCatalogSearch(search: string, enabled: boolean) {
  const companyId = useAppStore(state => state.selectedCompanyId) || "unassigned";
  const key = new URLSearchParams({ companyId, search }).toString();
  const [result, setResult] = React.useState({ key: "", data: EMPTY, error: "", loading: false });
  const [retry, reload] = React.useReducer(value => value + 1, 0);
  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setResult({ key, data: EMPTY, error: "", loading: true });
    const timer = window.setTimeout(() => {
      fetch("/api/catalog/search?" + key, { signal: controller.signal, cache: "no-store" }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Nie udało się pobrać katalogu.");
        if (!controller.signal.aborted) setResult({ key, data, error: "", loading: false });
      }).catch(error => { if (!controller.signal.aborted) setResult({ key, data: EMPTY, error: error.message, loading: false }); });
    }, search ? 200 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [enabled, key, search, retry]);
  return { ...(enabled && result.key === key ? result.data : EMPTY), loading: enabled && (result.key !== key || result.loading), error: result.key === key ? result.error : "", reload };
}
