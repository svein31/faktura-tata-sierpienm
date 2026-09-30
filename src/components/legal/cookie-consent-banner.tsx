"use client";

import * as React from "react";
import Link from "next/link";
import { Cookie, Sliders, Lock } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { COOKIE_INVENTORY } from "@/lib/legal/config";

const CONSENT_COOKIE_NAME = "fakturo_consent";
const CONSENT_VERSION = "1.0.0-2026-09-13";

// Filtrowane listy cookies z płaskiej tablicy
const essentialCookies = COOKIE_INVENTORY.filter((c) => c.category === "essential");
const functionalCookies = COOKIE_INVENTORY.filter((c) => c.category === "functional");

export interface CookiePreferences {
  version: string;
  essential: true; // Zawsze true (art. 399 ust. 3 PKE)
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"));
  return match ? decodeURIComponent(match[3]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = "expires=" + date.toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax${secure}`;
}

export function CookieConsentBanner() {
  const [isVisible, setIsVisible] = React.useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = React.useState(false);

  // Stan wyborów w modalu (domyślnie opcjonalne są odznaczone - opt-in PKE)
  const [functionalConsent, setFunctionalConsent] = React.useState(false);
  const [analyticsConsent, setAnalyticsConsent] = React.useState(false);
  const [marketingConsent, setMarketingConsent] = React.useState(false);

  // Sprawdź czy zgoda już istnieje przy montowaniu
  React.useEffect(() => {
    const existing = getCookie(CONSENT_COOKIE_NAME);
    if (!existing) {
      setIsVisible(true);
    } else {
      try {
        const parsed: CookiePreferences = JSON.parse(existing);
        if (parsed.version !== CONSENT_VERSION) {
          setIsVisible(true);
        } else {
          setFunctionalConsent(!!parsed.functional);
          setAnalyticsConsent(!!parsed.analytics);
          setMarketingConsent(!!parsed.marketing);
        }
      } catch {
        setIsVisible(true);
      }
    }

    // Obsługa zdarzenia otwierania preferencji z linków w stopce lub panelu
    const handleOpenModal = () => {
      setShowPreferencesModal(true);
      setIsVisible(true);
    };

    window.addEventListener("open-cookie-preferences", handleOpenModal);
    return () => {
      window.removeEventListener("open-cookie-preferences", handleOpenModal);
    };
  }, []);

  const savePreferences = (prefs: {
    functional: boolean;
    analytics: boolean;
    marketing: boolean;
  }) => {
    const payload: CookiePreferences = {
      version: CONSENT_VERSION,
      essential: true,
      functional: prefs.functional,
      analytics: prefs.analytics,
      marketing: prefs.marketing,
      timestamp: new Date().toISOString(),
    };

    setCookie(CONSENT_COOKIE_NAME, JSON.stringify(payload), 365);
    setFunctionalConsent(prefs.functional);
    setAnalyticsConsent(prefs.analytics);
    setMarketingConsent(prefs.marketing);
    setIsVisible(false);
    setShowPreferencesModal(false);

    // Wyemituj zdarzenie dla innych komponentów serwisu
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fakturo-consent-updated", { detail: payload })
      );
    }
  };

  const handleAcceptAll = () => {
    savePreferences({ functional: true, analytics: true, marketing: true });
  };

  const handleRejectOptional = () => {
    savePreferences({ functional: false, analytics: false, marketing: false });
  };

  const handleSaveCustom = () => {
    savePreferences({
      functional: functionalConsent,
      analytics: analyticsConsent,
      marketing: marketingConsent,
    });
  };

  if (!isVisible && !showPreferencesModal) return null;

  return (
    <>
      {/* ── MODAL SZCZEGÓŁOWYCH PREFERENCJI ── */}
      <Dialog open={showPreferencesModal} onClose={() => setShowPreferencesModal(false)} title="Ustawienia prywatności i plików cookies" description="Zgodność z art. 399 Prawa komunikacji elektronicznej (PKE) i RODO" size="lg" footer={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRejectOptional}
                className="w-full sm:w-auto text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900"
              >
                Odrzuć wszystkie opcjonalne
              </Button>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveCustom}
                  className="w-full sm:w-auto text-xs"
                >
                  Zapisz wybrane preferencje
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAcceptAll}
                  className="w-full sm:w-auto text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Zaakceptuj wszystkie
                </Button>
              </div>
            </div>
      }>
            {/* Treść modalu */}
            <div className="min-w-0 space-y-5 break-words text-xs text-slate-600 dark:text-slate-300">
              <p className="leading-relaxed">
                Szanujemy Twoją prywatność. Serwis FakturaProsto stosuje wyłącznie technologie niezbędne do jego poprawnego działania (sesja, bezpieczeństwo, ochrona przed CSRF) oraz — za Twoją dobrowolną zgodą — technologie ułatwiające korzystanie z serwisu (np. zapamiętywanie wybranego motywu graficznego).
              </p>

              {/* Kategoria 1: Niezbędne (Zawsze aktywne) */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      1. Niezbędne i techniczne
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Zawsze aktywne
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 opacity-60 cursor-not-allowed"
                    aria-label="Ciasteczka niezbędne - zawsze aktywne"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Konieczne do korzystania z serwisu (utrzymanie sesji po zalogowaniu, ochrona przed atakami CSRF, balansowanie obciążenia). Zgodnie z art. 399 ust. 3 PKE nie wymagają one Twojej uprzedniej zgody.
                </p>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono pt-1">
                  Używane: {essentialCookies.map((c) => c.name).join(", ")}
                </div>
              </div>

              {/* Kategoria 2: Funkcjonalne (Opt-in) */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      2. Funkcjonalne i preferencje
                    </span>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      Opcjonalne
                    </span>
                  </div>
                  <label className="relative inline-flex min-h-11 shrink-0 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label="Cookies funkcjonalne"
                      checked={functionalConsent}
                      onChange={(e) => setFunctionalConsent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Umożliwiają zapamiętanie Twoich wyborów (np. ciemny/jasny motyw interfejsu, preferencje widoku tabel faktur). Bez tej zgody aplikacja działa w domyślnym trybie.
                </p>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono pt-1">
                  Używane: {functionalCookies.map((c) => c.name).join(", ")}
                </div>
              </div>

              {/* Kategoria 3: Analityczne — nieaktywna */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2 opacity-80">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      3. Analityczne i statystyczne
                    </span>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                      Aktualnie nieaktywne
                    </span>
                  </div>
                  <label className="relative inline-flex min-h-11 shrink-0 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label="Cookies analityczne"
                      checked={analyticsConsent}
                      onChange={(e) => setAnalyticsConsent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Serwis nie stosuje obecnie skryptów śledzących (brak Google Analytics). W przypadku wdrożenia analityki, zostanie aktywowana wyłącznie po wyrażeniu tej zgody.
                </p>
              </div>

              {/* Kategoria 4: Reklamowe — nieaktywna */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2 opacity-80">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      4. Reklamowe i profilujące
                    </span>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                      Aktualnie nieaktywne
                    </span>
                  </div>
                  <label className="relative inline-flex min-h-11 shrink-0 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label="Cookies reklamowe"
                      checked={marketingConsent}
                      onChange={(e) => setMarketingConsent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Serwis nie wyświetla zewnętrznych reklam ani nie przekazuje danych profilujących do sieci reklamowych.
                </p>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                Więcej informacji:{" "}
                <Link href="/polityka-cookies" target="_blank" className="text-blue-600 hover:underline font-semibold">Polityka cookies</Link>{" "}
                oraz{" "}
                <Link href="/polityka-prywatnosci" target="_blank" className="text-blue-600 hover:underline font-semibold">Polityka prywatności</Link>.
                {" "}Możesz zmienić te ustawienia w dowolnej chwili za pomocą linku w stopce serwisu lub w ustawieniach konta.
              </div>
            </div>

      </Dialog>

      {/* ── GŁÓWNY BANER COOKIES (Na dole ekranu) ── */}
      {isVisible && !showPreferencesModal && (
        <div
          role="region"
          aria-label="Powiadomienie o plikach cookies i prywatności"
          className="fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4 md:p-6 pointer-events-none animate-in slide-in-from-bottom-5 duration-300"
        >
          <div className="max-w-4xl mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl pointer-events-auto ring-1 ring-black/5">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
              
              {/* Opis tekstowy */}
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400">
                    <Cookie className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Szanujemy Twoją prywatność
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Używamy plików cookies niezbędnych do działania aplikacji (bezpieczeństwo, sesja). Opcjonalne technologie pomagają zapamiętać Twoje preferencje. Masz pełny wybór.
                </p>
                <div className="flex items-center gap-3 text-[11px] pt-0.5">
                  <Link href="/polityka-cookies" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Polityka cookies</Link>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <Link href="/polityka-prywatnosci" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Polityka prywatności</Link>
                </div>
              </div>

              {/* 3 RÓWNORZĘDNE PRZYCISKI (PKE/RODO) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreferencesModal(true)}
                  className="text-xs font-semibold px-3 py-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 order-3 sm:order-1"
                >
                  <Sliders className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                  Ustawienia
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRejectOptional}
                  className="text-xs font-semibold px-3 py-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 order-2"
                >
                  Odrzuć opcjonalne
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAcceptAll}
                  className="text-xs font-semibold px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm order-1 sm:order-3"
                >
                  Akceptuj wszystkie
                </Button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
