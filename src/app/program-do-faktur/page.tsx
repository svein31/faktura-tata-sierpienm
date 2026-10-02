import { pageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { topicsFor } from "@/lib/seo/content";
import { TopicCards } from "@/components/seo/public-pages";
import { PublicShell, JsonLd } from "@/components/seo/public-pages";

export const metadata = pageMetadata("/program-do-faktur", "Darmowy program do faktur online — FakturaProsto", "Wystawiaj do 5 faktur miesięcznie w planie Free. Wypróbuj demo bez logowania, sprawdź przykłady faktur i poznaj zasady KSeF.");

export default function Page() {
  return <PublicShell><JsonLd value={{ "@context": "https://schema.org", "@type": "SoftwareApplication", "@id": "https://fakturaprosto.pl/#software", name: "FakturaProsto", operatingSystem: "Web", applicationCategory: "BusinessApplication", url: "https://fakturaprosto.pl/program-do-faktur", offers: [{ "@type": "Offer", price: "0", priceCurrency: "PLN", description: "Free: 5 faktur miesięcznie" }, { "@type": "Offer", price: "7", priceCurrency: "PLN", description: "Pro: 7 zł brutto za miesiąc" }, { "@type": "Offer", price: "59", priceCurrency: "PLN", description: "Pro: 59 zł brutto za rok" }] }} /><main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
    <p className="text-xs font-semibold uppercase tracking-widest text-primary">Fakturowanie online</p>
    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Darmowy program do faktur — do 5 faktur miesięcznie</h1>
    <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">Darmowy program do faktur FakturaProsto pozwala wystawiać do 5 faktur miesięcznie w planie Free. Jeśli potrzebujesz planu Pro, cena wynosi 7 zł brutto miesięcznie lub 59 zł brutto rocznie. Przed rejestracją możesz sprawdzić formularz w demo bez karty. Demo korzysta z danych przykładowych i nie wysyła rzeczywistych faktur do KSeF.</p>
    <div className="mt-7 flex flex-wrap gap-3"><Link href="/demo" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">Wypróbuj demo →</Link><Link href="/register" className="rounded-xl border border-border px-5 py-3 font-medium hover:border-primary">Załóż konto Free →</Link></div>
    <div className="mt-12 grid gap-4 sm:grid-cols-3">
      {[
        { title: "1. Przygotuj dane", text: "Wpisz dane sprzedawcy, nabywcy, opis sprzedaży i kwoty. Możesz sprawdzić przebieg w demo." },
        { title: "2. Sprawdź fakturę", text: "Zweryfikuj podgląd, stawki lub podstawę zwolnienia i kwotę do zapłaty przed zatwierdzeniem." },
        { title: "3. Kontroluj status", text: "Jeśli dokument trafia do KSeF, sprawdź wynik wysyłki i numer nadany przez system." },
      ].map(item => <section key={item.title} className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">{item.title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p></section>)}
    </div>
    <section className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6"><h2 className="text-xl font-semibold">Co oznacza „darmowy”?</h2><p className="mt-3 leading-relaxed text-muted-foreground">Konto Free ma limit 5 wystawionych faktur w miesiącu. Rejestracja pozwala zapisywać dokumenty na swoim koncie. Demo nie wymaga konta, ale jego przykładowych dokumentów nie traktuj jako rzeczywistych faktur.</p></section>
    <section className="mt-12 space-y-4"><h2 className="text-xl font-semibold">Obsługa KSeF i danych firmy</h2><p className="leading-relaxed text-muted-foreground">FakturaProsto przygotowuje XML FA(3), pokazuje etapy przetwarzania i pozwala pobrać dostępne UPO XML. Wysyłka korzysta z kolejki serwerowej, dlatego zamknięcie karty nie jest potwierdzeniem ani przerwaniem przyjęcia dokumentu. Dane firmy pobieramy z GUS BIR po NIP; status VAT sprawdza osobno rejestr Ministerstwa Finansów.</p><h2 className="text-xl font-semibold">Free czy Pro — który plan wybrać?</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Plan</th><th className="p-3">Cena brutto</th><th className="p-3">Zastosowanie</th></tr></thead><tbody><tr className="border-b"><td className="p-3">Free</td><td className="p-3">0 zł</td><td className="p-3">Do 5 faktur miesięcznie</td></tr><tr className="border-b"><td className="p-3">Pro miesięczny</td><td className="p-3">7 zł/mies.</td><td className="p-3">Więcej faktur, opłata miesięczna</td></tr><tr><td className="p-3">Pro roczny</td><td className="p-3">59 zł/rok</td><td className="p-3">Opłata za cały rok</td></tr></tbody></table></div><h2 className="text-xl font-semibold">Porównanie z bezpłatną aplikacją MF</h2><p className="leading-relaxed text-muted-foreground">Aplikacja Podatnika KSeF Ministerstwa Finansów jest bezpłatnym narzędziem do obsługi KSeF. FakturaProsto łączy fakturowanie z kosztami, płatnościami i współpracą zespołu. Przed wyborem sprawdź własny scenariusz: przygotowanie faktury, odbiór, korektę, uprawnienia księgowej i eksport dokumentów. Warunki oraz aktualne funkcje MF sprawdź w oficjalnej dokumentacji.</p><a href="https://ksef.podatki.gov.pl/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Oficjalny serwis KSeF MF ↗</a></section>
    <section className="mt-12"><h2 className="text-xl font-semibold">Rozwiąż konkretny problem</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">
      {[
        ["Jak wystawić pierwszą fakturę?", "/faktury/jak-wystawic"],
        ["Faktura bez VAT", "/faktury/bez-vat"],
        ["KSeF dla JDG", "/poradnik-ksef/jdg"],
        ["Próg 10 000 zł KSeF", "/narzedzia/limit-ksef"],
        ["Kalkulator VAT", "/narzedzia/kalkulator-vat"],
        ["Korekta faktury", "/faktury/korygujaca"],
      ].map(([label, url]) => <Link key={url} href={url} className="rounded-xl border border-border bg-card p-4 text-sm font-medium hover:border-primary hover:text-primary">{label} →</Link>)}
    </div></section>
  <section className="mt-10"><h2 className="mb-4 text-xl font-semibold">Program dopasowany do Twojej pracy</h2><TopicCards items={topicsFor("/program-do-faktur/")} /></section><p className="mt-6"><Link href="/porownania" className="text-primary underline">Porównaj programy i aplikację MF →</Link></p>
  </main></PublicShell>;
}
