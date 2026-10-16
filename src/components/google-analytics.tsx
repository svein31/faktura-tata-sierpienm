"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { hasAnalyticsConsent } from "@/lib/cookie-consent";

export function GoogleAnalytics() {
  const pathname = usePathname();
  const runtime = useRef<typeof import("@/lib/google-analytics") | null>(null);
  useEffect(() => {
    let disposed = false;
    let requested = false;
    let stop: (() => void) | undefined;
    const install = () => {
      // First-time visitors do not need the analytics runtime or page catalog.
      // The runtime still checks public paths, consent, DNT and GPC itself.
      if (disposed || requested || !hasAnalyticsConsent()) return;
      requested = true;
      void import("@/lib/google-analytics").then(module => {
        if (disposed) return;
        runtime.current = module;
        stop = module.installGoogleAnalytics();
      }).catch(() => { requested = false; });
    };
    window.addEventListener("fakturo-consent-updated", install);
    window.addEventListener("focus", install);
    window.addEventListener("online", install);
    install();
    return () => {
      disposed = true;
      window.removeEventListener("fakturo-consent-updated", install);
      window.removeEventListener("focus", install);
      window.removeEventListener("online", install);
      stop?.();
      runtime.current = null;
    };
  }, []);
  useEffect(() => { runtime.current?.syncGoogleAnalyticsRoute(); }, [pathname]);
  return null;
}
