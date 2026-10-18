"use client";

import * as React from "react";
import { monthLabel } from "@/lib/format";
import type { Overview } from "@/lib/use-overview";

// Import the chart implementation only after its reserved area enters view.
const RevenueAreaChart = React.lazy(() => import("@/components/charts").then(module => ({ default: module.RevenueAreaChart })));

function ChartPlaceholder() {
  return <div aria-hidden="true" className="h-full rounded-xl bg-muted/20" />;
}

export function DeferredRevenueChart({ months, currency }: { months: Overview["months"]; currency: string }) {
  const container = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Keep the selected currency current, including changes before the first view.
  const chart = React.useMemo(() => visible ? months.map(month => {
    const value = month.values.find(value => value.currency === currency);
    return { label: monthLabel(month.key), netto: value?.net || 0, brutto: value?.gross || 0 };
  }) : [], [visible, months, currency]);

  return <div ref={container} className="mt-5 h-[210px]">
    {visible ? <React.Suspense fallback={<ChartPlaceholder />}><RevenueAreaChart data={chart} height={210} /></React.Suspense> : <ChartPlaceholder />}
  </div>;
}
