"use client";

import * as React from "react";
import Link from "next/link";
import { Cookie, Sliders } from "lucide-react";
import dynamic from "next/dynamic";
// Inventory, focus trapping and dialog animations load only when preferences open.
const CookiePreferencesDialog = dynamic(
  () => import("./cookie-preferences-dialog").then((module) => module.CookiePreferencesDialog),
  { ssr: false, loading: () => <p role="status" className="fixed inset-x-4 bottom-4 z-50 rounded-xl border bg-card p-4 text-sm shadow-lg">Otwieranie ustawień prywatności…</p> }
);

const CONSENT_COOKIE_NAME = "fakturo_consent";
const CONSENT_VERSION = "1.1.0-2026-10-08";

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
      {showPreferencesModal && <CookiePreferencesDialog
        functionalConsent={functionalConsent}
        analyticsConsent={analyticsConsent}
        marketingConsent={marketingConsent}
        setFunctionalConsent={setFunctionalConsent}
        setAnalyticsConsent={setAnalyticsConsent}
        setMarketingConsent={setMarketingConsent}
        handleRejectOptional={handleRejectOptional}
        handleSaveCustom={handleSaveCustom}
        handleAcceptAll={handleAcceptAll}
        onClose={() => setShowPreferencesModal(false)}
      />}

      {/* ── GŁÓWNY BANER COOKIES (Na dole ekranu) ── */}
      {isVisible && !showPreferencesModal && (
        <div
          role="region"
          aria-label="Powiadomienie o plikach cookies i prywatności"
          className="fixed bottom-0 inset-x-0 z-40 p-2 sm:p-4 md:p-6 pointer-events-none animate-in slide-in-from-bottom-5 duration-300"
        >
          <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-6 shadow-lg pointer-events-auto ring-1 ring-black/5">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-6">
              
              {/* Opis tekstowy */}
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400">
                    <Cookie className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Szanujemy Twoją prywatność
                  </h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Cookies niezbędne zapewniają działanie serwisu. Za Twoją zgodą zapisujemy preferencje i mierzymy etapy korzystania z aplikacji.
                </p>
                <div className="flex items-center gap-3 text-[11px] pt-0.5">
                  <Link prefetch={false} href="/polityka-cookies" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Polityka cookies</Link>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <Link prefetch={false} href="/polityka-prywatnosci" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Polityka prywatności</Link>
                </div>
              </div>

              {/* 3 RÓWNORZĘDNE PRZYCISKI (PKE/RODO) */}
              <div className="grid grid-cols-3 gap-2 w-full md:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPreferencesModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-11 text-xs font-semibold px-2 py-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 order-3 md:order-1"
                >
                  <Sliders className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                  Ustawienia
                </button>

                <button
                  type="button"
                  onClick={handleRejectOptional}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-11 text-xs font-semibold px-2 py-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 order-2"
                >
                  Odrzuć opcjonalne
                </button>

                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-11 text-xs font-semibold px-2 py-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm order-1 md:order-3"
                >
                  Akceptuj wszystkie
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
