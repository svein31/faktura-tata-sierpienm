"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { COOKIE_INVENTORY } from "@/lib/legal/config";

const essentialCookies = COOKIE_INVENTORY.filter((cookie) => cookie.category === "essential");
const functionalCookies = COOKIE_INVENTORY.filter((cookie) => cookie.category === "functional");
const analyticsCookies = COOKIE_INVENTORY.filter((cookie) => cookie.category === "analytics");

interface CookiePreferencesDialogProps {
  functionalConsent: boolean;
  analyticsConsent: boolean;
  marketingConsent: boolean;
  setFunctionalConsent: (value: boolean) => void;
  setAnalyticsConsent: (value: boolean) => void;
  setMarketingConsent: (value: boolean) => void;
  handleRejectOptional: () => void;
  handleSaveCustom: () => void;
  handleAcceptAll: () => void;
  onClose: () => void;
}

export function CookiePreferencesDialog({ functionalConsent, analyticsConsent, marketingConsent,
  setFunctionalConsent, setAnalyticsConsent, setMarketingConsent, handleRejectOptional,
  handleSaveCustom, handleAcceptAll, onClose }: CookiePreferencesDialogProps) {
  return (
      <Dialog open hideOnPrint onClose={onClose} title="Ustawienia prywatności i plików cookies" description="Zgodność z art. 399 Prawa komunikacji elektronicznej (PKE) i RODO" size="lg" footer={
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
                Szanujemy Twoją prywatność. Serwis FakturaProsto stosuje technologie niezbędne do jego poprawnego działania (sesja, bezpieczeństwo, ochrona przed CSRF) oraz — za Twoją dobrowolną zgodą — opcjonalne preferencje, własny pomiar korzystania i Google Analytics 4 do statystyk publicznych stron.
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
                  <label className="relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label="Cookies funkcjonalne"
                      checked={functionalConsent}
                      onChange={(e) => setFunctionalConsent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Umożliwiają zapamiętanie Twoich wyborów (np. ciemny/jasny motyw interfejsu, preferencje widoku tabel faktur). Bez tej zgody aplikacja działa w domyślnym trybie.
                </p>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono pt-1">
                  Używane: {functionalCookies.map((c) => c.name).join(", ")}
                </div>
              </div>

              {/* Kategoria 3: Pomiar etapów — dobrowolna zgoda */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2 opacity-80">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      3. Analityczne i statystyczne
                    </span>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                      Opcjonalne
                    </span>
                  </div>
                  <label className="relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label="Cookies analityczne"
                      checked={analyticsConsent}
                      onChange={(e) => setAnalyticsConsent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Za Twoją zgodą uruchamiamy własny pomiar etapów korzystania i wydajności oraz Google Analytics 4 do odsłon publicznych stron i źródeł odwiedzin. Google nie otrzymuje odsłon panelu, logowania, rejestracji, konta ani danych faktur, kontrahentów, e-maili, NIP-ów i kwot. Publiczne adresy wysyłamy bez parametrów i fragmentów, a źródło odesłania ograniczamy do protokołu i domeny. Google Signals i funkcje reklamowe są wyłączone.
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Własny pomiar przechowujemy do 30 dni. Cookies GA4 mają czas życia do 30 dni bez automatycznego odnawiania; retencja danych w Google zależy od osobnego ustawienia usługi. Wycofanie zgody zatrzymuje kolejne zdarzenia i usuwa cookies GA4 z przeglądarki, ale nie usuwa historii już przesłanej do Google. Szczegóły znajdziesz w polityce prywatności.
                </p>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono pt-1">
                  Używane: {analyticsCookies.map((c) => c.name).join(", ")}
                </div>
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
                  <label className="relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label="Cookies reklamowe"
                      checked={marketingConsent}
                      onChange={(e) => setMarketingConsent(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Serwis nie wyświetla zewnętrznych reklam ani nie przekazuje danych profilujących do sieci reklamowych.
                </p>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                Więcej informacji:{" "}
                <Link prefetch={false} href="/polityka-cookies" target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">Polityka cookies</Link>{" "}
                oraz{" "}
                <Link prefetch={false} href="/polityka-prywatnosci" target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">Polityka prywatności</Link>.
                {" "}Możesz zmienić te ustawienia w dowolnej chwili za pomocą linku w stopce serwisu lub w ustawieniach konta.
              </div>
            </div>

      </Dialog>
  );
}
