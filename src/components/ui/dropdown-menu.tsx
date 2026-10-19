"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useFloatingPanel } from "./use-floating-panel";

export interface DropdownMenuProps {
  trigger: React.ReactElement;
  children: React.ReactNode;
  label?: string;
  align?: "start" | "end";
  className?: string;
  minWidth?: number;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type TriggerProps = React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement>; disabled?: boolean };

/** An action menu that can escape a scrolling table without changing its rows. */
export function DropdownMenu({ trigger: triggerElement, children, label = "Dostępne działania", align = "end", className, minWidth = 208, disabled = false, onOpenChange }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLElement | null>(null);
  const panel = React.useRef<HTMLDivElement | null>(null);
  const menuId = React.useId();
  const initialFocus = React.useRef<"first" | "last">("first");
  const search = React.useRef("");
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentOpen = React.useRef(false);
  const notify = React.useRef(onOpenChange);
  notify.current = onOpenChange;
  const change = React.useCallback((next: boolean) => {
    if (currentOpen.current === next) return;
    currentOpen.current = next;
    setOpen(next);
    notify.current?.(next);
  }, []);
  const floating = useFloatingPanel({ open, onClose: () => change(false), trigger, panel, align, minWidth });
  const original = (triggerElement as React.ReactElement<TriggerProps>).props;
  const isDisabled = disabled || !!original.disabled;
  const items = React.useCallback(() => Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])') || []).filter(item => item.getClientRects().length > 0), []);

  React.useEffect(() => { if (isDisabled && open) change(false); }, [isDisabled, open, change]);
  React.useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  React.useLayoutEffect(() => {
    if (!open || !floating.ready) return;
    const available = items();
    (initialFocus.current === "last" ? available.at(-1) : available[0])?.focus({ preventScroll: true });
  }, [open, floating.ready, items]);

  const closeWithFocus = () => { change(false); trigger.current?.focus({ preventScroll: true }); };
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeWithFocus(); return; }
    if (event.key === "Tab") {
      // Continue the page's normal tab order from the menu's anchor. A modal's
      // own containment handler can still wrap at its first/last control.
      change(false);
      trigger.current?.focus({ preventScroll: true });
      return;
    }
    const available = items();
    const focused = document.activeElement as HTMLElement;
    if (event.key === " " && available.includes(focused)) {
      // Links need the same Space activation as button-based menu items.
      event.preventDefault();
      focused.click();
      return;
    }
    const current = available.indexOf(focused);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + available.length) % available.length;
      available[index]?.focus({ preventScroll: true });
      return;
    }
    if (event.key.length === 1 && event.key !== " " && !event.altKey && !event.ctrlKey && !event.metaKey) {
      search.current += event.key.toLocaleLowerCase();
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => { search.current = ""; }, 700);
      available.find(item => item.textContent?.trim().toLocaleLowerCase().startsWith(search.current))?.focus({ preventScroll: true });
    }
  };

  const decorate = (nodes: React.ReactNode): React.ReactNode => React.Children.map(nodes, child => {
    if (!React.isValidElement<React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode; disabled?: boolean; href?: string }>(child)) return child;
    if (child.type === React.Fragment) return React.cloneElement(child, {}, decorate(child.props.children));
    if (child.type !== "button" && child.type !== "a" && !child.props.href && !child.props.onClick) {
      return child.props.children ? React.cloneElement(child, {}, decorate(child.props.children)) : child;
    }
    return React.cloneElement(child, { role: "menuitem", tabIndex: -1, "aria-disabled": child.props.disabled || child.props["aria-disabled"] || undefined, className: cn("ui-menu-item w-full text-left", child.props.className) });
  });

  return <>
    {React.cloneElement(triggerElement as React.ReactElement<TriggerProps>, {
      ref: element => {
        trigger.current = element;
        if (typeof original.ref === "function") original.ref(element);
        else if (original.ref) original.ref.current = element;
      },
      "aria-haspopup": "menu", "aria-expanded": open, "aria-controls": open ? menuId : undefined,
      disabled: isDisabled,
      onClick: event => {
        original.onClick?.(event);
        if (event.defaultPrevented || isDisabled) return;
        initialFocus.current = "first";
        change(!open);
      },
      onKeyDown: event => {
        original.onKeyDown?.(event);
        if (event.defaultPrevented || isDisabled) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          initialFocus.current = event.key === "ArrowUp" ? "last" : "first";
          change(true);
        } else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); closeWithFocus(); }
      },
    })}
    {floating.present && floating.portalRoot && createPortal(<div ref={panel} id={menuId} role="menu" aria-label={label} aria-hidden={!open || undefined} inert={!open} data-state={open && floating.ready ? "open" : "closed"} data-side={floating.side} className={cn("ui-popup z-[10000] overflow-y-auto overscroll-contain p-1.5", className)} style={floating.style} onKeyDown={onMenuKeyDown} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node) && !trigger.current?.contains(event.relatedTarget as Node)) change(false);
    }} onClickCapture={event => {
      const item = (event.target as HTMLElement).closest<HTMLElement>('[role="menuitem"]');
      // Restore before an action can open a dialog, never after its focus moves.
      if (item?.matches(':disabled,[aria-disabled="true"]')) { event.preventDefault(); event.stopPropagation(); return; }
      if (item && !item.hasAttribute("data-menu-keep-open")) trigger.current?.focus({ preventScroll: true });
    }} onClick={event => {
      const item = (event.target as HTMLElement).closest<HTMLElement>('[role="menuitem"]');
      if (item && !item.matches(':disabled,[aria-disabled="true"],[data-menu-keep-open]')) change(false);
    }}>{decorate(children)}</div>, floating.portalRoot)}
  </>;
}
