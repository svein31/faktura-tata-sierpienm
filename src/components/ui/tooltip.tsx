"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HelpCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  children?: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: TooltipProps) {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLSpanElement>(null);
  const tooltipId = React.useId();

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Informacja"
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex cursor-help items-center justify-center rounded p-0.5 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {children || <Info className="h-3.5 w-3.5 stroke-[2]" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.12 }}
            className={cn(
              "pointer-events-none absolute z-50 w-max max-w-[260px] rounded-md border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-[var(--shadow-popup)]",
              sideClasses[side],
              className
            )}
            role="tooltip"
            id={tooltipId}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Elegancka ikona (i) lub (?) z krótkim wyjaśnieniem po najechaniu
 */
export function InfoTooltip({
  text,
  icon = "info",
  side = "top",
}: {
  text: string;
  icon?: "info" | "help";
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip content={text} side={side}>
      {icon === "help" ? (
        <HelpCircle aria-hidden="true" className="h-3.5 w-3.5 stroke-[2]" />
      ) : (
        <Info aria-hidden="true" className="h-3.5 w-3.5 stroke-[2]" />
      )}
    </Tooltip>
  );
}

/** Alias dla wstecznej kompatybilności */
export const HelpTooltip = InfoTooltip;
