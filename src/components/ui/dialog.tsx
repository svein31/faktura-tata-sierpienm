"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "@/lib/overlay-scroll";
import { containModalFocus } from "@/lib/overlay-focus";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  hideOnPrint?: boolean;
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
  hideOnPrint = false,
}: DialogProps) {
  const reducedMotion = useReducedMotion();
  const panel = React.useRef<HTMLDivElement>(null);
  const close = React.useRef(onClose);
  const canDismiss = React.useRef(dismissible);
  canDismiss.current = dismissible;
  close.current = onClose;
  const titleId = React.useId(), descriptionId = React.useId();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [viewport, setViewport] = React.useState<{ top: number; left: number; width: number; height: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!open || !mounted) return;
    const unlock = lockBodyScroll();
    const updateViewport = () => setViewport({ top: window.visualViewport?.offsetTop || 0, left: window.visualViewport?.offsetLeft || 0, width: window.visualViewport?.width || document.documentElement.clientWidth, height: window.visualViewport?.height || window.innerHeight });
    updateViewport();
    const releaseFocus = panel.current ? containModalFocus(panel.current, () => { if (canDismiss.current) close.current(); }) : () => {};
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      unlock();
      releaseFocus();
    };
  }, [open, mounted]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn("fixed z-50 flex items-end justify-center p-2 sm:items-center sm:p-4", hideOnPrint && "no-print")} style={{ top: viewport?.top || 0, left: viewport?.left || 0, width: viewport?.width || "100%", maxWidth: "100vw", height: viewport?.height || "100dvh" }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
            className="absolute inset-0 bg-black/45"
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
            transition={{ duration: reducedMotion ? 0 : 0.16, ease: "easeOut" }}
            className={cn(
              "relative z-10 flex w-full min-w-0 max-h-full flex-col rounded-xl border border-border bg-card p-5 sm:p-6 shadow-[var(--shadow-dialog)]",
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
                {title && <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">{title}</h2>}
                {description && (
                  <p id={descriptionId} className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
                )}
              </div>
              {dismissible && <button
                type="button"
                onClick={onClose}
                aria-label="Zamknij"
                className="absolute right-4 top-4 z-20 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
