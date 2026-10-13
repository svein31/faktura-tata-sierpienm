import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-4 sm:items-center", className)}>
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight text-foreground lg:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
