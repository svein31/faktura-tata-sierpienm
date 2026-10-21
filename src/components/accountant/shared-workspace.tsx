"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useSessionUser } from "@/lib/session-context";
import type { AccountingTask } from "@/lib/accounting-workspace";
import { AccountingPeriodPanel } from "@/components/accountant/period-panel";

type State = { workspace: { items: AccountingTask[]; version: number }; assignees: { id: string; name: string }[] };
export function SharedAccountingWorkspace({ companyId, month }: { companyId: string; month: string }) {
  const user = useSessionUser();
  const [readOnly, setReadOnly] = React.useState(true);
  const [state, setState] = React.useState<State | null>(null), [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false), [title, setTitle] = React.useState(""), [kind, setKind] = React.useState("check");
  const [filter, setFilter] = React.useState("open");
  const [noteItem, setNoteItem] = React.useState<AccountingTask | null>(null), [note, setNote] = React.useState("");
  const [removeItem, setRemoveItem] = React.useState<AccountingTask | null>(null);
  const saving = React.useRef(false);
  const mounted = React.useRef(true), generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const attempt = ++generation.current;
    try {
      const response = await fetch(`/api/accountant/workspace?${new URLSearchParams({ companyId, month })}`), result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (mounted.current && attempt === generation.current) { setState(result); setError(""); }
    } catch (e) { if (mounted.current && attempt === generation.current) { setState(null); setReadOnly(true); setError(e instanceof Error ? e.message : "Błąd pobierania wspólnej listy."); } }
  }, [companyId, month]);
  React.useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; ++generation.current; }; }, [load]);
  const save = async (payload: Record<string, unknown>) => {
    if (!state || busy || saving.current || readOnly) return false; saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/accountant/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, month, version: state.workspace.version, ...payload }) }), result = await response.json();
      if (!response.ok) { if ([401, 403].includes(response.status) && mounted.current) { setState(null); setReadOnly(true); } throw new Error(result.error); }
      if (mounted.current) { setState(previous => previous ? { ...previous, workspace: result.workspace } : previous); if (payload.action === "add") setTitle(""); return true; }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Błąd zapisu. Odśwież listę."); }
    finally { if (mounted.current) { saving.current = false; setBusy(false); } }
    return false;
  };
  const items = state?.workspace.items || [];
  const visibleItems = items.filter(item => filter === "all" || (filter === "missing" ? item.kind === "missing" && !item.done : filter === "mine" ? item.assigneeId === user.id && !item.done : !item.done));
  return <><AccountingPeriodPanel companyId={companyId} month={month} revision={state?.workspace.version || 0} onReadOnly={setReadOnly} /><section id="monthly-tasks" className="scroll-mt-24 rounded-xl border bg-card p-4 sm:p-5 space-y-4">
    <div className="flex justify-between flex-wrap gap-2"><h2 className="font-semibold">Wspólna lista miesiąca · {month}</h2><Button variant="ghost" disabled={busy} onClick={load}>Odśwież wspólną listę</Button></div>
    <p className="text-sm text-muted-foreground">Lista dla właściciela i księgowości wybranej firmy. Zaznaczenie zadań nie zamyka okresu księgowego.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!state && !error && <p role="status">Wczytywanie…</p>}
    {state && <><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Ukończono {items.filter(i => i.done).length}/{items.length} · Brakujące dokumenty: {items.filter(i => i.kind === "missing" && !i.done).length}</p><label className="flex items-center gap-2 text-xs">Pokaż<Select aria-label="Filtr zadań miesiąca" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Do zrobienia</option><option value="missing">Brakujące dokumenty</option><option value="mine">Przypisane do mnie</option><option value="all">Wszystkie</option></Select></label></div><fieldset disabled={readOnly || busy} className="space-y-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void save({ action: "add", title, kind }); }}>
        <label className="text-sm grow">Zadanie lub dokument<Input required maxLength={200} disabled={busy} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="text-sm">Rodzaj<Select aria-label="Rodzaj zadania" disabled={busy} value={kind} onChange={e => setKind(e.target.value)}><option value="check">Zadanie do sprawdzenia</option><option value="missing">Brakujący dokument</option></Select></label>
        <Button disabled={busy || !title.trim()}>Dodaj</Button>
      </form>
      <div className="space-y-2">{visibleItems.map(item => <article key={item.id} className="rounded-xl border p-3 space-y-2">
        <div className="flex gap-2 items-start"><input aria-label={`Ukończono: ${item.title}`} className="mt-1 size-6 shrink-0 accent-primary" type="checkbox" checked={item.done} disabled={busy} onChange={e => save({ action: "done", itemId: item.id, done: e.target.checked })} /><div className="min-w-0 grow"><p className={`break-words text-sm ${item.done ? "line-through text-muted-foreground" : "font-medium"}`}>{item.title}</p><p className="text-xs text-muted-foreground">{item.kind === "missing" ? "Brakujący dokument" : "Zadanie"}</p></div></div>
        <div className="flex flex-wrap items-center gap-2"><label className="min-w-0 text-xs grow">Osoba odpowiedzialna<Select aria-label={`Osoba odpowiedzialna za ${item.title}`} disabled={busy} value={item.assigneeId || ""} onChange={e => save({ action: "assign", itemId: item.id, assigneeId: e.target.value || null })}><option value="">Nieprzypisane</option>{item.assigneeId && !state.assignees.some(p => p.id === item.assigneeId) && <option value={item.assigneeId}>Osoba bez aktualnego dostępu</option>}{state.assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></label><Button variant="ghost" disabled={busy} onClick={() => { setNoteItem(item); setNote(item.note); }}>Notatka</Button><Button variant="ghost" disabled={busy} onClick={() => setRemoveItem(item)}>Usuń</Button></div>
        {item.note && <p className="text-sm whitespace-pre-wrap">{item.note}</p>}
      </article>)}</div>
    </fieldset>{!visibleItems.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{items.length ? "Brak zadań w wybranym filtrze." : "Lista jest pusta. Dodaj brakujący dokument lub zadanie, aby właściciel i księgowość widzieli ten sam stan przygotowania."}</p>}</>}
  </section><Dialog open={Boolean(noteItem)} dismissible={!busy} onClose={() => setNoteItem(null)} title="Notatka do zadania" description={noteItem?.title}><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (noteItem && await save({ action: "note", itemId: noteItem.id, note })) setNoteItem(null); }}><label className="block space-y-2 text-sm">Treść notatki<Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={4} disabled={busy || readOnly} /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setNoteItem(null)}>Anuluj</Button><Button type="submit" disabled={busy || readOnly}>Zapisz notatkę</Button></div></form></Dialog><Dialog open={Boolean(removeItem)} dismissible={!busy} onClose={() => setRemoveItem(null)} title="Usunąć zadanie?" description="Zmiana pozostanie w historii audytu."><p className="break-words text-sm">{removeItem?.title}</p>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<div className="mt-4 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRemoveItem(null)}>Anuluj</Button><Button variant="destructive" disabled={busy || readOnly} onClick={async () => { if (removeItem && await save({ action: "remove", itemId: removeItem.id })) setRemoveItem(null); }}>Usuń zadanie</Button></div></Dialog></>;
}
