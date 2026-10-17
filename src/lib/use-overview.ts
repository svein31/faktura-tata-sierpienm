"use client";

import * as React from "react";
import { useAppStore } from "./store";

export type OverviewMoney = { currency: string; net: number; vat: number; gross: number; count: number };
export type Overview = {
  checkedAt: string;
  counts: { rejected: number; uncertain: number; overdue: number; drafts: number; offline: number; reviews: number; tasks: number; missingUpo: number; unmatched: number };
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

export type OverviewSeed = { companyId: string; months: 6 | 12 | 24; data: Overview };

class OverviewRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OverviewRequestError";
  }
}

export function useOverview(months: 6 | 12 | 24 = 6, initialOverview?: OverviewSeed) {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const key = companyId ? `${companyId}:${months}` : null;
  // A server response may describe the default company while a warm navigation
  // keeps a different selection. Never expose that seed under another scope.
  const [seed] = React.useState(initialOverview);
  const [result, setResult] = React.useState<{ key: string | null; data: Overview | null; error: string }>(() => ({
    key,
    data: seed && seed.companyId === companyId && seed.months === months ? seed.data : null,
    error: "",
  }));
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setResult(current => ({
      key,
      // Hydrate with the authorized server snapshot, then revalidate in the
      // background. Explicit reloads and company/period changes still reset it.
      data: current.key === key && refresh === 0 && current.data === seed?.data ? current.data : null,
      error: "",
    }));
    if (companyId) fetch(`/api/overview?companyId=${encodeURIComponent(companyId)}&months=${months}`, { signal: controller.signal, cache: "no-store" })
      .then(async res => {
        if (!res.ok) {
          let message = "Nie udało się pobrać podsumowania.";
          try {
            const result = await res.json();
            if (typeof result.error === "string" && result.error) message = result.error;
          } catch { /* Preserve the HTTP status even when an error body is not JSON. */ }
          throw new OverviewRequestError(message, res.status);
        }
        return await res.json() as Overview;
      })
      .then(data => { if (!controller.signal.aborted) setResult({ key, data, error: "" }); })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const accessDenied = err instanceof OverviewRequestError && (err.status === 401 || err.status === 403);
        setResult(current => ({
          key,
          // A previously authorized seed must disappear after access is revoked.
          // Temporary network/server errors can keep that same-scope snapshot.
          data: accessDenied || current.key !== key ? null : current.data,
          error: err instanceof Error ? err.message : "Nie udało się pobrać podsumowania.",
        }));
      });
    return () => controller.abort();
  }, [companyId, key, months, refresh, seed]);

  const data = result.key === key ? result.data : null;
  const error = result.key === key ? result.error : "";
  return { data, error, companyId, reload: () => setRefresh(n => n + 1) };
}
