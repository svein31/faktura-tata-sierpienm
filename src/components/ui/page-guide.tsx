"use client";
import { useAppStore } from "@/lib/store";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { Badge } from "./badge";
import { cn } from "@/lib/utils";

export { Tooltip, InfoTooltip, HelpTooltip } from "./tooltip";
export { OnboardingBanner } from "./onboarding-banner";

export interface PageGuideProps {
  title?: string;
  description?: string;
  badge?: string;
  variant?: "default" | "info" | "success" | "warning";
  steps?: Array<{ title: string; description: string; badge?: string; action?: { label: string; href: string } }>;
  defaultOpen?: boolean;
  className?: string;
  storageKey?: string;
}

export function PageGuide({
  title = "Wskazówki i instrukcja modułu",
  description,
  badge = "Przewodnik",
  steps = [],
  defaultOpen = false,
  className,
  storageKey,
}: PageGuideProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = React.useId();

  React.useEffect(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`guide_${storageKey}`);
        if (saved !== null) setOpen(saved === "true");
      } catch { /* Optional preference storage can be blocked by the browser. */ }
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey && typeof window !== "undefined") {
        try { localStorage.setItem(`guide_${storageKey}`, String(next)); } catch { /* Keep the guide usable without storage. */ }
      }
      return next;
    });
  };

  return (
    <div className={cn("rounded-xl border border-border/60 bg-card  p-4 text-xs shadow-sm", className)}>
      <button type="button" className="flex w-full items-center justify-between text-left cursor-pointer select-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={toggle} aria-expanded={open} aria-controls={open && steps.length ? panelId : undefined}>
        <span className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
          <span>
            <span className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">{title}</span>
              {badge && (
                <Badge tone="primary" className="text-[10px] py-0 px-2">
                  {badge}
                </Badge>
              )}
            </span>
            {description && <span className="block text-muted-foreground mt-0.5">{description}</span>}
          </span>
        </span>

        <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-0 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      <AnimatePresence>
        {open && steps.length > 0 && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3.5 pt-3.5 border-t border-border/40 space-y-2.5 overflow-hidden"
          >
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-start justify-between gap-3 rounded-xl bg-muted/30 p-2.5">
                <div className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-[10px]">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{step.title}</p>
                    <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">{step.description}</p>
                  </div>
                </div>
                {step.action && (
                  <Link prefetch={false}
                    href={step.action.href} onClick={() => { if (step.action?.href === "/invoices/new") useAppStore.getState().setDraft(null, true); }}
                    className="shrink-0 text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    <span>{step.action.label}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
