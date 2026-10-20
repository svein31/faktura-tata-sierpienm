"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { containModalFocus } from "@/lib/overlay-focus";
import { lockBodyScroll } from "@/lib/overlay-scroll";
import { Button } from "./button";

/** A lazy-mounted detail surface; the list beneath it keeps its scroll and state. */
export function SidePanel({ title, description, children, footer, onClose, toolbar, contentKey, onKeyDown }: {
  title: string; description: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void;
  toolbar?: React.ReactNode; contentKey?: string; onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
}) {
  const panel = React.useRef<HTMLElement>(null);
  const closeButton = React.useRef<HTMLButtonElement>(null);
  const close = React.useRef(onClose);
  close.current = onClose;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = React.useState(false);
  const titleId = React.useId(), descriptionId = React.useId();
  const [viewport, setViewport] = React.useState<React.CSSProperties>({ inset: 0 });
  const dismiss = React.useCallback(() => {
    if (timer.current) return;
    setClosing(true);
    timer.current = setTimeout(() => close.current(), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160);
  }, []);

  React.useLayoutEffect(() => {
    const unlock = lockBodyScroll();
    const releaseFocus = panel.current ? containModalFocus(panel.current, dismiss, closeButton.current) : () => {};
    const resize = () => setViewport({
      top: window.visualViewport?.offsetTop || 0, left: window.visualViewport?.offsetLeft || 0,
      width: window.visualViewport?.width || document.documentElement.clientWidth,
      height: window.visualViewport?.height || window.innerHeight,
    });
    resize();
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      unlock(); releaseFocus();
    };
  }, [dismiss]);

  return createPortal(<div className="ui-side-overlay no-print" data-state={closing ? "closed" : "open"} style={viewport}>
    <div className="ui-side-backdrop" onClick={dismiss} aria-hidden="true" />
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} className="ui-side-panel" onKeyDown={closing ? undefined : onKeyDown}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
        <div className="min-w-0"><p id={descriptionId} className="mb-1 text-xs font-medium text-muted-foreground">{description}</p><h2 id={titleId} className="break-words text-xl font-semibold leading-7 tracking-tight">{title}</h2></div>
        <Button ref={closeButton} variant="ghost" size="icon" onClick={dismiss} aria-label="Zamknij podgląd faktury" className="shrink-0"><X className="size-4" aria-hidden="true" /></Button>
      </header>
      {toolbar}
      <div key={contentKey} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6">{children}</div>
      <footer className="ui-side-footer flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-card px-5 pt-4 sm:px-6">{footer}</footer>
    </section>
  </div>, document.body);
}
