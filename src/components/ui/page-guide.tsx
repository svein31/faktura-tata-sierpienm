"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Info,
  Lightbulb,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Building2,
  FileText,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export interface PageGuideStep {
  title: string;
  description: string;
  badge?: string;
  action?: {
    label: string;
    href: string;
  };
}

export interface PageGuideProps {
  title?: string;
  description?: string;
  badge?: string;
  variant?: "default" | "info" | "success" | "warning";
  steps?: PageGuideStep[];
  defaultOpen?: boolean;
  className?: string;
  storageKey?: string;
}

export function PageGuide({
  title = "Jak to działa? / Instrukcja",
  description,
  badge = "Wskazówki",
  variant = "default",
  steps = [],
  defaultOpen = true,
  className,
  storageKey,
}: PageGuideProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    if (storageKey && typeof window !== "undefined") {
      const saved = localStorage.getItem(`guide_${storageKey}`);
      if (saved !== null) {
        setIsOpen(saved === "true");
      }
    }
  }, [storageKey]);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(`guide_${storageKey}`, String(next));
    }
  };

  const variantStyles = {
    default: "border-primary/20 bg-primary/[0.03] dark:bg-primary/[0.05]",
    info: "border-blue-500/25 bg-blue-500/[0.04] dark:bg-blue-500/[0.07]",
    success: "border-emerald-500/25 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.07]",
    warning: "border-amber-500/25 bg-amber-500/[0.04] dark:bg-amber-500/[0.07]",
  };

  const iconColors = {
    default: "text-primary",
    info: "text-blue-500",
    success: "text-emerald-500",
    warning: "text-amber-500",
  };

  return (
    <div
      className={cn(
        "relative mb-5 overflow-hidden rounded-xl border p-4 transition-all duration-200",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          className="flex flex-1 items-center gap-2.5 text-left font-medium text-foreground transition-opacity hover:opacity-85"
        >
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background shadow-xs ring-1 ring-border/60",
              iconColors[variant]
            )}
          >
            <Lightbulb className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold tracking-tight">{title}</span>
              {badge && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary">
                  {badge}
                </span>
              )}
            </div>
            {!isOpen && description && (
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{description}</p>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={toggle}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          aria-label={isOpen ? "Zwiń pomoc" : "Rozwiń pomoc"}
        >
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {description && (
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}

            {steps.length > 0 && (
              <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between rounded-lg border border-border/60 bg-background/80 p-3 shadow-xs"
                  >
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                          {idx + 1}
                        </span>
                        {step.badge && (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {step.badge}
                          </span>
                        )}
                      </div>
                      <h4 className="text-[12.5px] font-semibold text-foreground">{step.title}</h4>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>

                    {step.action && (
                      <Link
                        href={step.action.href}
                        className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
                      >
                        {step.action.label} <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Mały tooltip z dymkiem pomocy obok etykiety formularza
 */
export function HelpTooltip({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-hidden"
        aria-label="Informacja pomocy"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 z-50 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-[11.5px] font-normal leading-relaxed text-popover-foreground shadow-lg backdrop-blur-md"
          >
            {text}
            <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-border bg-popover" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Baner Pierwszego Kroku (Onboarding Box) na Dashboardzie
 */
export function OnboardingBanner({
  hasCompany,
  hasKsef,
  hasInvoices,
}: {
  hasCompany: boolean;
  hasKsef: boolean;
  hasInvoices: boolean;
}) {
  const steps = [
    {
      id: "company",
      title: "1. Profil firmy i NIP",
      desc: "Wpisz swój NIP i pobierz dane z Bazy REGON (GUS).",
      done: hasCompany,
      href: "/settings/companies",
      btn: "Skonfiguruj firmę",
      icon: Building2,
    },
    {
      id: "ksef",
      title: "2. Ustawienia KSeF",
      desc: "Wybierz środowisko i wklej Token KSeF z portalu MF.",
      done: hasKsef,
      href: "/ksef",
      btn: "Podłącz KSeF",
      icon: KeyRound,
    },
    {
      id: "invoice",
      title: "3. Pierwsza faktura",
      desc: "Wystaw pierwszą e-Fakturę i przekaż do KSeF lub na e-mail.",
      done: hasInvoices,
      href: "/invoices/new",
      btn: "Wystaw fakturę",
      icon: FileText,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  if (completedCount === steps.length) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-[13px] text-emerald-800 dark:text-emerald-300">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">Twoje konto jest w 100% skonfigurowane!</p>
            <p className="text-[12px] opacity-85">Profil firmy, integracja KSeF oraz system fakturujący są w pełni gotowe do pracy.</p>
          </div>
        </div>
        <Link
          href="/invoices/new"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
        >
          Wystaw nową fakturę <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.04] via-background to-accent/[0.04] p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold tracking-tight text-foreground">
              Konfiguracja Twojej Aplikacji Fakturo
            </h3>
            <p className="text-[12px] text-muted-foreground">
              Wykonaj 3 proste kroki, aby w pełni zautomatyzować fakturowanie i wysyłkę do KSeF:
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Postęp</p>
            <p className="text-[14px] font-bold text-primary">{progressPercent}% ukończono</p>
          </div>
          <div className="h-2.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex flex-col justify-between rounded-lg border p-3.5 transition-all",
              step.done
                ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                : "border-border bg-card/80 shadow-xs hover:border-primary/40"
            )}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                  <step.icon className={cn("h-4 w-4", step.done ? "text-emerald-500" : "text-primary")} />
                  {step.title}
                </span>
                {step.done ? (
                  <Badge tone="success" className="text-[10px]">
                    <CheckCircle2 className="h-3 w-3" /> Gotowe
                  </Badge>
                ) : (
                  <Badge tone="outline" className="text-[10px]">
                    Wymagane
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                {step.desc}
              </p>
            </div>

            <div className="mt-3.5 pt-2">
              <Link
                href={step.href}
                className={cn(
                  "inline-flex h-7 w-full items-center justify-center gap-1 rounded-md text-[11.5px] font-medium transition-colors",
                  step.done
                    ? "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {step.done ? "Przejdź do edycji" : step.btn}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
