"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  ariaLabel = "Zakładki",
}: {
  items: TabItem[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const instanceId = React.useId();
  const selectedIndex = Math.max(0, items.findIndex(item => item.value === value));
  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-card/60 p-1 text-[13px] font-medium backdrop-blur-md shadow-2xs",
        className
      )}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={event => {
              const nextIndex = event.key === "ArrowRight" ? (index + 1) % items.length
                : event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length
                : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
              if (nextIndex === null) return;
              event.preventDefault();
              const next = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex];
              onChange(items[nextIndex].value);
              next?.focus();
            }}
            className={cn(
              "relative inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              active ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            {active && (
              <motion.span
                layoutId={`${instanceId}-tabs-pill`}
                className="absolute inset-0 rounded-lg bg-card shadow-xs ring-1 ring-border/80"
                transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {item.icon}
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
