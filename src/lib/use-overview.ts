"use client";

import * as React from "react";
import { useAppStore } from "./store";

export type OverviewMoney = { currency: string; net: number; vat: number; gross: number; count: number };
export type Overview = {
  checkedAt: string;
  counts: { rejected: number; uncertain: number; overdue: number; drafts: number; offline: number; reviews: number; tasks: number };
  actions: { id: string; kind: string; label: string; detail: string; href: string; priority: number }[];
  actionTotal: number;
  currencies: string[];
  totals: OverviewMoney[];
  currentMonth: OverviewMoney[];
  previousMonth: OverviewMoney[];
  months: { key: string; values: OverviewMoney[] }[];
  vatByRate: { currency: string; rates: { rate: string; value: number }[] }[];
  statusCounts: { name: string; value: number }[];
  contractors: { currency: string; rows: { id: string; count: number; gross: number }[] }[];
  recent: { id: string; number: string; currency: string; gross: number | null; issueDate: string }[];
  ksefQueue: { id: string; invoiceId: string; number: string; status: string; attempts: number; maxAttempts: number; environment: string; updatedAt: string; nextAttemptAt: string | null; guidance: string }[];
};

export function useOverview(months: 6 | 12 | 24 = 6) {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const [data, setData] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    if (companyId) fetch(`/api/overview?companyId=${encodeURIComponent(companyId)}&months=${months}`, { signal: controller.signal, cache: "no-store" })
      .then(async res => { const result = await res.json(); if (!res.ok) throw new Error(result.error || "Nie udało się pobrać podsumowania."); return result as Overview; })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [companyId, months, refresh]);

  return { data, error, companyId, reload: () => setRefresh(n => n + 1) };
}
