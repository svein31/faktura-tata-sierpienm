"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  badge?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  badge,
}: EmptyStateProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center select-none",
        className
      )}
    >
      <div className="mb-4 flex items-center justify-center">
        <div className="ui-empty-icon h-10 w-10">
          <Icon aria-hidden="true" className="h-6 w-6 stroke-[1.75]" />
        </div>
      </div>

      {badge && (
        <span className="mb-2 inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {badge}
        </span>
      )}

      <h3 className="text-[15px] font-semibold tracking-tight text-foreground sm:text-base">
        {title}
      </h3>

      <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground leading-relaxed">
        {description}
      </p>

      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {action}
          {secondaryAction}
        </div>
      )}
    </motion.div>
  );
}
