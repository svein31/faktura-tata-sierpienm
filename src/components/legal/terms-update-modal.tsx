"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, Shield, CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session-context";
import { useToast } from "@/components/toast";
import { LEGAL_VERSIONS, EFFECTIVE_DATE } from "@/lib/legal/config";

/**
 * Modal wyświetlany po zalogowaniu, gdy termsAcceptedVersion użytkownika
 * nie odpowiada aktualnej wersji regulaminu (LEGAL_VERSIONS.terms).
 * 
 * Blokuje dalsze korzystanie z aplikacji do momentu akceptacji.
 */
export function TermsUpdateModal() {
  const { user, refresh } = useSession();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);

  // Sprawdź czy modal powinien się wyświetlić
  const needsAcceptance = React.useMemo(() => {
    if (!user) return false;
    const userVersion = user.termsAcceptedVersion;
    return !userVersion || userVersion !== LEGAL_VERSIONS.terms;
  }, [user]);

  const handleAccept = async () => {
    if (!accepted) return;
    setBusy(true);
    try {
      const res = await fetch("/api/user/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast("error", "Błąd", (data as Record<string, string>).error || "Nie udało się zapisać akceptacji.");
        setBusy(false);
        return;
      }

      toast("success", "Regulamin zaakceptowany", "Dziękujemy za zapoznanie się z warunkami.");
      
      // Odśwież sesję
      try { await refresh(); } catch { /* ignore */ }
      
      // Wymuszenie przeładowania strony by odświeżyć stan
      window.location.reload();
    } catch {
      toast("error", "Błąd połączenia", "Spróbuj ponownie za chwilę.");
      setBusy(false);
    }
  };

  if (!needsAcceptance) return null;

  return (
    <Dialog open={needsAcceptance} onClose={() => {}} dismissible={false} title="Aktualizacja Regulaminu serwisu" description={`Wersja ${LEGAL_VERSIONS.terms} — obowiązuje od ${EFFECTIVE_DATE}`} footer={<div className="w-full">        {/* Przycisk */}
        <div className="rounded-xl p-3 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800">
          <Button
            variant="primary"
            size="sm"
            onClick={handleAccept}
            loading={busy}
            disabled={!accepted || busy}
            className="w-full h-10 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!busy && <CheckCircle2 className="w-4 h-4" />}
            {busy ? "Zapisywanie…" : "Akceptuję zaktualizowany Regulamin"}
          </Button>
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            Akceptacja jest wymagana do kontynuowania korzystania z serwisu.
          </p>
        </div>
</div>}>
        {/* Treść */}
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <p className="leading-relaxed">
            Zaktualizowaliśmy Regulamin świadczenia usług drogą elektroniczną. Prosimy o zapoznanie się z nowym dokumentem przed kontynuowaniem korzystania z serwisu.
          </p>

          <div className="space-y-2">
            <Link prefetch={false}
              href="/regulamin"
              target="_blank"
              className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <FileText className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
                  Regulamin serwisu
                </span>
                <p className="text-[11px] text-slate-500">Otwórz w nowej karcie</p>
              </div>
            </Link>
            <Link prefetch={false}
              href="/polityka-prywatnosci"
              target="_blank"
              className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <Shield className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
                  Polityka prywatności
                </span>
                <p className="text-[11px] text-slate-500">Otwórz w nowej karcie</p>
              </div>
            </Link>
          </div>

          {/* Checkbox akceptacji */}
          <label className="flex items-start gap-2.5 cursor-pointer group pt-2">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/50 shrink-0"
            />
            <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
              Zapoznałem/am się z treścią zaktualizowanego{" "}
              <strong>Regulaminu serwisu</strong> i akceptuję jego postanowienia.
            </span>
          </label>
        </div>

    </Dialog>
  );
}
