"use client";

import * as React from "react";

type FloatingPanelOptions = {
  open: boolean;
  onClose: () => void;
  trigger: React.RefObject<HTMLElement | null>;
  panel: React.RefObject<HTMLElement | null>;
  align?: "start" | "end";
  matchWidth?: boolean;
  minWidth?: number;
  maxHeight?: number;
};

type Geometry = { style: React.CSSProperties; side: "top" | "bottom"; ready: boolean };

/** Shared geometry and exit presence for controls inside tables and dialogs. */
export function useFloatingPanel({ open, onClose, trigger, panel, align = "start", matchWidth = false, minWidth = 208, maxHeight = 320 }: FloatingPanelOptions) {
  const [present, setPresent] = React.useState(false);
  const [geometry, setGeometry] = React.useState<Geometry>({ style: { visibility: "hidden" }, side: "bottom", ready: false });
  const close = React.useRef(onClose);
  close.current = onClose;

  React.useLayoutEffect(() => {
    if (open) { setPresent(true); return; }
    if (!present) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setPresent(false);
      setGeometry(previous => ({ ...previous, ready: false }));
    }, reducedMotion ? 0 : 140);
    return () => window.clearTimeout(timer);
  }, [open, present]);

  // A modal's focus boundary must also contain its portalled controls.
  const portalRoot = typeof document === "undefined" ? null : trigger.current?.closest<HTMLElement>('[role="dialog"]') || document.body;

  React.useLayoutEffect(() => {
    if (!present || !open || !portalRoot) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const anchor = trigger.current;
      const content = panel.current;
      if (!anchor || !content) return;
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft || 0;
      const topEdge = viewport?.offsetTop || 0;
      const rightEdge = leftEdge + (viewport?.width || document.documentElement.clientWidth);
      const bottomEdge = topEdge + (viewport?.height || window.innerHeight);
      // Transformed dialogs establish a containing block for fixed elements.
      // Local absolute coordinates avoid a second transform of viewport coords.
      const dialog = portalRoot === document.body ? null : portalRoot;
      const bounds = dialog?.getBoundingClientRect();
      const left = Math.max(leftEdge, bounds?.left ?? leftEdge) + 8;
      const right = Math.min(rightEdge, bounds?.right ?? rightEdge) - 8;
      const top = Math.max(topEdge, bounds?.top ?? topEdge) + 8;
      const bottom = Math.min(bottomEdge, bounds?.bottom ?? bottomEdge) - 8;
      const width = Math.min(Math.max(0, right - left), matchWidth ? rect.width : Math.max(rect.width, minWidth));
      const below = Math.max(0, bottom - rect.bottom - 6);
      const above = Math.max(0, rect.top - top - 6);
      // Measure wrapped content at its final width before revealing the panel.
      content.style.width = `${Math.round(width)}px`;
      const desiredHeight = Math.min(maxHeight, content.scrollHeight || maxHeight);
      const upward = below < desiredHeight && above > below;
      const height = Math.min(maxHeight, upward ? above : below);
      const x = Math.max(left, Math.min(align === "end" ? rect.right - width : rect.left, right - width));
      const y = Math.max(top, Math.min(upward ? rect.top - 6 : rect.bottom + 6, bottom));
      const localLeft = (bounds?.left || 0) + (dialog?.clientLeft || 0) - (dialog?.scrollLeft || 0);
      const localTop = (bounds?.top || 0) + (dialog?.clientTop || 0) - (dialog?.scrollTop || 0);
      const style: React.CSSProperties = {
        position: dialog ? "absolute" : "fixed",
        left: Math.round(x - localLeft),
        width: Math.round(width),
        maxHeight: Math.max(0, Math.floor(height)),
        fontFamily: window.getComputedStyle(anchor).fontFamily,
        ...(upward ? { bottom: dialog ? dialog.clientHeight - (y - localTop) : window.innerHeight - y } : { top: Math.round(y - localTop) }),
      };
      const side = upward ? "top" : "bottom";
      setGeometry(previous => previous.ready && previous.side === side && Object.keys(style).every(key => style[key as keyof React.CSSProperties] === previous.style[key as keyof React.CSSProperties]) ? previous : { style, side, ready: true });
    };
    const schedule = (event?: Event) => {
      // Scrolling options changes their contents, not the anchor coordinates.
      if (event?.type === "scroll" && event.target instanceof Node && panel.current?.contains(event.target)) return;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close.current();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => schedule());
    if (trigger.current) observer?.observe(trigger.current);
    if (panel.current) observer?.observe(panel.current);
    update();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open, present, portalRoot, trigger, panel, align, matchWidth, minWidth, maxHeight]);

  return { present, portalRoot, ready: geometry.ready, side: geometry.side, style: geometry.ready ? geometry.style : { ...geometry.style, visibility: "hidden" as const } };
}
