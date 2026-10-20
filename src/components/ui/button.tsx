import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "subtle" | "accent";
type Size = "sm" | "default" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 active:opacity-90",
  secondary:
    "bg-secondary text-secondary-foreground border border-border hover:bg-muted hover:text-foreground active:opacity-90",
  outline:
    "border border-border bg-card text-foreground hover:bg-muted/60 hover:border-input active:opacity-90",
  ghost:
    "text-muted-foreground hover:bg-muted/60 hover:text-foreground active:opacity-90",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:opacity-90",
  subtle:
    "bg-primary/10 text-primary hover:bg-primary/15 active:opacity-90",
  accent:
    "bg-accent text-accent-foreground hover:bg-accent/90 active:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] leading-5 gap-1.5 rounded-md",
  default: "h-10 px-4 text-sm leading-5 gap-2 rounded-md",
  lg: "h-11 px-5 text-sm leading-5 gap-2 rounded-md font-medium",
  icon: "h-9 w-9 rounded-md",
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
        // Keep theme foreground/background pairs atomic to preserve text contrast.
        "inline-flex select-none items-center justify-center max-w-full whitespace-normal break-words text-center sm:whitespace-nowrap font-medium transition-[transform,scale,box-shadow,background-color,border-color,color] duration-150 ease-out cursor-pointer [&_svg]:shrink-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50 disabled:scale-100",
        variants[variant],
        sizes[size],
        size !== "icon" && "max-md:!h-auto max-md:py-2",
        className
      )}
      {...props}
      aria-busy={loading || props["aria-busy"] || undefined}
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
