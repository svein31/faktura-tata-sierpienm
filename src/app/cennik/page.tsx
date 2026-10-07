import Link from "next/link";
import { PublicShell, JsonLd } from "@/components/seo/public-pages";
import { pageMetadata } from "@/lib/seo/metadata";
import { softwareSchema } from "@/lib/seo/schema";
import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

export const metadata = pageMetadata("/cennik");

export default function PricingPage() {
  return <PublicShell>
    <JsonLd value={{ "@context": "https://schema.org", ...softwareSchema }} />
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Cennik FakturaProsto — Free i Pro</h1>
      <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">Free kosztuje 0 zł i obejmuje do 5 faktur miesięcznie. Pro kosztuje 7 zł brutto za miesiąc albo 59 zł brutto za rok. Plan roczny jest opłacany za cały rok; równowartość miesięczna to około 4,92 zł.</p>
      <section aria-label="Porównanie cen planów" className="mt-8 grid gap-5 md:grid-cols-3">
        <article id="free" className="scroll-mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">Free</h2>
          <p className="my-4 text-3xl font-bold">0 zł</p>
          <p className="text-sm leading-relaxed text-muted-foreground">Do 5 faktur miesięcznie. Konto pozwala zapisywać dokumenty swojej firmy.</p>
          <Link href="/register" className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold">Załóż konto Free</Link>
        </article>
        {SUBSCRIPTION_PLANS.map(plan => <article key={plan.id} id={plan.id} className="scroll-mt-8 rounded-2xl border border-primary/30 bg-card p-6">
          <h2 className="text-xl font-semibold">Pro {plan.id === "yearly" ? "roczny" : "miesięczny"}</h2>
          <p className="my-4 text-3xl font-bold">{plan.amountPln} zł <span className="text-sm font-normal">brutto / {plan.period}</span></p>
          <p className="text-sm leading-relaxed text-muted-foreground">Faktury bez limitu planu Free. {plan.id === "yearly" ? "Jedna opłata za cały rok: 59 zł. W porównaniu z 12 opłatami po 7 zł oszczędzasz 25 zł." : "Opłata za każdy miesiąc subskrypcji: 7 zł."}</p>
          <Link href="/register" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Załóż konto i wybierz Pro</Link>
        </article>)}
      </section>
      <section aria-labelledby="plan-features-title" className="mt-10">
        <h2 id="plan-features-title" className="text-xl font-semibold">Co otrzymujesz w Free i Pro?</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">Oba plany udostępniają te same moduły aplikacji. Pro znosi limit wystawianych faktur sprzedaży z planu Free. Plan miesięczny i roczny Pro różnią się okresem rozliczenia.</p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Porównanie zakresu planów FakturaProsto</caption>
            <thead className="bg-muted/50"><tr><th scope="col" className="p-3 font-semibold">Funkcja</th><th scope="col" className="p-3 font-semibold">Free</th><th scope="col" className="p-3 font-semibold">Pro</th></tr></thead>
            <tbody className="divide-y divide-border">
              {[
                ["Faktury sprzedaży", "Do 5 miesięcznie", "Bez limitu Free"],
                ["Szablony i pobieranie PDF", "Dostępne", "Dostępne"],
                ["Wysyłka i odbiór KSeF", "Po konfiguracji", "Po konfiguracji"],
                ["Dane kontrahenta po NIP", "Dostępne", "Dostępne"],
                ["Zespół i dostęp księgowej", "Dostępne", "Dostępne"],
                ["Koszty i eksporty", "Dostępne", "Dostępne"],
              ].map(([feature, free, pro]) => <tr key={feature}><th scope="row" className="p-3 font-medium">{feature}</th><td className="p-3 text-muted-foreground">{free}</td><td className="p-3 text-muted-foreground">{pro}</td></tr>)}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Limit Free obejmuje łącznie faktury sprzedaży firm przypisanych do konta w miesiącu kalendarzowym; szkice i proformy nie zużywają limitu. KSeF wymaga uprawnień wystawcy. Usługi zewnętrzne i operacje na dużych paczkach dokumentów mają własne ograniczenia, niezależne od planu.</p>
      </section>
      <section className="mt-10 space-y-6">
        <div><h2 className="text-xl font-semibold">Czy subskrypcja odnawia się automatycznie?</h2><p className="mt-3 leading-relaxed text-muted-foreground">Tak. Pro odnawia się automatycznie w wybranym okresie rozliczeniowym. Możesz anulować odnowienie w ustawieniach konta. Warunki świadczenia usług i rozliczeń znajdziesz w <Link className="text-primary underline" href="/regulamin">regulaminie FakturaProsto</Link>.</p></div>
        <div><h2 className="text-xl font-semibold">Czym różni się demo od konta Free?</h2><p className="mt-3 leading-relaxed text-muted-foreground">Demo działa bez rejestracji i karty, na przykładowych danych. Nie wysyła rzeczywistych faktur do KSeF. Konto Free pozwala pracować z dokumentami swojej firmy. Integracja z KSeF wymaga konfiguracji i odpowiednich uprawnień.</p><Link href="/demo" className="mt-3 inline-block text-primary underline">Sprawdź formularz faktury w demo</Link></div>
        <div><h2 className="text-xl font-semibold">Który plan wybrać?</h2><p className="mt-3 leading-relaxed text-muted-foreground">Jeśli wystawiasz najwyżej 5 faktur w miesiącu, zacznij od Free. Przy większej liczbie dokumentów porównaj Pro miesięczny i roczny. Przed zakupem sprawdź <Link className="text-primary underline" href="/program-do-faktur">opis programu i obsługę KSeF</Link> oraz <Link className="text-primary underline" href="/porownania">kryteria wyboru programu do faktur</Link>.</p></div>
      </section>
    </main>
  </PublicShell>;
}
