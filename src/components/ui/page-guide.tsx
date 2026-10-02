"use client";
import { useAppStore } from "@/lib/store";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Building2,
  FileText,
  Play,
  X,
} from "lucide-react";
import { Button } from "./button";
import { Badge } from "./badge";
import { Card } from "./card";
import { cn } from "@/lib/utils";
import { openOnboardingTour } from "@/components/onboarding/onboarding-tour";

export { Tooltip, InfoTooltip, HelpTooltip } from "./tooltip";

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

  React.useEffect(() => {
    if (storageKey && typeof window !== "undefined") {
      const saved = localStorage.getItem(`guide_${storageKey}`);
      if (saved !== null) {
        setOpen(saved === "true");
      }
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey && typeof window !== "undefined") {
        localStorage.setItem(`guide_${storageKey}`, String(next));
      }
      return next;
    });
  };

  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card/40 backdrop-blur p-4 text-xs shadow-sm", className)}>
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={toggle}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">{title}</span>
              {badge && (
                <Badge tone="primary" className="text-[10px] py-0 px-2">
                  {badge}
                </Badge>
              )}
            </div>
            {description && <p className="text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>

        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      <AnimatePresence>
        {open && steps.length > 0 && (
          <motion.div
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
                  <Link
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

export function OnboardingBanner({
  hasCompany = false,
  hasKsef = false,
  hasInvoices = false,
}: {
  hasCompany?: boolean;
  hasKsef?: boolean;
  hasInvoices?: boolean;
}) {
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const isDismissed = localStorage.getItem("fakturo_onboarding_banner_dismissed") === "true";
      setDismissed(isDismissed);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("fakturo_onboarding_banner_dismissed", "true");
    }
  };

  // Jeśli wszystko jest skonfigurowane lub użytkownik odrzucił banner, nie wyświetlamy
  if (dismissed || (hasCompany && hasKsef && hasInvoices)) {
    return null;
  }

  const checklist = [
    { label: "Profil i dane firmy", done: hasCompany, href: "/settings/companies", icon: Building2 },
    { label: "Autoryzacja KSeF 2.0", done: hasKsef, href: "/ksef", icon: ShieldCheck },
    { label: "Pierwsza faktura VAT", done: hasInvoices, href: "/invoices/new", icon: FileText },
  ];

  return (
    <Card className="relative overflow-hidden border-border/70 bg-gradient-to-r from-card via-[#0e131d] to-card p-4 backdrop-blur shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm text-foreground">
                Witaj w FakturaProsto! Ukończ szybką konfigurację konta
              </h4>
              <Badge tone="accent" className="text-[10px]">
                Start
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Skorzystaj z interaktywnego samouczka, aby przygotować system do zgodności z KSeF 2.0 i wystawić pierwszą fakturę.
            </p>
          </div>
        </div>

        {/* Akcje bannera */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            onClick={openOnboardingTour}
            className="gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Uruchom samouczek</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            title="Zamknij powiadomienie"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mini checklist kroki */}
      <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-border/40 pt-3">
        {checklist.map((item, idx) => (
          <Link
            key={idx}
            href={item.href} onClick={() => { if (item.href === "/invoices/new") useAppStore.getState().setDraft(null, true); }}
            className={cn(
              "flex items-center justify-between rounded-lg border p-2 text-xs transition-colors",
              item.done
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                : "border-border/50 bg-card/60 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-2">
              <item.icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </div>
            {item.done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <span className="text-[10px] text-muted-foreground">Do zrobienia</span>
            )}
          </Link>
        ))}
      </div>
    </Card>
  );
}
