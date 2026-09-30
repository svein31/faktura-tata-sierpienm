"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl border border-border/70 bg-card/70 p-0.5 shadow-2xs backdrop-blur-md",
        className
      )}
    >
      {(["light", "system", "dark"] as const).map((t) => {
        const active = theme === t;
        return (
          <button
            key={t}
            onClick={() => setTheme(t)}
            aria-pressed={active}
            aria-label={t === "light" ? "Jasny" : t === "dark" ? "Ciemny" : "Systemowy"}
            title={t === "light" ? "Jasny" : t === "dark" ? "Ciemny" : "Systemowy"}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg text-xs transition-all duration-150 active:scale-90",
              active
                ? "bg-primary/15 text-primary shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            {t === "light" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : t === "dark" ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <Monitor className="h-3.5 w-3.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}
