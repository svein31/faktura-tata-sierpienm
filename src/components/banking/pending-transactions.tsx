"use client";
import * as React from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { allocationAmount, parseBankAmount, PENDING_BANK_STATUSES, type BankAllocation } from "@/lib/banking/allocation";
import type { Currency } from "@/lib/types";
type Transaction = { id: string; bookingDate: string; amount: number; allocated: number; available: number; currency: Currency; description: string; counterpartyName: string | null; updatedAt: string; matchSignals: string[]; matchStatus: string; allocations?: BankAllocation[] | null };
type Candidate = { id: string; kind: "invoice" | "expense"; number: string; documentRevision: string; remaining: number; suggestedAmount: number; contractorName?: string; score: number; signals: string[] };
const signalNames: Record<string, string> = { number: "Zgodny numer dokumentu", nip: "Zgodny NIP", amount: "Zgodne saldo", overpayment: "Przelew większy niż saldo dokumentu" };
export function PendingTransactions({ refreshKey = 0 }: { refreshKey?: number }) {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const allowed = useAppStore(s => s.company?.currentUserPermissions?.canRecordPayments !== false);
  const [rows, setRows] = React.useState<Transaction[]>([]), [total, setTotal] = React.useState(0), [next, setNext] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Transaction | null>(null), [candidates, setCandidates] = React.useState<Candidate[]>([]), [choice, setChoice] = React.useState("");
  const [amountInput, setAmountInput] = React.useState("");
  const [error, setError] = React.useState(""), [busy, setBusy] = React.useState(false), [loading, setLoading] = React.useState(true), [finding, setFinding] = React.useState(false), [search, setSearch] = React.useState(""), [revision, setRevision] = React.useState(0);
  const generation = React.useRef(0), activeScope = React.useRef(companyId); activeScope.current = companyId;
  const selectedId = selected?.id;
  const load = React.useCallback(async (cursor?: string) => {
    const ticket = ++generation.current; if (!companyId || !allowed) return;
    setLoading(true);
    try {
      const res = await fetch("/api/banking/transactions?companyId=" + companyId + (cursor ? "&cursor=" + cursor : ""), { cache: "no-store" }), data = await res.json();
      if (ticket !== generation.current) return;
      if (!res.ok) throw new Error(data.error);
      setRows(old => cursor ? [...old, ...data.transactions] : data.transactions); setTotal(data.total); setNext(data.nextCursor); setError("");
    } catch (e) { if (ticket === generation.current) setError(e instanceof Error ? e.message : "Błąd odczytu transakcji."); }
    finally { if (ticket === generation.current) setLoading(false); }
  }, [companyId, allowed]);
  React.useEffect(() => { setRows([]); setSelected(null); setCandidates([]); setChoice(""); setSearch(""); setBusy(false); setError(""); void load(); return () => { ++generation.current; }; }, [load, revision, refreshKey]);
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("transactionId");
    if (!id || !companyId || !allowed) return;
    const controller = new AbortController();
    fetch("/api/banking/transactions?companyId=" + companyId + "&transactionId=" + encodeURIComponent(id), { signal: controller.signal, cache: "no-store" })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; })
      .then(data => { if (!controller.signal.aborted && PENDING_BANK_STATUSES.includes(data.transaction.matchStatus)) setSelected(data.transaction); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [companyId, allowed]);
  React.useEffect(() => {
    const controller = new AbortController(); setCandidates([]); setChoice(""); setAmountInput("");
    if (!selectedId || !companyId || !allowed) return;
    setFinding(true);
    const timer = setTimeout(() => {
      fetch("/api/banking/transactions?companyId=" + companyId + "&transactionId=" + selectedId + "&search=" + encodeURIComponent(search), { signal: controller.signal, cache: "no-store" })
        .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; })
        .then(data => { if (!controller.signal.aborted) { setSelected(current => current?.id === selectedId ? data.transaction : current); setCandidates(data.candidates); } })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setFinding(false); });
    }, search ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selectedId, companyId, allowed, search]);
  const candidate = candidates.find(c => c.kind + ":" + c.id === choice);
  const requested = parseBankAmount(amountInput);
  let valid = false;
  if (selected && candidate && requested !== null) {
    try { allocationAmount(selected.available, candidate.remaining, requested, candidate.kind === "expense"); valid = true; } catch { /* Show the allowed amount before confirmation. */ }
  }
  const choose = (value: string) => {
    setChoice(value); const match = candidates.find(c => c.kind + ":" + c.id === value);
    setAmountInput(match ? match.suggestedAmount.toFixed(2) : ""); setError("");
  };
  async function change(action: "match" | "ignore") {
    if (busy || !selected || !companyId || action === "match" && (!candidate || !valid || requested === null)) return;
    const message = action === "ignore" ? "Pominąć pozostałą operację? Wcześniejsze płatności pozostaną bez zmian." : `Przypisać ${formatMoney(requested!, selected.currency)} do ${candidate!.number}? Pozostała kwota przelewu: ${formatMoney(Math.max(0, selected.available - requested!), selected.currency)}.`;
    if (!window.confirm(message)) return;
    const current = companyId; setBusy(true); setError("");
    try {
      const res = await fetch("/api/banking/transactions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, transactionId: selected.id, revision: selected.updatedAt, action, documentId: candidate?.id, documentRevision: candidate?.documentRevision, kind: candidate?.kind, ...(action === "match" ? { amount: requested } : {}) }) }), data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (activeScope.current === current) { setSelected(null); setSearch(""); setRevision(r => r + 1); void useAppStore.getState().revalidate(); }
    } catch (e) { if (activeScope.current === current) setError(e instanceof Error ? e.message : "Błąd rozliczenia."); }
    finally { if (activeScope.current === current) setBusy(false); }
  }
  if (!companyId || !allowed) return null;
  return <section className="space-y-3 rounded-xl border bg-card p-4" id="pending-bank-transactions">
    <h2 className="font-semibold">Transakcje do rozliczenia · {total}</h2>
    <p className="text-sm text-muted-foreground">Sprawdź podpowiedź i zatwierdź kwotę. Pozostałą część przelewu możesz przypisać do kolejnego dokumentu.</p>
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <div className="divide-y">{rows.map(row => <button key={row.id} onClick={() => { setSelected(row); setSearch(""); setError(""); }} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 py-3 text-left text-sm">
      <span className="min-w-0 flex-1 break-words">{row.matchSignals.includes("reversal") && <strong className="mr-2">Storno</strong>}{row.description || "Transakcja"}<span className="block text-xs text-muted-foreground">{row.bookingDate} · {row.counterpartyName}{row.allocated > 0 ? ` · rozliczono ${formatMoney(row.allocated, row.currency)}` : ""}</span></span>
      <span className="shrink-0 font-medium tabular-nums">{formatMoney(row.available, row.currency)} do rozliczenia →</span>
    </button>)}</div>
    {loading && <p role="status" className="text-sm text-muted-foreground">Wczytywanie transakcji…</p>}
    {!loading && !rows.length && !error && <p className="text-sm text-muted-foreground">Brak transakcji wymagających przypisania.</p>}
    {next && <Button variant="outline" disabled={loading} onClick={() => void load(next)}>Pokaż kolejne</Button>}
    <Dialog open={Boolean(selected)} onClose={() => { if (!busy) setSelected(null); }} dismissible={!busy} title="Rozlicz transakcję bankową" footer={<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void change("ignore")}>Pomiń operację</Button><Button loading={busy} disabled={busy || finding || !valid || selected?.matchSignals.includes("reversal")} onClick={() => void change("match")}>Przypisz i zapisz płatność</Button></div>}>
      {selected && <div className="space-y-4 text-sm">
        <p className="break-words font-medium">{selected.description}</p>
        <dl className="grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-3 text-xs"><div><dt>Kwota przelewu</dt><dd className="mt-1 font-semibold">{formatMoney(Math.abs(selected.amount), selected.currency)}</dd></div><div><dt>Rozliczono</dt><dd className="mt-1 font-semibold">{formatMoney(selected.allocated, selected.currency)}</dd></div><div><dt>Do przypisania</dt><dd className="mt-1 font-semibold">{formatMoney(selected.available, selected.currency)}</dd></div></dl>
        {selected.matchSignals.includes("reversal") && <p role="status" className="rounded border p-3">To storno wcześniejszej operacji, nie nowa zapłata. Sprawdź odwróconą operację i wcześniejsze rozliczenie z księgowością. Aplikacja nie cofa automatycznie płatności.</p>}
        <div><Label htmlFor="bank-match-search">Szukaj numeru dokumentu</Label><Input id="bank-match-search" value={search} disabled={busy} onChange={e => setSearch(e.target.value)} /></div>
        <div><Label htmlFor="bank-match-document">Dokument</Label><Select id="bank-match-document" value={choice} disabled={busy || finding} onChange={e => choose(e.target.value)}><option value="">Wybierz dokument</option>{candidates.map(c => <option key={c.kind + c.id} value={c.kind + ":" + c.id}>{c.score > 0 ? "Podpowiedź: " : ""}{c.number} · pozostało {formatMoney(c.remaining, selected.currency)}</option>)}</Select></div>
        {finding && <p role="status" className="text-xs text-muted-foreground">Sprawdzanie aktualnych sald…</p>}
        {candidate && <div className="space-y-3 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">{candidate.contractorName}{candidate.signals.length ? " · " + candidate.signals.map(signal => signalNames[signal] || signal).join(" · ") : " · wybór ręczny"}</p>
          <div><Label htmlFor="bank-allocation-amount">Kwota przypisania ({selected.currency})</Label><Input id="bank-allocation-amount" inputMode="decimal" value={amountInput} disabled={busy} onChange={e => setAmountInput(e.target.value)} aria-invalid={!valid} aria-describedby="bank-allocation-summary" /></div>
          <p id="bank-allocation-summary" className={valid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{valid ? `Do tego dokumentu: ${formatMoney(requested!, selected.currency)}. Pozostanie do rozliczenia: ${formatMoney(Math.max(0, selected.available - requested!), selected.currency)}.` : `Podaj dodatnią kwotę do ${formatMoney(Math.min(selected.available, candidate.remaining), selected.currency)}${candidate.kind === "expense" ? "; wydatek wymaga pełnego salda" : ""}.`}</p>
        </div>}
        {!finding && !candidates.length && <p className="text-xs text-muted-foreground">Brak otwartych dokumentów w tej firmie, walucie i kierunku. Sprawdź numer lub pozostaw operację do późniejszego rozliczenia.</p>}
        {selected.allocations?.length ? <details className="rounded-md border p-3 text-xs"><summary className="cursor-pointer font-medium">Wcześniejsze przypisania ({selected.allocations.length})</summary><ul className="mt-2 space-y-1">{selected.allocations.map((item, index) => <li key={index}>{item.number} · {formatMoney(item.amount, selected.currency)}</li>)}</ul></details> : null}
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </div>}
    </Dialog>
  </section>;
}
