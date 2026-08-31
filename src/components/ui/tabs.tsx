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
}: {
  items: TabItem[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-border/70 bg-card/60 p-1 text-[13px] font-medium backdrop-blur-md shadow-2xs",
        className
      )}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-all duration-150 active:scale-[0.98]",
              active ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            {active && (
              <motion.span
                layoutId="tabs-pill"
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
