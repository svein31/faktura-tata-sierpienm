"use client";
import { useAppStore } from "@/lib/store";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Dialog } from "@/components/ui/dialog";
import {
  Building2,
  ShieldCheck,
  FileText,
  Users,
  Calendar,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Keyboard,
  Shield,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { ONBOARDING_STORAGE_KEY } from "./events";

interface TourStep {
  id: string;
  stepNumber: number;
  title: string;
  badge: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  description: string;
  highlights: string[];
  actionLabel: string;
  actionHref: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "company",
    stepNumber: 1,
    title: "Profil Twojej Firmy & Rachunek Bankowy",
    badge: "Krok 1: Podstawa prawna",
    icon: Building2,
    iconColor: "text-indigo-400",
    iconBg: "bg-indigo-500/15 border-indigo-500/30",
    description:
      "Wprowadź swój NIP, a system automatycznie pobierze pełną nazwę, adres i REGON z bazy GUS BIR. Skonfiguruj numer konta bankowego IBAN, który pojawi się na dokumentach.",
    highlights: [
      "Błyskawiczne pobieranie danych z rejestru REGON/KRS",
      "Obsługa rachunków walutowych (PLN, EUR, USD, GBP) ze SWIFT",
      "Przełączanie wielu firm (Multi-Company) w jednym panelu",
    ],
    actionLabel: "Przejdź do konfiguracji firmy",
    actionHref: "/settings/companies",
  },
  {
    id: "ksef",
    stepNumber: 2,
    title: "Centrum Integracji KSeF 2.0 (FA(3))",
    badge: "Krok 2: Zgodność z MF",
    icon: ShieldCheck,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/15 border-emerald-500/30",
    description:
      "FakturaProsto obsługuje KSeF 2.0 i strukturę FA(3). Zacznij od symulatora demo. Wysyłkę na oficjalną bramkę testową lub produkcyjną uruchom po konfiguracji i nadaniu uprawnień.",
    highlights: [
      "Kolejkowanie asynchroniczne i odporność na awarie bramki",
      "Automatyczne pobieranie i archiwizacja plików UPO (XML)",
      "Tryb offline z kodami QR zgodnie z wytycznymi Ministerstwa Finansów",
    ],
    actionLabel: "Otwórz Centrum KSeF",
    actionHref: "/ksef",
  },
  {
    id: "invoices",
    stepNumber: 3,
    title: "Inteligentny Kreator Faktur VAT",
    badge: "Krok 3: Błyskawiczne fakturowanie",
    icon: FileText,
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/15 border-sky-500/30",
    description:
      "Nowoczesny kreator automatycznie przelicza stawki VAT, rabaty i kursy NBP z dnia poprzedzającego. Korzystaj z wbudowanych skrótów klawiszowych dla maksymalnej wygody.",
    highlights: [
      "Skróty klawiszowe: Ctrl+S (szkic), Ctrl+Enter (KSeF), Shift+Alt+N (pozycja)",
      "Obsługa faktur VAT, proform, zaliczkowych i korekt (KOR)",
      "Natychmiastowy podgląd PDF i bezpieczna wysyłka e-mail z załącznikiem",
    ],
    actionLabel: "Wystaw pierwszą fakturę",
    actionHref: "/invoices/new",
  },
  {
    id: "contractors",
    stepNumber: 4,
    title: "Baza Kontrahentów & Weryfikacja GUS",
    badge: "Krok 4: Bezpieczeństwo transakcji",
    icon: Users,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/15 border-amber-500/30",
    description:
      "Wpisz NIP klienta podczas fakturowania lub w kartotece – system w ułamku sekundy uzupełni dane i sprawdzi status na Białej Liście Podatników VAT.",
    highlights: [
      "Weryfikacja rachunku bankowego na Białej Liście VAT",
      "Scoring wiarygodności płatniczej i limity kupieckie z blokadą",
      "Indywidualne cenniki i historia obrotów dla każdego klienta",
    ],
    actionLabel: "Zarządzaj kontrahentami",
    actionHref: "/contractors",
  },
  {
    id: "calendar-security",
    stepNumber: 5,
    title: "Terminarz Płatności & Zabezpieczenie 2FA",
    badge: "Krok 5: Finanse & Ochrona",
    icon: Calendar,
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/15 border-purple-500/30",
    description:
      "Kontroluj płatności i terminy urzędowe w nowym widoku Kalendarza. Zabezpiecz swoje konto logowaniem dwuskładnikowym (2FA TOTP), aby chronić dane finansowe.",
    highlights: [
      "Terminy: ZUS zależnie od firmy, zaliczki PIT/CIT zwykle 20., VAT/JPK_V7 zwykle 25.; dni wolne przesuwają termin",
      "Miesięczny bilans przepływów pieniężnych (wpływy vs wydatki)",
      "Uwierzytelnianie dwuskładnikowe 2FA z kodami zapasowymi",
    ],
    actionLabel: "Otwórz Terminarz płatności",
    actionHref: "/calendar",
  },
];

export function OnboardingTour({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const [stepIndex, setStepIndex] = React.useState(0);


  const handleComplete = () => {
    if (typeof window !== "undefined") {
      try { localStorage.setItem(ONBOARDING_STORAGE_KEY, "true"); } catch { /* Storage may be unavailable. */ }
    }
    onClose();
  };

  const handleNext = () => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1);
    }
  };

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[stepIndex];
  const StepIcon = currentStep.icon;
  const progressPercent = ((stepIndex + 1) / TOUR_STEPS.length) * 100;

  return (
    <Dialog open={isOpen} onClose={handleComplete} title="Pierwsze kroki" size="lg">
          {/* Górny pasek postępu */}
          <div className="h-1.5 w-full bg-muted/30">
            <motion.div
              className="h-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-400"
              initial={{ width: `${((stepIndex) / TOUR_STEPS.length) * 100}%` }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="min-w-0 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary" className="font-semibold">{currentStep.badge}</Badge>
              <span className="text-xs text-muted-foreground">Krok {stepIndex + 1} z {TOUR_STEPS.length}</span>
            </div>

            {/* Treść kroku */}
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border",
                    currentStep.iconBg,
                    currentStep.iconColor
                  )}
                >
                  <StepIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0 break-words">
                  <h3 className="text-lg font-bold text-foreground">
                    {currentStep.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {currentStep.description}
                  </p>
                </div>
              </div>

              {/* Kluczowe cechy w pigułkach */}
              <div className="rounded-xl border border-border/50 bg-card/40 p-3.5 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Kluczowe możliwości:
                </p>
                <div className="space-y-1.5">
                  {currentStep.highlights.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-foreground/90">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Dolny pasek nawigacji */}
            <div className="mt-6 flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:flex-wrap sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrev}
                  disabled={stepIndex === 0}
                  className="gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Wstecz</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleComplete}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Pomiń
                </Button>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Link prefetch={false}
                  href={currentStep.actionHref}
                  onClick={() => { if (currentStep.actionHref === "/invoices/new") useAppStore.getState().setDraft(null, true); onClose(); }}
                  className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
                >
                  <span>{currentStep.actionLabel}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Link>

                <Button
                  size="sm"
                  onClick={handleNext}
                  className="gap-1 text-xs font-semibold shadow-sm"
                >
                  <span>{stepIndex === TOUR_STEPS.length - 1 ? "Zakończ konfigurację" : "Dalej"}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
    </Dialog>
  );
}
