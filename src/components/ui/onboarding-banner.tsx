"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Eye, FilePenLine, Play, ShieldCheck, Sparkles, X } from "lucide-react";
import { openOnboardingTour } from "@/components/onboarding/events";
import { onboardingPreferenceKey, onboardingReadiness, type OnboardingDocument } from "@/components/onboarding/progress";
import { useSessionUser } from "@/lib/session-context";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Card } from "./card";

export function OnboardingBanner({ savedDocument = null }: { savedDocument?: OnboardingDocument | null }) {
  const user = useSessionUser();
  const company = useAppStore(state => state.company);
  const ksef = useAppStore(state => state.ksef);
  const ready = onboardingReadiness(company, ksef, savedDocument);
  const preferenceKey = onboardingPreferenceKey("banner-dismissed", user.id, company?.id);
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let dismissed = false;
    try { dismissed = Boolean(preferenceKey && localStorage.getItem(preferenceKey) === "true"); } catch { /* Optional preference. */ }
    setDismissedKey(dismissed ? preferenceKey : null);
  }, [preferenceKey]);

  const handleDismiss = () => {
    // A missing identity must not write a preference for another account.
    setDismissedKey(preferenceKey || "this-page");
    try { if (preferenceKey) localStorage.setItem(preferenceKey, "true"); } catch { /* Dismissal still works for this page. */ }
  };

  if (dismissedKey && dismissedKey === (preferenceKey || "this-page")) return null;

  const documentHref = ready.savedDocument ? `/invoices/${encodeURIComponent(ready.savedDocument.id)}` : "/invoices/new";
  const steps = [
    {
      title: "Uzupełnij firmę", icon: Building2, done: ready.companyReady,
      status: ready.companyReady ? "Dane uzupełnione" : "Zacznij tutaj",
      description: "Sprawdź NIP, nazwę i adres sprzedawcy. Dodaj rachunek, jeśli przyjmujesz przelewy.",
      href: "/settings/companies", action: "Dane firmy", disabled: false,
    },
    {
      title: "Przygotuj pierwszy szkic", icon: FilePenLine, done: Boolean(ready.savedDocument),
      status: ready.savedDocument ? "Dokument zapisany" : ready.canCreate ? "Bez wysyłania do KSeF" : "Potrzebne uprawnienie",
      description: ready.savedDocument ? `Masz już zapisany dokument ${ready.savedDocument.number}. Możesz sprawdzić go w podglądzie.` : "Dodaj nabywcę i pozycję, sprawdź kwoty, a następnie wybierz „Zapisz szkic”.",
      href: ready.savedDocument ? documentHref : "/invoices/new",
      action: ready.savedDocument ? "Otwórz dokument" : "Otwórz kreator",
      disabled: !ready.savedDocument && !ready.canCreate,
    },
    {
      title: "Sprawdź podgląd", icon: Eye, done: false,
      status: ready.savedDocument ? "Podgląd dostępny" : "Podgląd na żywo w kreatorze",
      description: "Porównaj dane firmy i nabywcy, daty oraz sumy. W kreatorze podgląd znajdziesz pod formularzem.",
      href: documentHref, action: ready.savedDocument ? "Zobacz podgląd" : "Przejdź do podglądu",
      disabled: !ready.savedDocument && !ready.canCreate,
    },
  ];

  return (
    <Card className="relative overflow-hidden p-4 sm:p-5" aria-labelledby="first-steps-heading">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/8 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Sparkles aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Dobry początek</p>
            <h2 id="first-steps-heading" className="mt-1 text-base font-semibold tracking-tight">Twój pierwszy dokument, krok po kroku</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{company?.companyName || "Twoja firma"} · Przygotuj szkic i sprawdź go przed wystawieniem.</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleDismiss} className="size-11 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Ukryj pierwsze kroki dla tej firmy" title="Ukryj pierwsze kroki"><X aria-hidden="true" className="size-4" /></Button>
      </div>

      <ol className="relative mt-5 grid min-w-0 gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className={cn("flex min-w-0 flex-col rounded-xl border bg-card/60 p-3.5", step.done ? "border-emerald-500/20" : "border-border/60")}>
            <div className="flex items-center gap-2.5">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", step.done ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-600 dark:text-emerald-300" : "border-primary/15 bg-primary/8 text-primary")}><step.icon aria-hidden="true" className="size-4" /></span>
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground">Krok {index + 1}</span>
              {step.done && <CheckCircle2 aria-label={step.status} className="ml-auto size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />}
            </div>
            <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
            <p className={cn("mt-1 text-[11px] font-medium", step.done ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{step.status}</p>
            <p className="mt-2 flex-1 break-words text-xs leading-relaxed text-muted-foreground">{step.description}</p>
            {step.disabled ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Poproś właściciela firmy o uprawnienie do wystawiania faktur.</p> : <Link prefetch={false} href={step.href} className="mt-3 inline-flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 text-xs font-semibold text-primary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>{step.action}</span><ArrowRight aria-hidden="true" className="size-3.5 shrink-0" /></Link>}
          </li>
        ))}
      </ol>

      <div className="relative mt-4 flex flex-col gap-3 border-t border-border/60 pt-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 text-xs leading-relaxed">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-medium">KSeF: {ready.environment === "production" ? "produkcja" : ready.environment === "test" ? "środowisko testowe" : "demo"}{ready.tokenSaved ? " · token zapisany" : " · konfiguracja do sprawdzenia"}</p>
            <p className="mt-1 text-muted-foreground">Szkic i podgląd nie wysyłają faktury. Jeśli dokument podlega KSeF, przed wystawieniem skonfiguruj produkcję i sprawdź połączenie. Demo i test nie zastępują wysyłki produkcyjnej.</p>
            <Link prefetch={false} href="/ksef" className="mt-1 inline-flex min-h-11 items-center gap-1 font-medium text-primary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{ready.canManageKsef ? "Sprawdź konfigurację KSeF" : "Zobacz KSeF · konfigurację zleć administratorowi"}<ArrowRight aria-hidden="true" className="size-3 shrink-0" /></Link>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={openOnboardingTour} className="min-h-11 shrink-0 self-start gap-2 text-xs lg:self-center"><Play aria-hidden="true" className="size-3.5" /><span>Pokaż przewodnik</span></Button>
      </div>
    </Card>
  );
}
