import { pageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { JsonLd, PublicShell } from "@/components/seo/public-pages";
import { OPERATOR_CONFIG } from "@/lib/legal/config";

export const metadata = pageMetadata("/pomoc", "Pomoc i kontakt", "Krótka pomoc dotycząca faktur, demonstracji i statusu dokumentów KSeF.");

const questions = [
  {
    question: "Czy FakturaProsto jest darmowe?",
    answer: "FakturaProsto Free kosztuje 0 zł i pozwala wystawić do 5 faktur miesięcznie. Pro kosztuje 7 zł brutto za miesiąc lub 59 zł brutto za cały rok. Pro odnawia się automatycznie; odnowienie można anulować w ustawieniach konta.",
    href: "/cennik",
    label: "Cennik i okresy rozliczenia",
  },
  {
    question: "Czy faktura wystawiona w demo trafia do KSeF?",
    answer: "Nie. Demo działa w przeglądarce i pokazuje przykładową odpowiedź, numer oraz UPO. Nie rejestruje dokumentu w KSeF.",
    href: "/demo",
    label: "Wypróbuj demo bez rejestracji",
  },
  {
    question: "Gdzie sprawdzę status wysyłki faktury?",
    answer: "Po zalogowaniu otwórz fakturę i sprawdź jej status. Dodatkowe informacje o integracji znajdziesz w Centrum KSeF.",
    href: "/poradnik-ksef/upo",
    label: "Numer KSeF i potwierdzenie UPO",
  },
  {
    question: "Co zrobić, gdy wysyłka do KSeF się nie powiedzie?",
    answer: "Najpierw ustal, czy KSeF odrzucił dokument, czy wynik wysyłki jest nieznany. Przy nieznanym wyniku sprawdź status przed ponowieniem, aby uniknąć duplikatu. Przy odrzuceniu popraw dane zgodnie z komunikatem. Gdy problem się powtarza, skontaktuj się z pomocą FakturaProsto.",
    href: "/poradnik-ksef/odrzucona-faktura",
    label: "Odrzucenie i nieznany wynik wysyłki",
  },
  {
    question: "Czy można edytować fakturę przyjętą przez KSeF?",
    answer: "Faktury przyjętej przez KSeF nie można zmienić ani usunąć z systemu. Błędy poprawia wystawca za pomocą faktury korygującej powiązanej z dokumentem pierwotnym. Szkic i odrzucona wysyłka to inne stany dokumentu.",
    href: "/faktury/korygujaca",
    label: "Jak poprawić fakturę korygującą",
  },
  {
    question: "Czy zwolnienie z VAT zwalnia z KSeF?",
    answer: "Samo zwolnienie z VAT nie wyłącza automatycznie obowiązku KSeF. Znaczenie mają podatnik, rodzaj transakcji i ustawowe wyjątki. Dla JDG sprawdź osobno zasady wystawiania i odbioru faktur.",
    href: "/poradnik-ksef/jdg",
    label: "Obowiązki KSeF dla JDG",
  },
  {
    question: "Jak obliczyć netto, VAT i brutto?",
    answer: "Najpierw potwierdź właściwą stawkę dla swojej transakcji. Dla 100 zł netto i stawki 23% podatek wynosi 23 zł, a kwota brutto 123 zł. Kalkulator FakturaProsto oblicza kwoty; nie rozstrzyga, jaka stawka jest prawidłowa.",
    href: "/narzedzia/kalkulator-vat",
    label: "Kalkulator netto, VAT i brutto",
  },
  {
    question: "Gdzie znajdę pełną instrukcję?",
    answer: "Po zalogowaniu wybierz „Instrukcja obsługi” w menu bocznym aplikacji.",
    href: "/faktury/jak-wystawic",
    label: "Publiczna instrukcja wystawienia faktury",
  },
];

export default function PublicHelpPage() {
  return (
    <PublicShell>
      <JsonLd value={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: questions.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight">Pomoc FakturaProsto: faktury i KSeF</h1>
        <p className="mt-2 text-sm text-muted-foreground">Odpowiedzi na najczęstsze pytania. Rozwiń temat, który Cię interesuje.</p>
        <div className="mt-8 space-y-2">
          {questions.map(({ question, answer, href, label }) => (
            <details key={question} className="group rounded-xl border border-border/70 bg-card px-4 py-3">
              <summary className="cursor-pointer font-medium marker:text-primary focus-visible:outline-2 focus-visible:outline-primary">{question}</summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{answer}</p>
              <Link prefetch={false} className="mt-3 inline-block text-sm text-primary underline" href={href}>{label} →</Link>
            </details>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-border/70 bg-card p-4 text-sm">
          <h2 className="font-semibold">Potrzebujesz pomocy?</h2>
          <p className="mt-1 text-muted-foreground">Napisz na <a className="text-primary underline underline-offset-4" href={`mailto:${OPERATOR_CONFIG.emailSupport}`}>{OPERATOR_CONFIG.emailSupport}</a>. Przy zgłaszaniu błędu podaj jego treść i czas wystąpienia, bez haseł i poufnych danych z faktur.</p>
        </div>
      </main>
    </PublicShell>
  );
}
