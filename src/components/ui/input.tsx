"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Select as StyledSelect } from "@/components/ui/select";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 min-w-0 w-full rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 text-foreground transition-[border-color,background-color,box-shadow] duration-150 ease-out",
        "placeholder:text-muted-foreground",
        "hover:border-primary/35",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary",
        "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20",
        "disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[96px] min-w-0 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-sm leading-6 text-foreground transition-[border-color,background-color,box-shadow] duration-150 ease-out",
      "placeholder:text-muted-foreground",
      "hover:border-primary/35",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary",
      "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20",
      "disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-60",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = StyledSelect;

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("text-[13px] font-medium leading-5 text-foreground/90 select-none", className)}
    {...props}
  />
));
Label.displayName = "Label";

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 cursor-pointer rounded-md border border-input bg-card accent-[hsl(var(--primary))] transition-[border-color,box-shadow] duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
      "disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";
