"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type Result = { valid: boolean; requestDate: string; countryCode: string; vatNumber: string };

export function ViesLookup({ vat, country }: { vat: string; country: string }) {
  const [result, setResult] = React.useState<Result | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const pending = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    pending.current?.abort();
    setResult(null); setError(""); setLoading(false);
    return () => pending.current?.abort();
  }, [vat, country]);

  const check = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setResult(null); setError("");
    try {
      const params = new URLSearchParams({ vat, country });
      const response = await fetch(`/api/vies/check?${params}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nie udało się sprawdzić numeru.");
      if (!controller.signal.aborted) setResult(data as Result);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "VIES jest niedostępny.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <Button type="button" variant="outline" size="sm" disabled={!vat.trim() || loading} onClick={check} className="h-8">{loading ? "Sprawdzanie…" : "Sprawdź w VIES"}</Button>
    <span role="status" aria-live="polite" className={error ? "text-amber-700 dark:text-amber-300" : result?.valid === false ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"}>
      {error || (result ? `${result.valid ? "Aktywny VAT UE" : "Numer nieaktywny w VIES"} · ${result.countryCode}${result.vatNumber} · stan na ${result.requestDate}` : "Wynik nie jest zapisywany ani wymagany do wystawienia faktury.")}
    </span>
  </div>;
}
