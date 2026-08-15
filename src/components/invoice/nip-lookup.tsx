"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatNip, isValidNipFormat, normalizeNip } from "@/lib/validation";
import { useToast } from "@/components/toast";
import type { NipLookupResult } from "@/lib/types";

interface LookupState {
  loading: boolean;
  result?: NipLookupResult;
}

export function NipLookup({
  nip,
  onNipChange,
  onFound,
}: {
  nip: string;
  onNipChange: (v: string) => void;
  onFound: (r: NonNullable<NipLookupResult["company"]>) => void;
}) {
  const toast = useToast();
  const [state, setState] = React.useState<LookupState>({ loading: false });

  const run = async () => {
    const normalized = normalizeNip(nip);
    if (!isValidNipFormat(normalized)) {
      setState({
        loading: false,
        result: {
          source: "demo",
          demo: true,
          error: "INVALID_NIP",
          message: "NIP musi mieć 10 cyfr i poprawną sumę kontrolną.",
        },
      });
      return;
    }
    setState({ loading: true, result: undefined });
    try {
      const res = await fetch(`/api/nip-lookup?nip=${encodeURIComponent(normalized)}`);
      const data = (await res.json()) as NipLookupResult;
      setState({ loading: false, result: data });
      if (res.ok && data.company) {
        toast("success", "Znaleziono w GUS (demo)", data.company.name);
        onFound(data.company);
      } else {
        toast("error", data.message ?? "Nie znaleziono podmiotu.", "Tryb demo — tylko wybrane numery NIP.");
      }
    } catch {
      setState({ loading: false, result: { source: "demo", demo: true, error: "UNREACHABLE", message: "Nie udało się połączyć z API lookup NIP." } });
      toast("error", "Błąd sieci", "Nie udało się połączyć z API lookup NIP.");
    }
  };

  const valid = nip.trim() !== "" && isValidNipFormat(normalizeNip(nip));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={nip}
            onChange={(e) => onNipChange(e.target.value)}
            placeholder="np. 527-000-00-24"
            inputMode="numeric"
            className="pr-24 font-mono"
            aria-label="NIP kontrahenta"
          />
          <Badge tone="accent" className="absolute right-2 top-1/2 -translate-y-1/2">
            <FlaskConical className="h-3 w-3" /> demo
          </Badge>
        </div>
        <Button
          variant="outline"
          onClick={run}
          disabled={state.loading || !nip.trim()}
          className="shrink-0"
        >
          {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="hidden sm:inline">Sprawdź w GUS</span>
        </Button>
      </div>

      <AnimatePresence>
        {state.result && !state.loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {state.result.error ? (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-[12.5px] text-red-600 dark:text-red-400">
                {state.result.error === "INVALID_NIP" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{state.result.message}</span>
              </div>
            ) : (
              state.result.company && (
                <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-[12.5px]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <div>
                    <p className="font-semibold">{state.result.company.name}</p>
                    <p className="text-muted-foreground">
                      NIP {formatNip(state.result.company.nip)} · REGON {state.result.company.regon}
                      <br />
                      {state.result.company.address.street}, {state.result.company.address.postal}{" "}
                      {state.result.company.address.city}
                      {state.result.company.isVatPayer ? " · płatnik VAT" : " · zwolniony z VAT"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Źródło: adapter demo (GUS BIR wymaga klucza API — patrz README).
                    </p>
                  </div>
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {valid && !state.result && (
        <p className="text-[11.5px] text-emerald-600 dark:text-emerald-400">
          Poprawna suma kontrolna NIP. Kliknij „Sprawdź w GUS”.
        </p>
      )}
    </div>
  );
}
