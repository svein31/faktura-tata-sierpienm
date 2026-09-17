"use client";

import * as React from "react";
import { Keyboard, X, Check, Command } from "lucide-react";
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
    <Dialog open={open} onClose={onClose}>
      <div className="p-5 sm:p-6 space-y-4 max-w-md w-full">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Skróty klawiszowe</h3>
              <p className="text-xs text-muted-foreground">Szybkie wystawianie dokumentów w FakturaProsto</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          {SHORTCUTS.map((s, idx) => {
            const keyList = isMac ? s.macKeys : s.keys;
            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/60 bg-muted/20 text-xs"
              >
                <span className="text-foreground/90 font-medium">
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

        <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
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
