"use client";

import { useEffect, useState, type ComponentType } from "react";

/** Optional first-party measurement never competes with the initial render. */
export function PublicDeferred() {
  const [Observer, setObserver] = useState<ComponentType | null>(null);
  useEffect(() => {
    let disposed = false;
    let cancelSchedule: (() => void) | undefined;
    let cleanup: (() => void) | undefined;
    const install = () => {
      void import("@/lib/register-static-worker").then(({ registerStaticWorker }) => {
        if (!disposed) registerStaticWorker();
      }).catch(() => {});
      void import("@/lib/pilot-client").then(({ installPilotMetrics, hasPilotClientConsent }) => {
        if (disposed) return;
        const stopMetrics = installPilotMetrics();
        const syncObserver = () => {
          if (disposed) return;
          if (!hasPilotClientConsent()) { setObserver(null); return; }
          void import("@/components/performance/vitals-observer").then(({ default: Component }) => {
            if (!disposed && hasPilotClientConsent()) setObserver(() => Component);
          }).catch(() => { /* Optional field measurements never block the page. */ });
        };
        window.addEventListener("fakturo-consent-updated", syncObserver);
        window.addEventListener("focus", syncObserver);
        syncObserver();
        cleanup = () => {
          stopMetrics();
          window.removeEventListener("fakturo-consent-updated", syncObserver);
          window.removeEventListener("focus", syncObserver);
        };
      }).catch(() => { /* Optional measurement must not interrupt the app. */ });
    };
    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") {
        const handle = window.requestIdleCallback(install, { timeout: 3000 });
        cancelSchedule = () => window.cancelIdleCallback(handle);
      } else {
        const timer = window.setTimeout(install, 1500);
        cancelSchedule = () => window.clearTimeout(timer);
      }
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      disposed = true;
      window.removeEventListener("load", schedule);
      cancelSchedule?.();
      cleanup?.();
    };
  }, []);
  return Observer ? <Observer /> : null;
}
