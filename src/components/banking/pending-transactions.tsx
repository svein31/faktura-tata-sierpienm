"use client";
import * as React from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
type Transaction = { id: string; bookingDate: string; amount: number; currency: string; description: string; counterpartyName: string | null; updatedAt: string };
type Candidate = { id: string; kind: string; number: string; remaining: number };
export function PendingTransactions() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const [rows, setRows] = React.useState<Transaction[]>([]), [total, setTotal] = React.useState(0), [next, setNext] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Transaction | null>(null), [candidates, setCandidates] = React.useState<Candidate[]>([]), [choice, setChoice] = React.useState("");
  const [error, setError] = React.useState(""), [busy, setBusy] = React.useState(false), [search, setSearch] = React.useState(""), [revision, setRevision] = React.useState(0);
  const generation = React.useRef(0), activeScope = React.useRef(companyId); activeScope.current = companyId;
  const load = React.useCallback(async (cursor?: string) => {
    const ticket = ++generation.current; if (!companyId) return;
    try { const res = await fetch("/api/banking/transactions?companyId=" + companyId + (cursor ? "&cursor=" + cursor : "")), data = await res.json(); if (ticket !== generation.current) return; if (!res.ok) throw new Error(data.error); setRows(old => cursor ? [...old, ...data.transactions] : data.transactions); setTotal(data.total); setNext(data.nextCursor); setError(""); } catch (e) { if (ticket === generation.current) setError(e instanceof Error ? e.message : "Błąd odczytu transakcji."); }
  }, [companyId]);
  React.useEffect(() => { setRows([]); setSelected(null); setCandidates([]); setChoice(""); setSearch(""); setBusy(false); setError(""); void load(); return () => { ++generation.current; }; }, [load, revision]);
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("transactionId");
    if (!id || !companyId) return;
    const controller = new AbortController();
    fetch("/api/banking/transactions?companyId=" + companyId + "&transactionId=" + encodeURIComponent(id), { signal: controller.signal })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; })
      .then(data => { if (!controller.signal.aborted && ["unmatched", "ambiguous"].includes(data.transaction.matchStatus)) setSelected(data.transaction); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [companyId]);
  React.useEffect(() => {
    const controller = new AbortController(); setCandidates([]); setChoice("");
    if (!selected || !companyId) return;
    const timer = setTimeout(() => { fetch("/api/banking/transactions?companyId=" + companyId + "&transactionId=" + selected.id + "&search=" + encodeURIComponent(search), { signal: controller.signal }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; }).then(data => { if (!controller.signal.aborted) setCandidates(data.candidates); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selected, companyId, search]);
  async function change(action: string) {
    if (busy || !selected || !companyId) return;
    if (!window.confirm(action === "ignore" ? "Pominąć tę operację? Nie zmieni to statusu faktury." : "Przypisać transakcję i zapisać płatność?")) return;
    const current = companyId; setBusy(true); setError("");
    const candidate = candidates.find(c => c.id === choice);
    try { const res = await fetch("/api/banking/transactions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, transactionId: selected.id, revision: selected.updatedAt, action, documentId: candidate?.id, kind: candidate?.kind }) }), data = await res.json(); if (!res.ok) throw new Error(data.error); if (activeScope.current === current) { setSelected(null); setSearch(""); setRevision(r => r + 1); void useAppStore.getState().revalidate(); } } catch (e) { if (activeScope.current === current) setError(e instanceof Error ? e.message : "Błąd rozliczenia."); } finally { if (activeScope.current === current) setBusy(false); }
  }
  if (!companyId) return null;
  return <section className="space-y-3 rounded-xl border bg-card p-4" id="pending-bank-transactions"><h2 className="font-semibold">Transakcje do rozliczenia · {total}</h2><p className="text-sm text-muted-foreground">Sprawdź dokument, kierunek i walutę. Przypisanie zapisze płatność; pominięcie nie zmieni faktury.</p>{error && <p role="alert" className="break-words text-sm text-rose-600">{error}</p>}<div className="divide-y">{rows.map(row => <button key={row.id} onClick={() => { setSelected(row); setSearch(""); }} className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left text-sm"><span className="min-w-0 flex-1 break-words">{row.description || "Transakcja"}<span className="block text-xs text-muted-foreground">{row.bookingDate} · {row.counterpartyName}</span></span><span className="shrink-0 font-medium">{row.amount.toFixed(2)} {row.currency} →</span></button>)}</div>{!rows.length && !error && <p className="text-sm text-muted-foreground">Brak transakcji wymagających przypisania.</p>}{next && <Button variant="outline" onClick={() => void load(next)}>Pokaż kolejne</Button>}
    <Dialog open={Boolean(selected)} onClose={() => { if (!busy) setSelected(null); }} dismissible={!busy} title="Rozlicz transakcję bankową" footer={<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void change("ignore")}>Pomiń operację</Button><Button disabled={busy || !choice} onClick={() => void change("match")}>Przypisz i zapisz płatność</Button></div>}>
      {selected && <div className="space-y-3 text-sm"><p className="break-words">{selected.description} · {selected.amount.toFixed(2)} {selected.currency}</p><div><Label htmlFor="bank-match-search">Szukaj numeru dokumentu</Label><Input id="bank-match-search" value={search} onChange={e => setSearch(e.target.value)} /></div><div><Label htmlFor="bank-match-document">Dokument</Label><Select id="bank-match-document" value={choice} onChange={e => setChoice(e.target.value)}><option value="">Wybierz dokument</option>{candidates.map(c => <option key={c.id} value={c.id}>{c.number} · pozostało {c.remaining.toFixed(2)} {selected.currency}</option>)}</Select></div>{!candidates.length && <p>Nie znaleziono dokumentów z odpowiednim saldem, walutą i kierunkiem. Sprawdź numer lub pomiń operację.</p>}{error && <p role="alert" className="text-rose-600">{error}</p>}</div>}
    </Dialog></section>;
}
