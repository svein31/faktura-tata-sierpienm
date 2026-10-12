import { WorkspacePreview } from "@/components/landing/workspace-preview";
import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";
import { pageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileCode2,
  FileText,
  Lock,
  Play,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { CookiePreferencesButton } from "@/components/legal/cookie-preferences-button";
import { LandingHeaderActions, LandingPrimaryAction, LandingFooterActions } from "@/components/landing/auth-actions";
import { JsonLd } from "@/components/seo/public-pages";
import { publisherSchema, websiteSchema, softwareSchema } from "@/lib/seo/schema";

export const metadata = pageMetadata("/", "FakturaProsto — faktury online i KSeF", "Wystawiaj faktury online, sprawdź KSeF i wypróbuj darmowe demo.");

export default function LandingPage() {

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <JsonLd value={{ "@context": "https://schema.org", "@graph": [
        publisherSchema, websiteSchema, softwareSchema,
      ] }} />
      {/* ── NAWIGACJA GŁÓWNA ── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:h-16 sm:flex-nowrap sm:py-0 sm:px-6">
          <Logo className="w-full shrink-0 sm:w-auto" />

          <nav className="hidden xl:flex items-center gap-6 text-[13.5px] font-medium text-muted-foreground">
            <a href="#funkcje" className="focus-visible:text-foreground">
              Funkcje
            </a>
            <a href="#ksef" className="focus-visible:text-foreground">
              KSeF 2.0 & FA(3)
            </a>
            <Link prefetch={false} href="/cennik" className="focus-visible:text-foreground">Cennik</Link>
            <a href="#jak-dziala" className="focus-visible:text-foreground">
              Jak to działa
            </a>
            <Link prefetch={false} href="/demo" className="text-primary focus-visible:underline flex items-center gap-1">
              <span>Piaskownica Demo</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary border border-primary/20 font-semibold">
                Bez logowania
              </span>
            </Link>
            <Link prefetch={false} href="/program-do-faktur" className="focus-visible:text-foreground">Program do faktur</Link>
          </nav>

          <LandingHeaderActions />
        </div>
      </header>

      <main id="main-content">
      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden pt-6 pb-12 sm:pt-20 sm:pb-28">
        {/* Delikatne tło gradientowe Apple/Stripe */}
        <div className="pointer-events-none absolute -top-40 left-1/2 hidden h-[600px] w-[900px] sm:block -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -right-40 hidden h-[450px] w-[450px] sm:block rounded-full bg-emerald-500/6 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge zgodności */}
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-[12px] font-medium text-emerald-800 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span>Faktury FA(3) i integracja z KSeF 2.0</span>
            </div>

            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:mt-6 sm:text-5xl lg:text-6xl leading-[1.12]">Faktury VAT online z KSeF</h1>

            <p className="mt-4 text-base sm:mt-5 sm:text-lg leading-relaxed text-muted-foreground max-w-2xl mx-auto">
              Program dla JDG i małych firm. Wystawiaj faktury, pobieraj dane po NIP i współpracuj z księgową.
            </p>

            {/* CTA Buttons */}
            <div className="mt-6 flex flex-col sm:mt-8 sm:flex-row items-center justify-center gap-3">
              <LandingPrimaryAction />
              <Link
                prefetch={false}
                href="/demo"
                className="w-full sm:w-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border/80 bg-card/80 px-6 text-[14px] font-medium text-foreground hover:bg-muted/70 active:scale-95 transition-all shadow-sm"
              >
                <Play className="h-4 w-4 text-primary fill-primary" />
                <span>Wypróbuj Demo bez rejestracji</span>
              </Link>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Free: 5 faktur miesięcznie. Pro: 7 zł/miesiąc lub 59 zł/rok, brutto. <Link prefetch={false} href="/cennik" className="text-primary underline">Porównaj plany</Link>.</p>

            <a href="#funkcje" className="mt-4 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:hidden">Zobacz funkcje ↓</a>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Brak wymogu karty
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Środowisko Demo i Testowe
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Izolacja danych firmy
              </span>
            </div>
          </div>

          <WorkspacePreview />
          {/* ── WIZUALIZACJA INTERFEJSU (PRAWDZIWY PODGLĄD FAKTURO) ── */}
          <div className="mt-14 rounded-2xl border border-border/80 bg-card/90 p-4 sm:p-7 shadow-2xl sm:backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4 mb-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-foreground">FV/2026/09/0001</span>
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                      KSeF: Przyjęta (200 OK)
                    </span>
                  </div>
                  <p className="break-all text-xs text-muted-foreground">Numer KSeF: 5260301706-20260912-A1B2C3D4E5F6-11</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground rounded-lg border border-border px-2.5 py-1">
                  <QrCode className="h-3.5 w-3.5 text-foreground" />
                  <span>KOD I (KSeF)</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground rounded-lg border border-border px-2.5 py-1">
                  <FileCode2 className="h-3.5 w-3.5 text-foreground" />
                  <span>UPO pobrane</span>
                </span>
              </div>
            </div>

            <p className="mb-3 text-xs text-muted-foreground">Przykładowy dokument demonstracyjny. Widoczne dane i statusy są ilustracją.</p>
            {/* Dane kontrahentów */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-6 bg-muted/20 p-4 rounded-xl border border-border/50">
              <div>
                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Sprzedawca</p>
                <p className="mt-1 font-bold text-foreground text-sm">Przykładowa Firma Sp. z o.o.</p>
                <p className="text-muted-foreground">NIP: 5260301706 · ul. Przykładowa 10, 00-001 Warszawa</p>
                <p className="text-muted-foreground mt-0.5">Rachunek: 12 1050 0099 6711 1111 1111 1111</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Nabywca (Kontrahent)</p>
                <p className="mt-1 font-bold text-foreground text-sm">Przykładowy Kontrahent S.A.</p>
                <p className="text-muted-foreground">NIP: 5270000024 · ul. Biznesowa 25, 00-950 Warszawa</p>
                <p className="text-emerald-700 dark:text-emerald-400 mt-0.5 font-medium">Przykładowy status podatnika VAT</p>
              </div>
            </div>

            {/* Pozycje */}
            <p className="mb-1 text-[11px] text-muted-foreground sm:hidden">Przesuń tabelę w bok, aby zobaczyć wszystkie kolumny.</p>
            <div className="overflow-x-auto" role="region" aria-label="Pozycje przykładowej faktury" tabIndex={0}>
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 px-3">Lp.</th>
                    <th className="py-2 px-3">Nazwa towaru / usługi</th>
                    <th className="py-2 px-3">Ilość</th>
                    <th className="py-2 px-3">Cena netto</th>
                    <th className="py-2 px-3">Stawka VAT</th>
                    <th className="py-2 px-3 text-right">Wartość brutto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 text-foreground">
                  <tr>
                    <td className="py-2.5 px-3 font-mono text-muted-foreground">1</td>
                    <td className="py-2.5 px-3 font-medium">Usługi programistyczne i wdrożenie integracji KSeF 2.0</td>
                    <td className="py-2.5 px-3">1 szt.</td>
                    <td className="py-2.5 px-3">5 000,00 PLN</td>
                    <td className="py-2.5 px-3">23%</td>
                    <td className="py-2.5 px-3 text-right font-bold">6 150,00 PLN</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono text-muted-foreground">2</td>
                    <td className="py-2.5 px-3 font-medium">Konsultacje księgowo-techniczne i konfiguracja uprawnień</td>
                    <td className="py-2.5 px-3">2 godz.</td>
                    <td className="py-2.5 px-3">500,00 PLN</td>
                    <td className="py-2.5 px-3">23%</td>
                    <td className="py-2.5 px-3 text-right font-bold">1 230,00 PLN</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Podsumowanie */}
            <div className="mt-4 flex justify-end border-t border-border pt-4">
              <div className="w-full max-w-xs space-y-1.5 text-xs text-right">
                <div className="flex justify-between text-muted-foreground">
                  <span>Razem netto:</span>
                  <span className="font-semibold text-foreground">6 000,00 PLN</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>VAT 23%:</span>
                  <span className="font-semibold text-foreground">1 380,00 PLN</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-foreground border-t border-border/60 pt-1.5">
                  <span>Do zapłaty (brutto):</span>
                  <span className="text-primary text-base">7 380,00 PLN</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      <section id="cennik" aria-labelledby="pricing-title" className="scroll-mt-24 border-y bg-card/40 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6"><h2 id="pricing-title" className="text-center text-3xl font-bold tracking-tight">Zacznij bez opłat. Rozwijaj firmę z Pro.</h2><p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">Przejrzyste plany i jeden panel dla dokumentów, kosztów oraz współpracy z księgowością.</p><div className="mt-8 grid gap-5 md:grid-cols-3"><article className="flex flex-col rounded-2xl border bg-card p-6"><h3 className="font-semibold">Free</h3><p className="my-4 text-4xl font-bold">0 zł</p><p className="text-sm text-muted-foreground">Do 5 faktur miesięcznie. Poznaj aplikację we własnym tempie.</p><Link prefetch={false} href="/register" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold">Załóż darmowe konto</Link></article>{SUBSCRIPTION_PLANS.map(plan => <article key={plan.id} className="flex flex-col rounded-2xl border border-primary/30 bg-card p-6"><h3 className="font-semibold">Pro · {plan.period === "rok" ? "roczny" : "miesięczny"}</h3><p className="my-4 text-4xl font-bold">{plan.amountPln} zł<span className="ml-1 text-sm font-normal text-muted-foreground">/{plan.period}</span></p><p className="text-sm text-muted-foreground">Faktury bez limitu planu Free. Wspólne moduły aplikacji i więcej wystawionych dokumentów.</p><Link prefetch={false} href="/register" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Rozpocznij z Pro</Link></article>)}</div><p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">Pro jest subskrypcją z automatycznym odnowieniem. Anulowanie w ustawieniach konta. Integracje wymagają konfiguracji. Wszystkie ceny są brutto. <Link prefetch={false} className="underline" href="/cennik">Porównaj plany i okresy rozliczeń</Link>. Szczegóły w <Link prefetch={false} className="underline" href="/regulamin">regulaminie</Link>.</p></div>
      </section>
      {/* ── KLUCZOWE FUNKCJE ── */}
      <section id="funkcje" className="scroll-mt-24 border-t border-border/60 py-20 bg-muted/10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Wszystko, czego potrzebujesz do fakturowania
            </h2>
            <p className="mt-3 text-muted-foreground text-sm sm:text-base">
              Od pojedynczej faktury po zbiorczą komunikację z biurem rachunkowym i bramką KSeF.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div id="ksef" className="scroll-mt-28 rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:border-border transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Pełny cykl obsługi KSeF 2.0</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                7 czytelnych statusów: od szkicu, przez kolejkę i wysyłkę, po potwierdzenie kodem 200,
                numer KSeF i trwałe UPO XML.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:border-border transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-4">
                <Search className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Integracja z bazą GUS BIR 1.1</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Wpisz 10 cyfr NIP kontrahenta — nazwa, pełny adres rejestrowy, REGON oraz status
                podatnika VAT uzupełniają się automatycznie.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:border-border transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-4">
                <RefreshCw className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Korekty (KOR) i historia zmian</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Wystawianie korekt powiązanych z oryginałem. Zaakceptowana faktura KSeF pozostaje
                niezmienna, a Ty widzisz czytelny podgląd różnicowy.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:border-border transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 mb-4">
                <QrCode className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Tryby offline i kody QR (KOD I/II)</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Generowanie linków weryfikacyjnych i kodów QR zgodnie z normą CIRFMF. Wyraźne
                oznaczenie dokumentów oczekujących na dosłanie.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:border-border transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 mb-4">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Dostęp dla Księgowej i Eksporty</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Role właściciela i księgowej, podgląd dokumentów, zestawienia CSV i eksport JPK.
                Faktury zakupowe pozostają chronione przed edycją.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:border-border transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 mb-4">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Trwała kolejka serwerowa</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Wysyłka nie zależy od karty przeglądarki. Zadania są zapisywane w kolejce bazodanowej
                z zabezpieczeniem idempotencji i ponawianiem prób.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── JAK TO DZIAŁA W 3 KROKACH ── */}
      <section id="jak-dziala" className="scroll-mt-24 border-t border-border/60 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Jak rozpocząć pracę w 3 krokach
            </h2>
            <p className="mt-3 text-muted-foreground text-sm sm:text-base">
              Prosty, przejrzysty start bez skomplikowanych instalacji.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="relative rounded-2xl border border-border/80 bg-card p-7 shadow-sm">
              <span className="text-3xl font-extrabold text-primary/80 font-mono">01</span>
              <h3 className="mt-3 text-base font-bold text-foreground">Podaj NIP swojej firmy</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Zarejestruj konto i podaj numer NIP. System automatycznie pobierze dane z bazy REGON
                i przygotuje profil wystawcy.
              </p>
            </div>

            <div className="relative rounded-2xl border border-border/80 bg-card p-7 shadow-sm">
              <span className="text-3xl font-extrabold text-primary/80 font-mono">02</span>
              <h3 className="mt-3 text-base font-bold text-foreground">Wybierz środowisko KSeF</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Przetestuj wysyłkę w bezpiecznym symulatorze Demo lub na oficjalnej bramce testowej
                MF. Gdy będziesz gotowy, przełącz na produkcję.
              </p>
            </div>

            <div className="relative rounded-2xl border border-border/80 bg-card p-7 shadow-sm">
              <span className="text-3xl font-extrabold text-primary/80 font-mono">03</span>
              <h3 className="mt-3 text-base font-bold text-foreground">Wystawiaj i kontroluj stan</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Wystawiaj faktury, pobieraj UPO, rejestruj wpłaty i przekazuj gotowe zestawienia do
                swojego biura rachunkowego.
              </p>
            </div>
          </div>

          <div className="mt-14 text-center">
            <Link
                prefetch={false}
              href="/register"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-7 text-[13.5px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
            >
              <span>Zarejestruj się teraz</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight">Faktury, KSeF i VAT — znajdź odpowiedź</h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">Sprawdź dane faktury, oblicz kwoty i poznaj znaczenie statusów KSeF przed wysyłką dokumentu.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Jak wystawić fakturę krok po kroku", "/faktury/jak-wystawic"],
              ["Faktura bez VAT i podstawa zwolnienia", "/faktury/bez-vat"],
              ["KSeF dla jednoosobowej działalności", "/poradnik-ksef/jdg"],
              ["Netto, VAT i brutto — kalkulator", "/narzedzia/kalkulator-vat"],
              ["Stawki VAT na fakturze", "/vat"],
              ["Porównanie programów do faktur", "/porownania"],
            ].map(([label, href]) => <Link prefetch={false} key={href} href={href} className="rounded-xl border border-border bg-card p-4 text-sm font-medium hover:border-primary hover:text-primary">{label} →</Link>)}
          </div>
        </div>
      </section>

      </main>
      {/* ── STOPKA ── */}
      <footer className="border-t border-border/60 py-10 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Logo compact />
              <span>© {new Date().getFullYear()} FakturaProsto. Wszelkie prawa zastrzeżone.</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link prefetch={false} href="/pomoc" className="hover:text-foreground transition-colors">Pomoc i kontakt</Link>
              <Link prefetch={false} href="/program-do-faktur" className="hover:text-foreground transition-colors">Darmowy program do faktur</Link>
              <Link prefetch={false} href="/faktury" className="hover:text-foreground transition-colors">Poradniki o fakturach</Link>
              <Link prefetch={false} href="/poradnik-ksef" className="hover:text-foreground transition-colors">KSeF 2026</Link>
              <Link prefetch={false} href="/narzedzia" className="hover:text-foreground transition-colors">Kalkulatory</Link>
              <Link prefetch={false} href="/cennik" className="hover:text-foreground transition-colors">Cennik Free i Pro</Link>
              <Link prefetch={false} href="/demo" className="hover:text-foreground transition-colors">
                Piaskownica Demo
              </Link>
              <LandingFooterActions />
            </div>
          </div>
          {/* Linki prawne */}
          <div className="mt-6 pt-4 border-t border-border/40 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground dark:text-muted-foreground/80">
            <Link prefetch={false} href="/regulamin" className="hover:text-foreground transition-colors">Regulamin</Link>
            <Link prefetch={false} href="/polityka-prywatnosci" className="hover:text-foreground transition-colors">Polityka prywatności</Link>
            <Link prefetch={false} href="/polityka-cookies" className="hover:text-foreground transition-colors">Cookies</Link>
            <Link prefetch={false} href="/powierzenie-danych" className="hover:text-foreground transition-colors">DPA (art. 28)</Link>
            <Link prefetch={false} href="/podwykonawcy" className="hover:text-foreground transition-colors">Podwykonawcy</Link>
            <span className="text-border">|</span>
            <CookiePreferencesButton className="hover:text-foreground transition-colors cursor-pointer">
              Ustawienia prywatności
            </CookiePreferencesButton>
          </div>
        </div>
      </footer>
    </div>
  );
}
