"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { AccountingTask } from "@/lib/accounting-workspace";
import { AccountingPeriodPanel } from "@/components/accountant/period-panel";

type State = { workspace: { items: AccountingTask[]; version: number }; assignees: { id: string; name: string }[] };
export function SharedAccountingWorkspace({ companyId, month }: { companyId: string; month: string }) {
  const [readOnly, setReadOnly] = React.useState(true);
  const [state, setState] = React.useState<State | null>(null), [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false), [title, setTitle] = React.useState(""), [kind, setKind] = React.useState("check");
  const mounted = React.useRef(true), generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const attempt = ++generation.current;
    try {
      const response = await fetch(`/api/accountant/workspace?${new URLSearchParams({ companyId, month })}`), result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (mounted.current && attempt === generation.current) { setState(result); setError(""); }
    } catch (e) { if (mounted.current && attempt === generation.current) setError(e instanceof Error ? e.message : "Błąd pobierania wspólnej listy."); }
  }, [companyId, month]);
  React.useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; ++generation.current; }; }, [load]);
  const save = async (payload: Record<string, unknown>) => {
    if (!state || busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/accountant/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, month, version: state.workspace.version, ...payload }) }), result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (mounted.current) { setState(previous => previous ? { ...previous, workspace: result.workspace } : previous); if (payload.action === "add") setTitle(""); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Błąd zapisu. Odśwież listę."); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <><AccountingPeriodPanel companyId={companyId} month={month} revision={state?.workspace.version || 0} onReadOnly={setReadOnly} /><section className="rounded-xl border p-4 space-y-3">
    <div className="flex justify-between flex-wrap gap-2"><h2 className="font-semibold">Wspólna lista miesiąca · {month}</h2><Button variant="ghost" disabled={busy} onClick={load}>Odśwież wspólną listę</Button></div>
    <p className="text-sm text-muted-foreground">Lista dla właściciela i księgowości wybranej firmy. Zaznaczenie zadań nie zamyka okresu księgowego.</p>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {!state && !error && <p role="status">Wczytywanie…</p>}
    {state && <fieldset disabled={readOnly || busy} className="space-y-3">
      <p className="text-sm">Ukończono {state.workspace.items.filter(i => i.done).length}/{state.workspace.items.length} · Brakujące dokumenty: {state.workspace.items.filter(i => i.kind === "missing" && !i.done).length}</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void save({ action: "add", title, kind }); }}>
        <label className="text-sm grow">Zadanie lub dokument<Input required maxLength={200} disabled={busy} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="text-sm">Rodzaj<Select disabled={busy} value={kind} onChange={e => setKind(e.target.value)}><option value="check">Zadanie do sprawdzenia</option><option value="missing">Brakujący dokument</option></Select></label>
        <Button disabled={busy || !title.trim()}>Dodaj</Button>
      </form>
      <div className="space-y-2">{state.workspace.items.map(item => <article key={item.id} className="rounded-xl border p-3 space-y-2">
        <div className="flex gap-2 items-start"><input aria-label={`Ukończono: ${item.title}`} className="mt-1" type="checkbox" checked={item.done} disabled={busy} onChange={e => save({ action: "done", itemId: item.id, done: e.target.checked })} /><div className="grow"><p className={`text-sm ${item.done ? "line-through text-muted-foreground" : "font-medium"}`}>{item.title}</p><p className="text-xs text-muted-foreground">{item.kind === "missing" ? "Brakujący dokument" : "Zadanie"}</p></div></div>
        <div className="flex flex-wrap items-center gap-2"><label className="text-xs grow">Osoba odpowiedzialna<Select disabled={busy} value={item.assigneeId || ""} onChange={e => save({ action: "assign", itemId: item.id, assigneeId: e.target.value || null })}><option value="">Nieprzypisane</option>{item.assigneeId && !state.assignees.some(p => p.id === item.assigneeId) && <option value={item.assigneeId}>Osoba bez aktualnego dostępu</option>}{state.assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></label><Button variant="ghost" disabled={busy} onClick={() => { const note = window.prompt("Notatka do zadania (do 1000 znaków):", item.note); if (note !== null) void save({ action: "note", itemId: item.id, note }); }}>Notatka</Button><Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm("Usunąć zadanie ze wspólnej listy? Zmiana pozostanie w audycie.")) void save({ action: "remove", itemId: item.id }); }}>Usuń</Button></div>
        {item.note && <p className="text-sm whitespace-pre-wrap">{item.note}</p>}
      </article>)}</div>
    </fieldset>}
  </section></>;
}
