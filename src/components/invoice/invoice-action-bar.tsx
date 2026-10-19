"use client";
import * as React from "react";

export function InvoiceActionBar({ children, summary }: { children: React.ReactNode; summary: React.ReactNode }) {
  const panel = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const element = panel.current;
    const editor = element?.closest<HTMLElement>("[data-invoice-editor]");
    if (!element || !editor) return;
    let height = 0;
    let frame = 0;
    const measure = () => {
      const next = Math.ceil(element.getBoundingClientRect().height);
      if (next <= 0 || next === height) return;
      height = next;
      editor.style.setProperty("--invoice-action-height", `${next}px`);
    };
    measure();
    // Read/write in the next frame, outside ResizeObserver delivery. In WebKit
    // updating an ancestor's padding inside delivery can recursively notify it.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return <div className="invoice-action-dock no-print">
    <div ref={panel} role="region" aria-label="Zapis i wystawienie faktury" className="invoice-action-bar">
      <div className="min-w-0 shrink-0 text-sm">{summary}</div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  </div>;
}
