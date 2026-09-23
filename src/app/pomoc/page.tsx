import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { OPERATOR_CONFIG } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Pomoc i kontakt",
  description: "Krótka pomoc dotycząca faktur, demonstracji i statusu dokumentów KSeF.",
  openGraph: { title: "Pomoc FakturaProsto", description: "Odpowiedzi na pytania i kontakt z pomocą.", url: "/pomoc" },
  alternates: { canonical: "/pomoc" },
};

const questions = [
  {
    question: "Czy faktura wystawiona w demo trafia do KSeF?",
    answer: "Nie. Demo działa w przeglądarce i pokazuje przykładową odpowiedź, numer oraz UPO. Nie rejestruje dokumentu w KSeF.",
  },
  {
    question: "Gdzie sprawdzę status wysyłki faktury?",
    answer: "Po zalogowaniu otwórz fakturę i sprawdź jej status. Dodatkowe informacje o integracji znajdziesz w Centrum KSeF.",
  },
  {
    question: "Co zrobić, gdy wysyłka do KSeF się nie powiedzie?",
    answer: "Sprawdź komunikat błędu i dane faktury. Nie zakładaj, że dokument został przyjęty, dopóki nie zobaczysz potwierdzenia w aplikacji. Gdy problem się powtarza, skontaktuj się z pomocą.",
  },
  {
    question: "Gdzie znajdę pełną instrukcję?",
    answer: "Po zalogowaniu wybierz „Instrukcja obsługi” w menu bocznym aplikacji.",
  },
];

export default function PublicHelpPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="FakturaProsto — strona główna"><Logo /></Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Strona główna</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight">Pomoc i kontakt</h1>
        <p className="mt-2 text-sm text-muted-foreground">Odpowiedzi na najczęstsze pytania. Rozwiń temat, który Cię interesuje.</p>
        <div className="mt-8 space-y-2">
          {questions.map(({ question, answer }) => (
            <details key={question} className="group rounded-xl border border-border/70 bg-card px-4 py-3">
              <summary className="cursor-pointer font-medium marker:text-primary focus-visible:outline-2 focus-visible:outline-primary">{question}</summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-border/70 bg-card p-4 text-sm">
          <h2 className="font-semibold">Potrzebujesz pomocy?</h2>
          <p className="mt-1 text-muted-foreground">Napisz na <a className="text-primary underline underline-offset-4" href={`mailto:${OPERATOR_CONFIG.emailSupport}`}>{OPERATOR_CONFIG.emailSupport}</a>. Przy zgłaszaniu błędu podaj jego treść i czas wystąpienia, bez haseł i poufnych danych z faktur.</p>
        </div>
      </main>
    </div>
  );
}
