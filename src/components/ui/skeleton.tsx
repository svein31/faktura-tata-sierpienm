import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Apple-style pulsing shimmering skeleton block
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/60 dark:bg-slate-800/60",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.8s_infinite] after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.04] after:to-transparent",
        className
      )}
      {...props}
    />
  );
}

/**
 * Skeleton dla kafelków statystyk (Dashboard)
 */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton dla kart podsumowania i formularzy
 */
export function CardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-card p-5 shadow-xs space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
      <div className="space-y-2.5 pt-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-full" style={{ width: `${100 - i * 15}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton dla tabel (Faktury, Kontrahenci, Produkty)
 */
export function TableSkeleton({
  rows = 5,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-card overflow-hidden shadow-xs", className)}>
      <div className="border-b border-border/60 bg-muted/30 p-3.5 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center justify-between gap-4 py-2 border-b border-border/40 last:border-0">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton dla podglądu faktury i formularza
 */
export function InvoiceDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <div className="flex justify-between">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-8 w-28" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
          <Skeleton className="h-40 rounded-lg" />
        </div>
        <div className="space-y-4">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
