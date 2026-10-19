"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { AppLoadingSkeleton } from "./app-loading-skeleton";
import { LoadingReveal } from "@/components/ui/loading-reveal";

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
  const fullInvoicePaths = new Set(["/invoices/recurring", "/advances", "/recurring", "/reminders", "/finances", "/calendar", "/settings/companies"]);
  const mode = fullInvoicePaths.has(pathname) ? "full" : "list";
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
  return <LoadingReveal key={mode} loading={!hydrated || dataMode !== mode} fallback={<AppLoadingSkeleton />}>{children}</LoadingReveal>;
}
