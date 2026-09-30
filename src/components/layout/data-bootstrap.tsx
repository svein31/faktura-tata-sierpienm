"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Skeleton, StatsSkeleton } from "@/components/ui/skeleton";

/**
 * Jednorazowy bootstrap danych zalogowanego użytkownika (GET /api/data).
 * Renderuje elegancki Apple-style skeleton do czasu zakończenia; przy 401
 * (wygasła sesja) kieruje na /login.
 *
 * Po udanym boostrapie rewaliduje dane w tle przy powrocie na stronę
 * (visibilitychange) — SWR-style, bez pokazywania loadera.
 */
export function DataBootstrap({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Ekrany korzystające z własnych zapytań dostają tylko katalogi, bez wszystkich faktur.
  const fullInvoicePaths = new Set(["/invoices/new", "/invoices/recurring", "/advances", "/recurring", "/reminders", "/finances", "/calendar", "/settings/companies"]);
  const mode = fullInvoicePaths.has(pathname) || (/^\/invoices\/[^/]+$/.test(pathname) && pathname !== "/invoices/new") ? "full" : "list";
  const dataMode = useAppStore(s => s.dataMode);
  const hydrated = useAppStore((s) => s.hydrated);
  const authError = useAppStore((s) => s.authError);

  const [error, setError] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setError(false);
    const boot = async (automaticRetry: boolean) => {
      if (useAppStore.getState().hydrated && useAppStore.getState().dataMode === mode) return;
      try {
        await useAppStore.getState().bootstrap(mode);
      } catch {
        if (cancelled) return;
        if (automaticRetry) retry = setTimeout(() => void boot(false), 2000);
        else setError(true);
      }
    };
    void boot(true);
    return () => { cancelled = true; clearTimeout(retry); };
  }, [attempt, mode]);

  // SWR-style: cicha rewalidacja w tle przy powrocie na stronę
  React.useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && useAppStore.getState().dataMode === mode) {
        void useAppStore.getState().revalidate();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [mode]);

  React.useEffect(() => {
    if (authError) {
      const url = new URL("/login", window.location.href);
      url.searchParams.set("expired", "1");
      router.replace(url.toString());
    }
  }, [authError, router]);

  if ((!hydrated || dataMode !== mode) && error) return (
    <div role="alert" className="rounded-2xl border border-border p-6 space-y-3">
      <h2 className="font-semibold">Nie udało się wczytać danych</h2>
      <p className="text-sm text-muted-foreground">Sprawdź połączenie z internetem i spróbuj ponownie.</p>
      <button className="rounded-xl bg-primary px-4 py-2 text-primary-foreground" onClick={() => setAttempt(n => n + 1)}>Spróbuj ponownie</button>
    </div>
  );
  if (!hydrated || dataMode !== mode) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300" aria-busy="true">
        {/* Nagłówek — natychmiast widoczna struktura */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-36 rounded-lg" />
            <Skeleton className="h-3.5 w-56 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>

        {/* Metryki — subtelne karty */}
        <StatsSkeleton count={4} />

        {/* Tabela — cienkie linie imitujące wiersze */}
        <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
          <div className="border-b border-border/30 bg-muted/20 px-4 py-3 flex items-center justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-16" />
          </div>
          <div className="p-4 space-y-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2.5 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="sr-only">Ładowanie danych…</p>
      </div>
    );
  }

  return <>{children}</>;
}
