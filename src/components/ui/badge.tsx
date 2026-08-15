import * as React from "react";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  default: "bg-muted text-muted-foreground border-transparent",
  primary: "bg-primary/10 text-primary border-transparent",
  accent: "bg-accent/10 text-accent border-transparent",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-transparent",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-transparent",
  danger: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300 border-transparent",
  info: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border-transparent",
  outline: "border border-border text-foreground bg-transparent",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof tones;
}

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
