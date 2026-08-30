"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLSpanElement>(null);

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
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Informacja"
        className="inline-flex cursor-help items-center justify-center p-0.5 text-slate-400 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 focus:outline-none"
      >
        {children || <Info className="h-3.5 w-3.5 stroke-[2]" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, scale: 0.94, y: side === "top" ? 3 : -3 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: side === "top" ? 2 : -2 }}
            transition={{ type: "spring", stiffness: 450, damping: 25 }}
            className={cn(
              "pointer-events-none absolute z-50 w-max max-w-[260px] rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 text-left text-[11.5px] font-normal leading-snug text-white shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-800/95 dark:text-slate-100",
              sideClasses[side],
              className
            )}
            role="tooltip"
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
        <HelpCircle className="h-3.5 w-3.5 stroke-[2] text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300" />
      ) : (
        <Info className="h-3.5 w-3.5 stroke-[2] text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300" />
      )}
    </Tooltip>
  );
}

/** Alias dla wstecznej kompatybilności */
export const HelpTooltip = InfoTooltip;
