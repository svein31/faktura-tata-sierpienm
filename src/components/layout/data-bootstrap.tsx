"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";

/**
 * Jednorazowy bootstrap danych zalogowanego użytkownika (GET /api/data).
 * Renderuje skeleton do czasu zakończenia; przy 401 (wygasła sesja) kieruje
 * na /login. Wszystkie strony biznesowe żyją pod tym komponentem.
 */
export function DataBootstrap({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAppStore((s) => s.hydrated);
  const authError = useAppStore((s) => s.authError);

  React.useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const state = useAppStore.getState();
      if (state.hydrated) return;
      try {
        await state.bootstrap();
      } catch {
        if (!cancelled) {
          // Tymczasowy problem sieci — spróbuj ponownie za chwilę.
          window.setTimeout(() => {
            if (!useAppStore.getState().hydrated) void useAppStore.getState().bootstrap().catch(() => undefined);
          }, 2000);
        }
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (authError) {
      const url = new URL("/login", window.location.href);
      url.searchParams.set("expired", "1");
      router.replace(url.toString());
    }
  }, [authError, router]);

  if (!hydrated) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-muted/40" />
        <p className="sr-only">Ładowanie danych…</p>
      </div>
    );
  }

  return <>{children}</>;
}
