"use client";

import * as React from "react";
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
  const selectedIndex = Math.max(0, items.findIndex(item => item.value === value));
  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 text-sm font-medium",
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
              "relative inline-flex min-h-8 min-w-0 max-w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              active ? "bg-card text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
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
