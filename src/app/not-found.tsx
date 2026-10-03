import Link from "next/link";
import { PublicShell } from "@/components/seo/public-pages";

export default function NotFound() {
  return <PublicShell>
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-sm font-semibold text-primary">Błąd 404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Nie znaleźliśmy tej strony</h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">Sprawdź adres lub wybierz jeden z dostępnych tematów FakturaProsto.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/" className="rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground">Strona główna</Link>
        <Link href="/poradnik-ksef" className="rounded-xl border border-border px-5 py-3">Poradnik KSeF</Link>
        <Link href="/pomoc" className="rounded-xl border border-border px-5 py-3">Pomoc i kontakt</Link>
      </div>
    </main>
  </PublicShell>;
}
