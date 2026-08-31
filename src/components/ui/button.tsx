import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "subtle" | "accent";
type Size = "sm" | "default" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:shadow-sm active:scale-[0.98] ring-1 ring-primary/30",
  secondary:
    "bg-secondary text-secondary-foreground border border-border/60 hover:bg-secondary/80 hover:text-foreground active:scale-[0.98]",
  outline:
    "border border-border/80 bg-card text-foreground shadow-2xs hover:bg-muted/50 hover:border-border active:scale-[0.98]",
  ghost:
    "text-muted-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.98]",
  destructive:
    "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:scale-[0.98]",
  subtle:
    "bg-primary/10 text-primary hover:bg-primary/15 active:scale-[0.98]",
  accent:
    "bg-accent text-accent-foreground shadow-xs hover:bg-accent/90 active:scale-[0.98]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  default: "h-9 px-4 text-[13px] gap-2 rounded-xl",
  lg: "h-11 px-5 text-sm gap-2.5 rounded-xl font-semibold",
  icon: "h-9 w-9 rounded-xl",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-45 disabled:scale-100",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <svg
          className="h-3.5 w-3.5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";
