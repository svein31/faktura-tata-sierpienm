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
        "flex h-9 w-full rounded-xl border border-border/80 bg-card px-3.5 py-1.5 text-[13px] text-foreground shadow-2xs transition-all duration-150",
        "placeholder:text-muted-foreground/60",
        "hover:border-border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-45",
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
      "flex min-h-[84px] w-full rounded-xl border border-border/80 bg-card px-3.5 py-2 text-[13px] text-foreground shadow-2xs transition-all duration-150",
      "placeholder:text-muted-foreground/60",
      "hover:border-border",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary",
      "disabled:cursor-not-allowed disabled:opacity-45",
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
    className={cn("text-[12.5px] font-medium leading-none text-foreground/90 select-none", className)}
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
      "h-4 w-4 shrink-0 cursor-pointer rounded-md border border-border/80 bg-card accent-[hsl(var(--primary))] transition-all",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
      className
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";
