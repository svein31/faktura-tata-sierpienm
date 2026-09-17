"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
  X,
  ExternalLink,
  Keyboard,
  Shield,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "fakturo_onboarding_completed_v2";

export function openOnboardingTour() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fakturo:open-onboarding"));
  }
}

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
      "FakturaProsto jest w 100% zintegrowane z Krajowym Systemem e-Faktur w najnowszym schemacie FA(3). Możesz testować wysyłkę na środowisku demo lub od razu przejść na produkcję.",
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
      "Przypomnienia o terminach: 20. ZUS oraz 25. VAT (JPK_V7) i PIT/CIT",
      "Miesięczny bilans przepływów pieniężnych (wpływy vs wydatki)",
      "Uwierzytelnianie dwuskładnikowe 2FA z kodami zapasowymi",
    ],
    actionLabel: "Otwórz Terminarz płatności",
    actionHref: "/calendar",
  },
];

export function OnboardingTour() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);

  // Sprawdzenie przy montowaniu komponentu
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // Otwórz samouczek z lekkim opóźnieniem dla płynnego startu
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Nasłuchiwanie na custom event ponownego otwarcia samouczka
  React.useEffect(() => {
    function handleOpen() {
      setStepIndex(0);
      setIsOpen(true);
    }
    window.addEventListener("fakturo:open-onboarding", handleOpen);
    return () => window.removeEventListener("fakturo:open-onboarding", handleOpen);
  }, []);

  const handleComplete = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "true");
    }
    setIsOpen(false);
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
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Tło przyciemniające */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleComplete}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm"
        />

        {/* Modal Onboardingu */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
          className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border/80 bg-[#0c1017] shadow-2xl"
        >
          {/* Górny pasek postępu */}
          <div className="h-1.5 w-full bg-muted/30">
            <motion.div
              className="h-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-400"
              initial={{ width: `${((stepIndex) / TOUR_STEPS.length) * 100}%` }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="p-6">
            {/* Nagłówek z etykietą kroku i przyciskiem zamknięcia */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge tone="primary" className="font-semibold">
                  {currentStep.badge}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Krok {stepIndex + 1} z {TOUR_STEPS.length}
                </span>
              </div>
              <button
                onClick={handleComplete}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                title="Pomiń samouczek"
              >
                <X className="h-4 w-4" />
              </button>
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
                <div>
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
            <div className="mt-6 flex items-center justify-between border-t border-border/50 pt-4">
              <div className="flex items-center gap-2">
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

              <div className="flex items-center gap-2">
                <Link
                  href={currentStep.actionHref}
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
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
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
