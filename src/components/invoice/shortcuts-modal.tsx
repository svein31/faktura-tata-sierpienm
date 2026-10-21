"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {
    keys: ["Ctrl", "S"],
    macKeys: ["⌘", "S"],
    description: "Zapisz wersję roboczą (szkic faktury)",
    category: "Zapis",
  },
  {
    keys: ["Ctrl", "Enter"],
    macKeys: ["⌘", "↵"],
    description: "Zatwierdź i wystaw fakturę (oraz wyślij do KSeF)",
    category: "Wystawianie",
  },
  {
    keys: ["Shift", "Alt", "N"],
    macKeys: ["⇧", "⌥", "N"],
    description: "Dodaj nową pozycję towaru lub usługi",
    category: "Pozycje",
  },
  {
    keys: ["Ctrl", "P"],
    macKeys: ["⌘", "P"],
    description: "Otwórz podgląd wydruku / PDF",
    category: "Podgląd",
  },
  {
    keys: ["Esc"],
    macKeys: ["Esc"],
    description: "Zamknij podgląd / powrót",
    category: "Nawigacja",
  },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const isMac = typeof window !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  return (
    <Dialog open={open} onClose={onClose} title="Skróty klawiszowe" description="Szybkie wystawianie dokumentów w FakturaProsto">
      <div className="min-w-0 space-y-4">
        <div className="space-y-2.5">
          {SHORTCUTS.map((s, idx) => {
            const keyList = isMac ? s.macKeys : s.keys;
            return (
              <div
                key={idx}
                className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/60 bg-muted/20 text-xs"
              >
                <span className="text-foreground font-medium">
                  {s.description}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  {keyList.map((k, kIdx) => (
                    <kbd
                      key={kIdx}
                      className="px-2 py-1 rounded-lg border border-border/80 bg-card font-mono text-[11px] font-bold text-foreground shadow-2xs"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Działa na formularzu wystawiania faktury</span>
          <button
            type="button"
            onClick={onClose}
            className="text-primary font-semibold hover:underline"
          >
            Rozumiem, zamknij
          </button>
        </div>
      </div>
    </Dialog>
  );
}
