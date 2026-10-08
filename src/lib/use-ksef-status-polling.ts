"use client";
import * as React from "react";
import type { Invoice } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { ksefProgress } from "@/lib/ksef/progress";

/** Refresh only visible pending documents. Never dispatch or retry a transmission. */
export function useKsefStatusPolling(invoices: Invoice[], onRefresh?: () => void) {
  const pending = invoices.filter(invoice => ksefProgress(invoice).polling).slice(0, 10);
  const key = pending.map(invoice => invoice.id).sort().join(",");
  const latest = React.useRef({ pending, onRefresh });
  latest.current = { pending, onRefresh };
  React.useEffect(() => {
    if (!key) return;
    let cancelled = false, busy = false, delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      if (cancelled || busy) return;
      busy = true;
      try {
        if (document.visibilityState !== "visible") return;
        for (const previous of latest.current.pending) {
          if (cancelled) break;
          const company = useAppStore.getState().companies.find(item => item.id === previous.sellerCompanyId);
          // Members without KSeF access still see changes persisted by the worker.
          if (previous.referenceNumber && company?.currentUserPermissions?.canSendKsef !== false) {
            await fetch(`/api/ksef/status/${encodeURIComponent(previous.id)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
          }
          const response = await fetch(`/api/invoices/${previous.id}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
          if (!response.ok) continue;
          const data = await response.json();
          if (!cancelled && data.invoice && (data.invoice.ksefStatus !== previous.ksefStatus || data.invoice.ksefNumber !== previous.ksefNumber || ksefProgress(data.invoice).hasUpo !== ksefProgress(previous).hasUpo)) {
            useAppStore.getState().applyInvoice(data.invoice);
            latest.current.onRefresh?.();
          }
        }
      } catch { /* Keep the saved state while offline or MF is unavailable. */ }
      finally {
        busy = false;
        if (!cancelled) { timer = setTimeout(() => void poll(), delay); delay = Math.min(30000, delay * 2); }
      }
    };
    const foreground = () => { if (document.visibilityState === "visible" && !busy) { clearTimeout(timer); void poll(); } };
    timer = setTimeout(() => void poll(), 2000);
    document.addEventListener("visibilitychange", foreground);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", foreground); };
  }, [key]);
}
