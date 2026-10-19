import * as React from "react";
import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

/** Keep the idle and pending labels in the same grid cell to reserve their width. */
export function SaveButton({ pending, children, disabled, ...props }: Omit<ButtonProps, "loading"> & { pending: boolean }) {
  return <Button {...props} disabled={disabled || pending} aria-busy={pending || undefined}>
    <span className="ui-save-label">
      <span className={cn("ui-save-label-idle", pending && "invisible")} aria-hidden={pending || undefined}>{children}</span>
      <span className={cn("ui-save-label-pending", !pending && "invisible")} aria-hidden={!pending || undefined}>
        <svg className="size-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity=".25" />
          <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>Zapisywanie…
      </span>
    </span>
  </Button>;
}
