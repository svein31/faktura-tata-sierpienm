import * as React from "react";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  default: "bg-muted text-muted-foreground border-border/60",
  primary: "bg-primary/10 text-primary border-primary/20",
  accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  danger: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  outline: "border-border/80 text-foreground bg-transparent",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof tones;
  dot?: boolean;
  dotColor?: string;
}

export function Badge({ className, tone = "default", dot, dotColor, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight shadow-2xs transition-colors",
        tones[tone],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            dotColor ?? "bg-current"
          )}
        />
      )}
      {children}
    </span>
  );
}
