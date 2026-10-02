import {WorkspacePreview} from "@/components/landing/workspace-preview";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
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
import { PUBLIC_ORIGIN } from "@/lib/seo/content";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { title: "FakturaProsto — faktury online i KSeF", description: "Wystawiaj faktury online, sprawdź KSeF i wypróbuj darmowe demo.", url: "/" },
  title: "FakturaProsto — faktury online i KSeF dla firm",
  description:
    "Wystawiaj do 5 faktur miesięcznie w planie Free. Wypróbuj demo bez rejestracji, poznaj KSeF i oblicz kwoty faktury w darmowych narzędziach.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function LandingPage() {

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <JsonLd value={{ "@context": "https://schema.org", "@graph": [
        { "@type": "Organization", "@id": `${PUBLIC_ORIGIN}/#organization`, name: "FakturaProsto", url: PUBLIC_ORIGIN },
        { "@type": "WebSite", "@id": `${PUBLIC_ORIGIN}/#website`, name: "FakturaProsto", url: PUBLIC_ORIGIN, inLanguage: "pl-PL", publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` } },
        { "@type": "SoftwareApplication", "@id": `${PUBLIC_ORIGIN}/#software`, name: "FakturaProsto", url: PUBLIC_ORIGIN, description: "Program do wystawiania faktur online. Plan Free obejmuje do 5 faktur miesięcznie.", applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "pl-PL", publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` }, offers: { "@type": "Offer", price: "0", priceCurrency: "PLN", description: "Plan Free: do 5 faktur miesięcznie", url: `${PUBLIC_ORIGIN}/register` } },
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
            <a href="#jak-dziala" className="focus-visible:text-foreground">
              Jak to działa
            </a>
            <Link href="/demo" className="text-primary focus-visible:underline flex items-center gap-1">
              <span>Piaskownica Demo</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary border border-primary/20 font-semibold">
                Bez logowania
              </span>
            </Link>
            <Link href="/program-do-faktur" className="focus-visible:text-foreground">Program do faktur</Link>
          </nav>

          <LandingHeaderActions />
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        {/* Delikatne tło gradientowe Apple/Stripe */}
        <div className="pointer-events-none absolute -top-40 left-1/2 hidden h-[600px] w-[900px] sm:block -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -right-40 hidden h-[450px] w-[450px] sm:block rounded-full bg-emerald-500/6 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge zgodności */}
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span>Faktury FA(3) i integracja z KSeF 2.0</span>
            </div>

            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl leading-[1.12]">
              Niezawodne fakturowanie VAT i bezpośrednia integracja z KSeF
            </h1>

            <p className="mt-5 text-base sm:text-lg leading-relaxed text-muted-foreground max-w-2xl mx-auto">
              Zaprojektowany dla polskich przedsiębiorców i biur rachunkowych. Wystawiaj faktury
              zgodne ze schematem FA(3), pobieraj dane z GUS po NIP w sekundę i odbieraj urzędowe
              poświadczenia odbioru (UPO).
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <LandingPrimaryAction />
              <Link
                href="/demo"
                className="w-full sm:w-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border/80 bg-card/80 px-6 text-[14px] font-medium text-foreground hover:bg-muted/70 active:scale-95 transition-all shadow-sm"
              >
                <Play className="h-4 w-4 text-primary fill-primary" />
                <span>Wypróbuj Demo bez rejestracji</span>
              </Link>
            </div>

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

          <WorkspacePreview/>
        </div>
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
              <span className="text-3xl font-extrabold text-primary/40 font-mono">01</span>
              <h3 className="mt-3 text-base font-bold text-foreground">Podaj NIP swojej firmy</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Zarejestruj konto i podaj numer NIP. System automatycznie pobierze dane z bazy REGON
                i przygotuje profil wystawcy.
              </p>
            </div>

            <div className="relative rounded-2xl border border-border/80 bg-card p-7 shadow-sm">
              <span className="text-3xl font-extrabold text-primary/40 font-mono">02</span>
              <h3 className="mt-3 text-base font-bold text-foreground">Wybierz środowisko KSeF</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Przetestuj wysyłkę w bezpiecznym symulatorze Demo lub na oficjalnej bramce testowej
                MF. Gdy będziesz gotowy, przełącz na produkcję.
              </p>
            </div>

            <div className="relative rounded-2xl border border-border/80 bg-card p-7 shadow-sm">
              <span className="text-3xl font-extrabold text-primary/40 font-mono">03</span>
              <h3 className="mt-3 text-base font-bold text-foreground">Wystawiaj i kontroluj stan</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Wystawiaj faktury, pobieraj UPO, rejestruj wpłaty i przekazuj gotowe zestawienia do
                swojego biura rachunkowego.
              </p>
            </div>
          </div>

          <div className="mt-14 text-center">
            <Link
              href="/register"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-7 text-[13.5px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
            >
              <span>Zarejestruj się teraz</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── STOPKA ── */}
      <footer className="border-t border-border/60 py-10 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Logo compact />
              <span>© {new Date().getFullYear()} FakturaProsto. Wszelkie prawa zastrzeżone.</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/pomoc" className="hover:text-foreground transition-colors">Pomoc i kontakt</Link>
              <Link href="/program-do-faktur" className="hover:text-foreground transition-colors">Darmowy program do faktur</Link>
              <Link href="/faktury" className="hover:text-foreground transition-colors">Poradniki o fakturach</Link>
              <Link href="/poradnik-ksef" className="hover:text-foreground transition-colors">KSeF 2026</Link>
              <Link href="/narzedzia" className="hover:text-foreground transition-colors">Kalkulatory</Link>
              <Link href="/demo" className="hover:text-foreground transition-colors">
                Piaskownica Demo
              </Link>
              <LandingFooterActions />
            </div>
          </div>
          {/* Linki prawne */}
          <div className="mt-6 pt-4 border-t border-border/40 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground/80">
            <Link href="/regulamin" className="hover:text-foreground transition-colors">Regulamin</Link>
            <Link href="/polityka-prywatnosci" className="hover:text-foreground transition-colors">Polityka prywatności</Link>
            <Link href="/polityka-cookies" className="hover:text-foreground transition-colors">Cookies</Link>
            <Link href="/powierzenie-danych" className="hover:text-foreground transition-colors">DPA (art. 28)</Link>
            <Link href="/podwykonawcy" className="hover:text-foreground transition-colors">Podwykonawcy</Link>
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
