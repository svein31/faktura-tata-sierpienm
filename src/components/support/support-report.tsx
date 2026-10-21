"use client";
import * as React from "react";
import { CheckCircle2, Copy, Send } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getLastIncident } from "@/lib/browser-diagnostics";
import { productScreen } from "@/lib/product-diagnostics";
export const OPEN_SUPPORT_EVENT = "fakturaprosto:open-support";
export function openSupportReport() { window.dispatchEvent(new CustomEvent(OPEN_SUPPORT_EVENT)); }
export function SupportReport({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = React.useState(""), [category, setCategory] = React.useState("problem");
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(""), [reference, setReference] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const requestId = React.useRef("");
  const inputId = React.useId(), categoryId = React.useId();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    setError(""); setBusy(true);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const incident = getLastIncident();
      const res = await fetch("/api/support", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description, category, screen: productScreen(window.location.pathname), requestId: requestId.current, ...(incident ? { incident } : {}) }), signal: AbortSignal.timeout(12000) });
      const body = await res.json(); if (!res.ok) throw new Error(body.error || "Nie udało się potwierdzić zapisu.");
      setReference(body.reference);
    } catch (failure) { setError(failure instanceof Error && failure.name !== "TimeoutError" ? failure.message : "Brak potwierdzenia zapisu. Opis pozostaje w formularzu; możesz ponowić próbę."); }
    finally { setBusy(false); }
  }
  return <Dialog open onClose={onClose} title={reference ? "Zgłoszenie zapisane" : "Zgłoś problem lub pomysł"} description={reference ? "Zachowaj numer zgłoszenia na potrzeby kontaktu z obsługą." : "Napisz, co się wydarzyło i jakiego wyniku oczekujesz."} dismissible={!busy}>
    {reference ? <div className="space-y-4"><CheckCircle2 aria-hidden="true" className="size-8 text-success" /><p className="break-all rounded-md border bg-muted/30 p-3 font-mono text-sm">{reference}</p><p className="text-sm text-muted-foreground">Zgłoszenie jest zapisane w systemie. Potwierdzenie zapisu nie oznacza jeszcze przeczytania go przez obsługę.</p><div className="flex flex-wrap gap-2"><Button variant="outline" className="gap-2" onClick={async () => { try { await navigator.clipboard.writeText(reference); setCopied(true); } catch { setCopied(false); } }}><Copy aria-hidden="true" className="size-4" />{copied ? "Skopiowano" : "Kopiuj numer"}</Button><Button onClick={onClose}>Zamknij</Button></div></div> : <form onSubmit={submit} className="space-y-4"><div><Label htmlFor={categoryId}>Rodzaj zgłoszenia</Label><Select id={categoryId} value={category} onChange={e => { setCategory(e.target.value); requestId.current = ""; }} disabled={busy}><option value="problem">Problem z działaniem</option><option value="question">Pytanie</option><option value="idea">Pomysł na usprawnienie</option></Select></div><div><Label htmlFor={inputId}>Opis</Label><textarea id={inputId} required minLength={10} maxLength={2000} value={description} disabled={busy} onChange={e => { setDescription(e.target.value); requestId.current = ""; }} rows={6} className="w-full resize-y rounded-md border border-input bg-card p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" placeholder="Np. po zmianie filtra nie widzę dokumentów…" aria-describedby={`${inputId}-privacy`} /><p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">{description.length}/2000</p></div><p id={`${inputId}-privacy`} className="text-xs leading-relaxed text-muted-foreground">Nie wpisuj haseł, tokenów KSeF ani danych klientów. Automatycznie dołączamy tylko nazwę sekcji, wersję aplikacji i numer ostatniego zarejestrowanego błędu. Nie dołączamy faktur, zrzutu ekranu ani adresu odwiedzanej strony.</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Anuluj</Button><Button type="submit" disabled={busy || description.trim().length < 10} className="gap-2"><Send aria-hidden="true" className="size-4" />{busy ? "Zapisuję…" : "Wyślij zgłoszenie"}</Button></div></form>}
  </Dialog>;
}
