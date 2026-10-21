"use client";
import { SensitiveDownload } from "./sensitive-download";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountingHandoff } from "@/lib/accounting-handoff";

type Summary = { currency: string; salesGross: number; expenseGross: number };
type State = {
  handoff: AccountingHandoff;
  period: { status: string; version: number; closedAt: string | null };
  readiness: { canClose: boolean; blockers: Record<string, number>; summary: Summary[]; details: Record<string, { id: string; label: string; href: string }[]>; progress: { completed: number; total: number } };
  events: { id: string; action: string; authorName: string; reason: string; createdAt: string; snapshot: { summary: Summary[] } }[];
  nextCursor: string | null; canClose: boolean; canReopen: boolean;
};
const labels: Record<string, string> = { drafts: "Szkice faktur", upo: "Faktury bez UPO", ksef: "Nierozstrzygnięte faktury KSeF", purchases: "Zakupy bez akceptacji", expenses: "Koszty bez weryfikacji", tasks: "Niezakończone zadania miesiąca", stocktakings: "Otwarte remanenty" };
const money = (value: number, currency: string) => `${value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export function AccountingPeriodPanel({ companyId, month, revision, onReadOnly }: { companyId: string; month: string; revision: number; onReadOnly: (closed: boolean) => void }) {
  const [state, setState] = React.useState<State | null>(null), [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false), [reason, setReason] = React.useState("");
  const mounted = React.useRef(false), generation = React.useRef(0), mutationBusy = React.useRef(false);
  const scope = companyId + ":" + month;
  const activeScope = React.useRef(scope); activeScope.current = scope;
  const load = React.useCallback(async (cursor?: string) => {
    const ticket = ++generation.current;
    try {
      const query = new URLSearchParams({ companyId, month, ...(cursor ? { cursor } : {}) });
      const response = await fetch(`/api/accountant/period?${query}`), result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się odczytać okresu.");
      if (mounted.current && ticket === generation.current) {
        setState(previous => ({ ...result, events: cursor && previous ? [...previous.events, ...result.events] : result.events }));
        onReadOnly(result.period.status !== "open");
        setError("");
      }
    } catch (e) { if (mounted.current && ticket === generation.current) { setState(null); setError(e instanceof Error ? e.message : "Błąd odczytu okresu."); onReadOnly(true); } }
  }, [companyId, month, onReadOnly]);
  React.useEffect(() => { mounted.current = true; setState(null); setReason(""); setBusy(false); mutationBusy.current = false; onReadOnly(true); void load(); return () => { mounted.current = false; ++generation.current; }; }, [load, revision]);
  const change = async () => {
    if (!state || busy || mutationBusy.current || !reason.trim()) return;
    const operationScope = scope;
    const action = state.period.status === "closed" ? "reopen" : "close";
    if (!window.confirm(action === "close" ? `Zamknąć ${month}? Zapisy dokumentów w tym miesiącu zostaną zablokowane.` : `Ponownie otworzyć ${month}? Zapis dokumentów będzie znów możliwy.`)) return;
    mutationBusy.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/accountant/period", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, month, version: state.period.version, action, reason }) }), result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się zmienić okresu.");
      if (mounted.current && activeScope.current === operationScope) { setReason(""); await load(); }
    } catch (e) { if (mounted.current && activeScope.current === operationScope) setError(e instanceof Error ? e.message : "Błąd zmiany okresu. Odśwież dane."); }
    finally { if (mounted.current && activeScope.current === operationScope) { mutationBusy.current = false; setBusy(false); } }
  };
  const closed = state?.period.status === "closed";
  return <section className="rounded-xl border p-4 space-y-3 mb-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Miesiąc do rozliczenia · {month}</h2><p className="mt-1 text-xs text-muted-foreground">Okres: {state ? closed ? "Zamknięty" : "Otwarty" : "Wczytywanie…"}</p></div><Button variant="ghost" disabled={busy} onClick={() => load()}>Sprawdź stan miesiąca</Button></div>
    <p className="text-sm text-muted-foreground">Okres według daty wystawienia dokumentu, osobno dla wybranej firmy. Zamknięcie blokuje zmiany dokumentów i listy zadań. Ponowne otwarcie przez właściciela wymaga uzasadnienia.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {state && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Przygotowanie dokumentów miesiąca">{([
        ["missing", "Brakujące dokumenty", "Zgłoszone na wspólnej liście miesiąca."],
        ["inbox", "Pliki do opracowania", "Dodane do skrzynki w tym miesiącu; data wystawienia może być inna."],
        ["unsettled", "Nierozliczone dokumenty", "Według statusu płatności. Nie blokują zamknięcia miesiąca."],
        ["sources", "Koszty bez wskazanego źródła", "Bez załącznika, skanu lub odwołania KSeF. Sprawdź kompletność."],
      ] as const).map(([key, title, description]) => <details key={key} className="min-w-0 rounded-lg border p-3"><summary className="cursor-pointer text-sm"><span className="block text-xs font-medium text-muted-foreground">{title}</span><span className="mt-2 block text-2xl font-semibold tabular-nums">{state.handoff[key].count}</span></summary><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{description}</p><ul className="mt-2 space-y-2">{state.handoff[key].items.map(item => <li key={item.id}><Link prefetch={false} href={item.href} className="inline-flex min-h-6 break-words text-xs text-primary underline underline-offset-4">{item.label}</Link></li>)}</ul>{state.handoff[key].count > 10 && <p className="mt-2 text-xs text-muted-foreground">Pokazano pierwsze 10 pozycji.</p>}{!state.handoff[key].count && <p className="mt-2 text-xs text-muted-foreground">Brak pozycji do sprawdzenia w tej grupie.</p>}</details>)}</div>
      {!closed && <div className="space-y-3">
        <p className="text-sm font-medium">Gotowość miesiąca: {state.readiness.progress.completed}/{state.readiness.progress.total} kontroli zakończonych</p>
        <progress className="h-2 w-full accent-primary" aria-label="Postęp kontroli miesiąca" value={state.readiness.progress.completed} max={state.readiness.progress.total} />
        <ul className="grid gap-2 sm:grid-cols-2">{Object.entries(state.readiness.blockers).filter(([, count]) => count > 0).map(([key, count]) => <li key={key} className="min-w-0 rounded-lg border p-3 text-sm">
          <p className={count ? "font-medium text-warning dark:text-warning" : "text-muted-foreground"}>{count ? "Do sprawdzenia" : "Gotowe"} · {labels[key] || key}: {count}</p>
          {(state.readiness.details[key] || []).map(item => <Link prefetch={false} key={item.id} href={item.href} className="mt-2 block break-words text-primary underline underline-offset-4">{item.label} →</Link>)}
          {count > (state.readiness.details[key]?.length || 0) && <p className="mt-2 text-xs text-muted-foreground">Lista pokazuje pierwsze 10 dokumentów. Po poprawieniu sprawdź stan ponownie.</p>}
        </li>)}</ul>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Kontrole bez uwag ({state.readiness.progress.completed})</summary><ul className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">{Object.entries(state.readiness.blockers).filter(([, count]) => count === 0).map(([key]) => <li key={key}>{labels[key] || key}: 0</li>)}</ul>{state.readiness.progress.completed === 0 && <p className="mt-2 text-xs text-muted-foreground">Najpierw zakończ pozycje do sprawdzenia.</p>}</details>
      </div>}
      <div className="rounded-lg border bg-muted/20 p-4"><h3 className="text-sm font-semibold">Przekaż dokumenty księgowości</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Paczka zawiera zestawienie, dostępne XML KSeF i UPO, wizualizacje PDF oraz bezpieczne oryginały kosztów ze skrzynki. Spis zawartości wskazuje pominięte lub brakujące pliki. Pobranie nie oznacza wysłania ani zamknięcia miesiąca.</p><div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><SensitiveDownload url={`/api/accountant/package?companyId=${companyId}&month=${month}`} scope={companyId + "-" + month} /><Link prefetch={false} href={`/accountant/portal?month=${month}`} className="inline-flex min-h-9 items-center text-primary underline">Otwórz pulpit księgowy →</Link><Link prefetch={false} href="/settings/team" className="inline-flex min-h-9 items-center text-primary underline">Dostęp dla księgowej →</Link></div></div>
      <div className="flex flex-wrap gap-3 text-sm"><Link prefetch={false} href="/documents" className="inline-flex min-h-9 items-center text-primary underline">Sprawdź skrzynkę dokumentów →</Link><Link prefetch={false} href="/finances" className="inline-flex min-h-9 items-center text-primary underline">Rozlicz płatności →</Link></div>
      <p className="text-xs text-muted-foreground">Niezatwierdzone pliki w skrzynce dokumentów nie są jeszcze kosztami. Przed zamknięciem sprawdź kompletność dokumentów; późniejsza akceptacja pliku z tego miesiąca będzie wymagać jego ponownego otwarcia.</p>
      {((closed && state.canReopen) || (!closed && state.canClose)) && <form onSubmit={e => { e.preventDefault(); void change(); }} className="flex flex-wrap items-end gap-2">
        <label className="text-sm grow">Uzasadnienie<Input required maxLength={1000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <Button disabled={busy || !reason.trim() || (!closed && !state.readiness.canClose)}>{busy ? "Zapisywanie…" : closed ? "Otwórz ponownie" : "Zamknij miesiąc"}</Button>
      </form>}
      <details><summary className="cursor-pointer text-sm font-medium">Historia zamknięć i otwarć ({state.events.length})</summary>
        <div className="space-y-3 mt-3">{state.events.map(event => <article key={event.id} className="border rounded-lg p-3 text-sm">
          <p className="font-medium">{event.action === "close" ? "Zamknięcie" : "Ponowne otwarcie"} · {new Date(event.createdAt).toLocaleString("pl-PL")} · {event.authorName}</p>
          <p className="whitespace-pre-wrap">{event.reason}</p>
          {event.snapshot.summary.map(row => <p key={row.currency} className="text-xs text-muted-foreground">Stan w chwili operacji: sprzedaż brutto {money(row.salesGross, row.currency)} · koszty brutto {money(row.expenseGross, row.currency)}</p>)}
        </article>)}{!state.events.length && <p className="text-sm text-muted-foreground">Brak zmian stanu tego miesiąca.</p>}</div>
        {state.nextCursor && <Button variant="ghost" disabled={busy} onClick={() => load(state.nextCursor!)}>Starsza historia</Button>}
      </details>
    </>}
  </section>;
}
