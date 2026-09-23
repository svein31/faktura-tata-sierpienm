import type { Metadata } from "next";
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
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { title: "FakturaProsto — Faktury VAT i KSeF", description: "Faktury VAT, demonstracja działania i integracja z KSeF.", url: "/" },
  title: "FakturaProsto — Nowoczesne Faktury VAT i KSeF 2.0 dla Polskich Firm",
  description:
    "Platforma do wystawiania polskich faktur VAT w schemacie FA(3), pobierania danych z GUS i obsługi dokumentów KSeF.",
  robots: {
    index: true,
    follow: true,
  },
};

export default async function LandingPage() {
  const user = await getSessionUser();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* ── NAWIGACJA GŁÓWNA ── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-[13.5px] font-medium text-muted-foreground">
            <a href="#funkcje" className="hover:text-foreground transition-colors">
              Funkcje
            </a>
            <a href="#ksef" className="hover:text-foreground transition-colors">
              KSeF 2.0 & FA(3)
            </a>
            <a href="#jak-dziala" className="hover:text-foreground transition-colors">
              Jak to działa
            </a>
            <Link href="/demo" className="text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              <span>Piaskownica Demo</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary border border-primary/20 font-semibold">
                Bez logowania
              </span>
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all gap-1.5"
              >
                <span>Przejdź do aplikacji</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center justify-center rounded-xl px-3.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  Zaloguj się
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
                >
                  Załóż konto
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        {/* Delikatne tło gradientowe Apple/Stripe */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -right-40 h-[450px] w-[450px] rounded-full bg-emerald-500/6 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge zgodności */}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
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
              {user ? (
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-[14px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <span>Przejdź do aplikacji</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  href="/register"
                  className="w-full sm:w-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-[14px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all"
                >
                  <span>Rozpocznij bezpłatnie</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <Link
                href="/demo"
                className="w-full sm:w-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border/80 bg-card/80 px-6 text-[14px] font-medium text-foreground hover:bg-muted/70 active:scale-95 transition-all shadow-sm"
              >
                <Play className="h-4 w-4 text-primary fill-primary" />
                <span>Wypróbuj Demo bez rejestracji</span>
              </Link>
            </div>

            <a href="#funkcje" className="mt-4 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:hidden">Zobacz funkcje ↓</a>
            <div className="mt-5 flex items-center justify-center gap-6 text-[12px] text-muted-foreground">
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

          {/* ── WIZUALIZACJA INTERFEJSU (PRAWDZIWY PODGLĄD FAKTURO) ── */}
          <div className="mt-14 rounded-2xl border border-border/80 bg-card/90 p-4 sm:p-7 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-foreground">FV/2026/09/0001</span>
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                      KSeF: Przyjęta (200 OK)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Numer KSeF: 5260301706-20260912-A1B2C3D4E5F6-11</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
                <p className="text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">Przykładowy status podatnika VAT</p>
              </div>
            </div>

            {/* Pozycje */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
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

      {/* ── KLUCZOWE FUNKCJE ── */}
      <section id="funkcje" className="border-t border-border/60 py-20 bg-muted/10">
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
            <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm hover:border-border transition-colors">
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
      <section id="jak-dziala" className="border-t border-border/60 py-20">
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
              <Link href="/demo" className="hover:text-foreground transition-colors">
                Piaskownica Demo
              </Link>
              {user ? (
                <Link href="/dashboard" className="hover:text-foreground transition-colors font-medium text-primary">
                  Panel główny
                </Link>
              ) : (
                <>
                  <Link href="/login" className="hover:text-foreground transition-colors">
                    Logowanie
                  </Link>
                  <Link href="/register" className="hover:text-foreground transition-colors">
                    Rejestracja
                  </Link>
                </>
              )}
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
