"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "@/lib/overlay-scroll";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
}

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
  dismissible = true,
}: DialogProps) {
  const panel = React.useRef<HTMLDivElement>(null);
  const close = React.useRef(onClose);
  const canDismiss = React.useRef(dismissible);
  canDismiss.current = dismissible;
  close.current = onClose;
  const titleId = React.useId(), descriptionId = React.useId();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [viewport, setViewport] = React.useState<{ top: number; height: number } | null>(null);
  React.useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    const updateViewport = () => setViewport({ top: window.visualViewport?.offsetTop || 0, height: window.visualViewport?.height || window.innerHeight });
    updateViewport();
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),[tabindex="0"]') || []).filter(element => element.getClientRects().length && element.getAttribute("type") !== "hidden");
    const frame = requestAnimationFrame(() => focusables()[0]?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const dialogs = document.querySelectorAll('[data-app-dialog="true"]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (event.key === "Escape" && canDismiss.current) { event.preventDefault(); close.current(); }
      if (event.key === "Tab") {
        const list = focusables(), first = list[0], last = list[list.length - 1];
        if (!first) { event.preventDefault(); panel.current?.focus(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      unlock();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, mounted]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-x-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4" style={{ top: viewport?.top || 0, height: viewport?.height || "100dvh" }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className={cn(
              "relative z-10 flex w-full min-w-0 max-h-full flex-col rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-2xl backdrop-blur-xl",
              sizes[size],
              className
            )}
            ref={panel}
            data-app-dialog="true"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
          >
            {/* Apple Drag Handle (mobile only) */}
            <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/30 sm:hidden" />

            <div className={cn("mb-4 shrink-0", dismissible && "pr-14")}>
              <div className="min-w-0 break-words">
                {title && <h2 id={titleId} className="text-[16px] font-semibold tracking-tight text-foreground">{title}</h2>}
                {description && (
                  <p id={descriptionId} className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>
                )}
              </div>
              {dismissible && <button
                type="button"
                onClick={onClose}
                aria-label="Zamknij"
                className="absolute right-4 top-4 z-20 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>}
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1">{children}</div>
            {footer && <div className="mt-5 flex shrink-0 flex-wrap justify-end gap-2 pt-2 border-t border-border/40">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>, document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Potwierdź operację",
  description,
  confirmLabel = "Usuń",
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button
            variant={danger ? "destructive" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">Operacji nie można cofnąć.</p>
    </Dialog>
  );
}
