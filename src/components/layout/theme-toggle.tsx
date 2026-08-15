"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const icon =
    theme === "dark" ? <Moon className="h-4 w-4" /> : theme === "light" ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />;

  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border bg-card p-0.5", className)}>
      {(["light", "system", "dark"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTheme(t)}
          title={t === "light" ? "Jasny" : t === "dark" ? "Ciemny" : "Systemowy"}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            theme === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t === "light" ? <Sun className="h-3.5 w-3.5" /> : t === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
        </button>
      ))}
    </div>
  );
}
