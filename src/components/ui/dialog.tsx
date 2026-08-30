"use client";

import * as React from "react";
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
}: DialogProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className={cn(
              "relative z-10 w-full max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-2xl backdrop-blur-xl",
              sizes[size],
              className
            )}
            role="dialog"
            aria-modal="true"
          >
            {/* Apple Drag Handle (mobile only) */}
            <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/30 sm:hidden" />

            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                {title && <h2 className="text-[16px] font-semibold tracking-tight text-foreground">{title}</h2>}
                {description && (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Zamknij"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">{children}</div>
            {footer && <div className="mt-5 flex flex-wrap justify-end gap-2 pt-2 border-t border-border/40">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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
