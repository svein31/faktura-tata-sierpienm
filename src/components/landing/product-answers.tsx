import Link from "next/link";
import { JsonLd } from "@/components/seo/public-pages";
import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

const monthly = SUBSCRIPTION_PLANS.find(plan => plan.id === "monthly")!;
const yearly = SUBSCRIPTION_PLANS.find(plan => plan.id === "yearly")!;

export const PRODUCT_ANSWERS = [
  {
    question: "Jaki program do faktury wybrać na początek?",
    answer: "Sprawdź limit darmowego planu, wygodę formularza i możliwość współpracy z księgową. FakturaProsto to program do faktur online dla JDG, freelancerów i małych firm. Formularz przetestujesz na danych przykładowych w demo, a własne dokumenty zapiszesz po założeniu konta.",
    href: "/program-do-faktur", label: "Poznaj program do faktur",
  },
  {
    question: "Czy FakturaProsto to darmowy program do faktur?",
    answer: `Tak. Plan Free kosztuje 0 zł i obejmuje do 5 faktur miesięcznie. Pro kosztuje ${monthly.amountPln} zł brutto za miesiąc albo ${yearly.amountPln} zł brutto za rok. Pro jest subskrypcją z automatycznym odnowieniem; anulujesz ją w ustawieniach konta.`,
    href: "/cennik", label: "Sprawdź limity i ceny planów",
  },
  {
    question: "Czy mogę przetestować faktury online bez konta?",
    answer: "Tak. Demo działa bez logowania, rejestracji i podawania karty. Korzysta z przykładowych danych i służy do poznania formularza. Do zapisywania własnych faktur i pracy na danych swojej firmy potrzebujesz konta.",
    href: "/demo", label: "Otwórz demo bez logowania",
  },
  {
    question: "Czy program do faktur działa na telefonie?",
    answer: "Tak. FakturaProsto działa w przeglądarce na telefonie, tablecie i komputerze. Nie wymaga instalowania programu. Po zalogowaniu korzystasz z danych swojego konta, a układ formularzy dopasowuje się do ekranu.",
    href: "/program-do-faktur/na-telefonie", label: "Fakturowanie w przeglądarce telefonu",
  },
  {
    question: "Jak wystawiać faktury prosto, bez przepisywania danych firmy?",
    answer: "W formularzu wpisz NIP kontrahenta i pobierz dane z rejestrów MF/GUS. Uzupełnij pozycje, kwoty oraz daty, a przed zapisaniem sprawdź dane stron i podsumowanie. Pobranie danych z rejestru pomaga w wypełnieniu formularza, lecz nie zastępuje sprawdzenia dokumentu.",
    href: "/faktury/jak-wystawic", label: "Przejdź przez wystawienie pierwszej faktury",
  },
] as const;

export function ProductAnswers() {
  return (
    <section id="pytania" aria-labelledby="product-answers-title" className="scroll-mt-24 border-t border-border/60 py-12 sm:py-16">
      <JsonLd value={{
        "@context": "https://schema.org", "@type": "FAQPage",
        "@id": "https://fakturaprosto.pl/#pytania",
        url: "https://fakturaprosto.pl/#pytania", inLanguage: "pl-PL",
        isPartOf: { "@id": "https://fakturaprosto.pl/#website" },
        mainEntity: PRODUCT_ANSWERS.map(item => ({
          "@type": "Question", name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }} />
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 id="product-answers-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Program do faktur online — pytania i odpowiedzi</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">FakturaProsto pomaga wystawiać faktury online w przeglądarce. Przed założeniem konta poznaj limity, sposób pracy i darmowe demo.</p>
        <div className="mt-6 divide-y divide-border/60 rounded-xl border border-border/80 bg-card">
          {PRODUCT_ANSWERS.map(item => (
            <details key={item.question} className="group px-5 py-4 sm:px-6">
              <summary className="cursor-pointer rounded-sm py-1 text-sm font-semibold leading-relaxed marker:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-card sm:text-base">{item.question}</summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
              <Link prefetch={false} href={item.href} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{item.label} →</Link>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
