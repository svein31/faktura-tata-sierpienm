import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/seo/public-pages";

export const metadata: Metadata = {
  title: "Darmowy program do faktur online — FakturaProsto",
  description: "Wystawiaj do 5 faktur miesięcznie w planie Free. Wypróbuj demo bez logowania, sprawdź przykłady faktur i poznaj zasady KSeF.",
  alternates: { canonical: "/program-do-faktur" },
  openGraph: { title: "Darmowy program do faktur online — FakturaProsto", description: "Do 5 faktur miesięcznie w planie Free. Zobacz demo bez rejestracji.", url: "/program-do-faktur" },
};

export default function Page() {
  return <PublicShell><main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
    <p className="text-xs font-semibold uppercase tracking-widest text-primary">Fakturowanie online</p>
    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Darmowy program do faktur online</h1>
    <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">W planie Free wystawisz do 5 faktur miesięcznie. W demo bez rejestracji zobaczysz, jak działa formularz i podgląd dokumentu. Demo jest symulacją i nie przekazuje danych do produkcyjnego KSeF.</p>
    <div className="mt-7 flex flex-wrap gap-3"><Link href="/demo" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">Wypróbuj demo →</Link><Link href="/register" className="rounded-xl border border-border px-5 py-3 font-medium hover:border-primary">Załóż konto Free →</Link></div>
    <div className="mt-12 grid gap-4 sm:grid-cols-3">
      {[
        { title: "1. Przygotuj dane", text: "Wpisz dane sprzedawcy, nabywcy, opis sprzedaży i kwoty. Możesz sprawdzić przebieg w demo." },
        { title: "2. Sprawdź fakturę", text: "Zweryfikuj podgląd, stawki lub podstawę zwolnienia i kwotę do zapłaty przed zatwierdzeniem." },
        { title: "3. Kontroluj status", text: "Jeśli dokument trafia do KSeF, sprawdź wynik wysyłki i numer nadany przez system." },
      ].map(item => <section key={item.title} className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">{item.title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p></section>)}
    </div>
    <section className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6"><h2 className="text-xl font-semibold">Co oznacza „darmowy”?</h2><p className="mt-3 leading-relaxed text-muted-foreground">Konto Free ma limit 5 wystawionych faktur w miesiącu. Rejestracja pozwala zapisywać dokumenty na swoim koncie. Demo nie wymaga konta, ale jego przykładowych dokumentów nie traktuj jako rzeczywistych faktur.</p></section>
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
  </main></PublicShell>;
}
