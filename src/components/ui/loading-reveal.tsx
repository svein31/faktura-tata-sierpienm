"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Data paints immediately. Only the decorative fallback remains for its fade. */
export function LoadingReveal({ loading, fallback, children, className }: {
  loading: boolean; fallback: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  const placeholder = React.useRef<HTMLDivElement>(null);
  const content = React.useRef<HTMLDivElement>(null);
  const lastContentHeight = React.useRef(0);
  const [leaving, setLeaving] = React.useState(loading);
  const [reservedHeight, setReservedHeight] = React.useState(0);

  React.useLayoutEffect(() => {
    if (!loading) {
      const element = content.current;
      if (!element) return;
      const measure = () => { lastContentHeight.current = Math.ceil(element.getBoundingClientRect().height); };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    setLeaving(true);
    const element = placeholder.current;
    if (!element) return;
    const measure = () => setReservedHeight(Math.max(lastContentHeight.current, Math.ceil(element.getBoundingClientRect().height)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading]);

  React.useEffect(() => {
    if (loading || !leaving) return;
    const timer = window.setTimeout(() => setLeaving(false), 180);
    return () => window.clearTimeout(timer);
  }, [loading, leaving]);

  return <div className={cn("ui-loading-reveal min-w-0", className)}
    aria-busy={loading || undefined} data-loading={loading ? "true" : "false"}
    style={reservedHeight ? { minHeight: reservedHeight } : undefined}>
    {(loading || leaving) && <div ref={placeholder} className={cn(!loading && "ui-loading-exit")}
      aria-hidden={!loading || undefined} inert={!loading || undefined}>{fallback}</div>}
    {!loading && <div ref={content} className={leaving ? "ui-data-enter min-w-0" : "min-w-0"}>{children}</div>}
  </div>;
}
