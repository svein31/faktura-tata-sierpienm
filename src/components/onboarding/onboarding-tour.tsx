"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, Check, Eye, FilePenLine, ShieldCheck, Shield } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session-context";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { markOnboardingSeen } from "./events";
import { onboardingReadiness } from "./progress";

const TOUR_STEPS = [
  {
    id: "company", title: "Zacznij od danych swojej firmy", eyebrow: "Dane sprzedawcy", icon: Building2,
    description: "To te dane pojawią się na Twoich dokumentach. Wybierz właściwą firmę, sprawdź jej profil i uzupełnij brakujące informacje.",
    highlights: ["Sprawdź NIP, pełną nazwę oraz adres firmy.", "Dodaj rachunek bankowy, jeśli przyjmujesz przelewy.", "Przy kilku firmach upewnij się, że pracujesz we właściwej."],
    actionLabel: "Otwórz dane firmy", actionHref: "/settings/companies",
    note: "Jeśli nie możesz edytować profilu, poproś właściciela firmy o uzupełnienie danych.",
  },
  {
    id: "draft", title: "Przygotuj i zapisz pierwszy szkic", eyebrow: "Pierwszy dokument", icon: FilePenLine,
    description: "Otwórz kreator i przygotuj dokument bez wysyłania go do KSeF. Szkic pozwala zachować pracę i wrócić do niej później.",
    highlights: ["Wybierz lub uzupełnij dane nabywcy.", "Dodaj pozycję, ilość, cenę i właściwą stawkę VAT.", "Sprawdź daty oraz płatność i wybierz „Zapisz szkic”."],
    actionLabel: "Otwórz kreator", actionHref: "/invoices/new",
    note: "Zapis szkicu nie wystawia ani nie wysyła faktury. Nie używaj przykładowych danych do rzeczywistej wysyłki.",
  },
  {
    id: "preview", title: "Obejrzyj dokument przed wystawieniem", eyebrow: "Podgląd i kontrola", icon: Eye,
    description: "Podgląd na żywo znajduje się pod formularzem kreatora. Zapisany dokument otworzysz również z listy faktur, w zakładce „Podgląd dokumentu”.",
    highlights: ["Porównaj dane sprzedawcy i nabywcy oraz numery NIP.", "Sprawdź daty, nazwy pozycji, stawki VAT i kwotę do zapłaty.", "Przed wystawieniem sprawdź obowiązek KSeF i środowisko wysyłki."],
    actionLabel: "Otwórz listę dokumentów", actionHref: "/invoices",
    note: "Sam podgląd nie wysyła dokumentu i nie potwierdza jego przyjęcia w KSeF.",
  },
  {
    id: "ksef", title: "Przygotuj właściwe środowisko KSeF", eyebrow: "Przed rzeczywistym wystawieniem", icon: ShieldCheck,
    description: "Szkic możesz przygotować przed konfiguracją integracji. Jeśli Twoja faktura podlega KSeF, przed jej wystawieniem potrzebujesz uprawnień i konfiguracji środowiska produkcyjnego.",
    highlights: ["Przygotuj NIP firmy, odpowiednie uprawnienia i token dla wybranego środowiska.", "W Centrum KSeF wybierz środowisko, zapisz ustawienia i użyj testu połączenia.", "Po wysyłce sprawdź status dokumentu, numer KSeF i UPO."],
    actionLabel: "Otwórz Centrum KSeF", actionHref: "/ksef",
    note: "Demo to symulator, a test służy do prób. Żadne z nich nie zastępuje produkcji. Zapisany token lub nazwa certyfikatu nie potwierdzają udanego połączenia.",
  },
  {
    id: "security", title: "Zabezpiecz konto i wracaj po pomoc", eyebrow: "Gotowe do dalszej pracy", icon: Shield,
    description: "Po przygotowaniu pierwszego dokumentu zadbaj o ochronę konta. Ten przewodnik możesz ponownie uruchomić z sekcji „Pomoc”.",
    highlights: ["Włącz logowanie dwuskładnikowe (2FA) w ustawieniach konta.", "Zachowaj kody zapasowe w bezpiecznym miejscu.", "Przed wysyłką rzeczywistych dokumentów sprawdź dane i konfigurację firmy."],
    actionLabel: "Otwórz ustawienia konta", actionHref: "/settings/account",
    note: "Zamknięcie przewodnika oznacza tylko jego przeczytanie. Stan danych firmy i dokumentów sprawdzamy osobno.",
  },
];

export function OnboardingTour({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSessionUser();
  const company = useAppStore(state => state.company);
  const ksef = useAppStore(state => state.ksef);
  const ready = onboardingReadiness(company, ksef);
  const [stepIndex, setStepIndex] = React.useState(0);
  const step = TOUR_STEPS[stepIndex];
  const Icon = step.icon;
  const unavailable = step.id === "draft" && !ready.canCreate;
  const handleClose = () => {
    markOnboardingSeen(user.id, company?.id);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open onClose={handleClose} title="Pierwsze kroki" description="Od danych firmy do sprawdzonego szkicu. Każdy etap możesz wykonać we własnym tempie." size="lg">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 text-xs">
          <p className="font-semibold text-primary">{step.eyebrow}</p>
          <p className="shrink-0 tabular-nums text-muted-foreground" aria-live="polite">Krok {stepIndex + 1} z {TOUR_STEPS.length}</p>
        </div>
        <div role="group" className="mt-3 flex gap-1.5" aria-label={`Strona przewodnika ${stepIndex + 1} z ${TOUR_STEPS.length}`}>
          {TOUR_STEPS.map((item, index) => <span key={item.id} aria-hidden="true" className={cn("h-1 flex-1 rounded-full transition-colors", index <= stepIndex ? "bg-primary" : "bg-muted")} />)}
        </div>
        <div className="mt-6 flex items-start gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug tracking-tight">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
          </div>
        </div>
        <ul className="mt-5 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
          {step.highlights.map(item => <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed"><Check aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-primary" /><span>{item}</span></li>)}
        </ul>
        <p className="mt-4 rounded-lg border-l-2 border-primary/40 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{step.note}</p>
        {unavailable ? <p className="mt-4 text-sm text-muted-foreground">Nie masz uprawnienia do wystawiania faktur w tej firmie. Poproś jej właściciela o dostęp.</p> : <Link prefetch={false} href={step.actionHref} onClick={handleClose} className="mt-4 inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>{step.actionLabel}</span><ArrowRight aria-hidden="true" className="size-4 shrink-0" /></Link>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <Button variant="ghost" size="sm" onClick={handleClose} className="min-h-11 text-xs text-muted-foreground">Wrócę później</Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStepIndex(index => index - 1)} disabled={stepIndex === 0} className="min-h-11 gap-1.5 text-xs"><ArrowLeft aria-hidden="true" className="size-3.5" />Wstecz</Button>
            <Button size="sm" onClick={() => stepIndex === TOUR_STEPS.length - 1 ? handleClose() : setStepIndex(index => index + 1)} className="min-h-11 gap-1.5 text-xs">{stepIndex === TOUR_STEPS.length - 1 ? "Zamknij przewodnik" : "Dalej"}<ArrowRight aria-hidden="true" className="size-3.5" /></Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
