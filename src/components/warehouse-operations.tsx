"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { StocktakingDto } from "@/lib/warehouse/types";

type Warehouse = { id: string; name: string; code: string; currency: string | null; isActive: boolean };
type State = { warehouses: Warehouse[]; stocktakings: StocktakingDto[]; canWrite: boolean; canCreate: boolean };
const newLine = () => ({ sku: "", name: "", unit: "szt.", quantity: "1", unitPriceNet: "0" });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function WarehouseOperations({ companyId, onChange }: { companyId: string; onChange: () => void }) {
  const [state, setState] = React.useState<State | null>(null), [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState("");
  const [warehouseId, setWarehouseId] = React.useState(""), [targetId, setTargetId] = React.useState("");
  const [type, setType] = React.useState("PZ"), [issueDate, setIssueDate] = React.useState(today);
  const [lines, setLines] = React.useState([newLine()]);
  const [name, setName] = React.useState(""), [code, setCode] = React.useState(""), [currency, setCurrency] = React.useState("PLN");
  const stocktakingPanel = React.useRef<HTMLDetailsElement>(null);
  React.useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "stocktakings" && stocktakingPanel.current) { stocktakingPanel.current.open = true; stocktakingPanel.current.scrollIntoView({ block: "start" }); } }, [state]);
  const retry = React.useRef<{ json: string; requestId: string } | null>(null);
  const mounted = React.useRef(true);
  const loading = React.useRef(0);
  const load = React.useCallback(async () => {
    const generation = ++loading.current;
    try {
      const response = await fetch(`/api/warehouse/commands?companyId=${companyId}`), result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (mounted.current && generation === loading.current) setState(result);
    } catch (e) { if (mounted.current && generation === loading.current) setError(e instanceof Error ? e.message : "Nie udało się pobrać uprawnień."); }
  }, [companyId]);
  React.useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; ++loading.current; }; }, [load]);

  const command = async (payload: Record<string, unknown>) => {
    if (busy) return false;
    setBusy(true); setError(""); setMessage("");
    const json = JSON.stringify({ ...payload, companyId });
    if (!retry.current || retry.current.json !== json) retry.current = { json, requestId: crypto.randomUUID() };
    try {
      const response = await fetch("/api/warehouse/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(json), requestId: retry.current.requestId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!mounted.current) return true;
      retry.current = null;
      setMessage(`${result.replayed ? "Operacja była już zapisana" : "Zapisano"}: ${result.result.number || result.result.code || "operację"}.`);
      await load(); onChange(); return true;
    } catch (e) {
      if (mounted.current) setError(`${e instanceof Error ? e.message : "Błąd połączenia."} Możesz ponowić tę samą operację. Przy zmianie danych najpierw sprawdź historię.`);
      return false;
    } finally { if (mounted.current) setBusy(false); }
  };
  const active = state?.warehouses.filter(w => w.isActive && w.currency) || [];
  const selected = active.find(w => w.id === warehouseId);
  return <section className="rounded-xl border p-4 space-y-4">
    <h2 className="font-semibold">Operacje magazynowe</h2>
    {error && <p role="alert" className="text-sm text-rose-600">{error} <Button variant="ghost" onClick={load}>Odśwież dane</Button></p>}
    {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
    {!state && !error && <p role="status">Wczytywanie uprawnień…</p>}
    {state && !state.canWrite && <p className="text-sm text-muted-foreground">Masz dostęp do podglądu. Zapisy wymagają uprawnienia do wystawiania dokumentów w tej firmie.</p>}
    {state?.canCreate && <details><summary className="cursor-pointer text-sm">Utwórz magazyn firmy</summary><form className="grid md:grid-cols-4 gap-3 mt-3" onSubmit={async e => { e.preventDefault(); if (await command({ action: "createWarehouse", name, code, currency })) { setName(""); setCode(""); } }}>
      <label className="text-sm">Nazwa<Input value={name} onChange={e => setName(e.target.value)} required maxLength={120} disabled={busy} /></label>
      <label className="text-sm">Kod<Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required maxLength={20} pattern="[A-Z0-9_-]+" disabled={busy} /></label>
      <label className="text-sm">Waluta wyceny<Select value={currency} onChange={e => setCurrency(e.target.value)} disabled={busy}>{["PLN", "EUR", "USD", "GBP", "CHF", "CZK", "SEK", "NOK", "DKK"].map(c => <option key={c}>{c}</option>)}</Select></label>
      <Button className="self-end" disabled={busy}>Utwórz magazyn</Button>
    </form><p className="text-xs text-muted-foreground mt-2">Kod musi być unikalny w magazynach właściciela. Historyczne magazyny nie są automatycznie przypisywane do firmy.</p></details>}
    {state?.canWrite && <>
      <CancelDocuments companyId={companyId} warehouses={state.warehouses} busy={busy} command={command} />
      <details><summary className="cursor-pointer text-sm">Przyjęcie, wydanie lub przesunięcie</summary>
        <form className="space-y-3 mt-3" onSubmit={async e => { e.preventDefault(); if (await command({ action: "document", warehouseId, targetWarehouseId: type === "MM" ? targetId : undefined, type, issueDate, lines: lines.map(l => ({ ...l, quantity: Number(l.quantity), unitPriceNet: Number(l.unitPriceNet) })) })) setLines([newLine()]); }}>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm">Magazyn<Select required disabled={busy} value={warehouseId} onChange={e => { setWarehouseId(e.target.value); setTargetId(""); }}><option value="">Wybierz magazyn</option>{active.map(w => <option key={w.id} value={w.id}>{w.code} · {w.currency}</option>)}</Select></label>
            <label className="text-sm">Operacja<Select value={type} onChange={e => setType(e.target.value)} disabled={busy}>{Object.entries({ PZ: "PZ — przyjęcie", WZ: "WZ — wydanie", PW: "PW — przychód wewnętrzny", RW: "RW — rozchód wewnętrzny", MM: "MM — przesunięcie" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
            <label className="text-sm">Data<Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} required disabled={busy} /></label>
          </div>
          {type === "MM" && <label className="block text-sm">Magazyn docelowy<Select value={targetId} onChange={e => setTargetId(e.target.value)} required disabled={busy}><option value="">Wybierz magazyn docelowy</option>{active.filter(w => w.id !== warehouseId && w.currency === selected?.currency).map(w => <option key={w.id} value={w.id}>{w.code}</option>)}</Select></label>}
          <p className="text-xs text-muted-foreground">Przy wydaniu i przesunięciu wycena pochodzi ze średniej ceny magazynowej. Wpisuj istniejące SKU i zgodne jednostki. Ujemne stany są zablokowane.</p>
          {lines.map((line, index) => <fieldset key={index} className="border rounded-xl p-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6"><legend className="text-xs">Pozycja {index + 1}</legend>{Object.entries({ sku: "SKU", name: "Nazwa", unit: "Jednostka", quantity: "Ilość", unitPriceNet: `Cena netto (${selected?.currency || "waluta"})` }).map(([key, label]) => <label key={key} className="text-xs">{label}<Input required disabled={busy || (key === "unitPriceNet" && ["WZ", "RW", "MM"].includes(type))} type={["quantity", "unitPriceNet"].includes(key) ? "number" : "text"} min={key === "quantity" ? "0.001" : key === "unitPriceNet" ? "0" : undefined} step={key === "quantity" ? "0.001" : key === "unitPriceNet" ? "0.01" : undefined} value={line[key as keyof typeof line]} onChange={e => setLines(previous => previous.map((l, i) => i === index ? { ...l, [key]: e.target.value } : l))} /></label>)}<Button type="button" variant="ghost" disabled={busy || lines.length === 1} onClick={() => setLines(previous => previous.filter((_, i) => i !== index))}>Usuń pozycję</Button></fieldset>)}
          <div className="flex gap-2 flex-wrap"><Button type="button" variant="ghost" disabled={busy || lines.length >= 200} onClick={() => setLines(previous => [...previous, newLine()])}>Dodaj pozycję</Button><Button disabled={busy || !warehouseId}>Zapisz dokument</Button></div>
        </form>
      </details>
      <details ref={stocktakingPanel} id="stocktakings"><summary className="cursor-pointer text-sm">Remanenty</summary><div className="mt-3 space-y-4">
        <form className="flex flex-wrap gap-3 items-end" onSubmit={e => { e.preventDefault(); void command({ action: "openStocktaking", warehouseId, countDate: issueDate }); }}>
          <label className="text-sm">Magazyn<Select required value={warehouseId} onChange={e => setWarehouseId(e.target.value)} disabled={busy}><option value="">Wybierz magazyn</option>{active.map(w => <option key={w.id} value={w.id}>{w.code}</option>)}</Select></label>
          <label className="text-sm">Data spisu<Input type="date" required value={issueDate} onChange={e => setIssueDate(e.target.value)} disabled={busy} /></label><Button disabled={busy || !warehouseId}>Otwórz remanent</Button>
        </form>
        <p className="text-xs text-muted-foreground">Otwarty remanent blokuje ruchy magazynowe do zamknięcia lub anulowania. Każdą pozycję należy policzyć i zapisać. Anulowanie arkusza nie zmienia stanów.</p>
        {state.stocktakings.map(inventory => <StocktakingEditor key={inventory.id} inventory={inventory} busy={busy} command={command} />)}
      </div></details>
    </>}
  </section>;
}

function CancelDocuments({ companyId, warehouses, busy, command }: { companyId: string; warehouses: Warehouse[]; busy: boolean; command: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [warehouseId, setWarehouseId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  const [rows, setRows] = React.useState<{ id: string; number: string; status: string; warehouseId: string }[]>([]);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    const control = new AbortController(); setRows([]); setError("");
    const timer = setTimeout(async () => {
      if (!warehouseId) return;
      try {
        const query = new URLSearchParams({ companyId, warehouseId, search, view: "documents" });
        const response = await fetch(`/api/warehouse/overview?${query}`, { signal: control.signal }), data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!control.signal.aborted) setRows(data.rows);
      } catch (e) { if (!control.signal.aborted) setError(e instanceof Error ? e.message : "Błąd pobierania dokumentów."); }
    }, 250);
    return () => { clearTimeout(timer); control.abort(); };
  }, [companyId, warehouseId, search, revision]);
  return <details><summary className="cursor-pointer text-sm">Anulowanie dokumentu magazynowego</summary><div className="space-y-3 mt-3">
    <p className="text-xs text-muted-foreground">Anulowanie zapisuje ruchy odwrotne, nie usuwa historii. Para MM jest anulowana razem. Wyświetlane jest do 30 wyników — zawęź wyszukiwanie numerem.</p>
    <label className="block text-sm">Magazyn<Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} disabled={busy}><option value="">Wybierz magazyn</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.code}</option>)}</Select></label>
    <Input aria-label="Numer dokumentu do anulowania" placeholder="Numer dokumentu…" value={search} onChange={e => setSearch(e.target.value)} />
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-xl p-2"><span className="text-sm">{row.number}</span><Button variant="ghost" disabled={busy || row.status !== "issued"} onClick={async () => {
      const reason = window.prompt(`Podaj powód anulowania ${row.number}:`);
      if (!reason?.trim()) return;
      if (await command({ action: "cancelDocument", warehouseId: row.warehouseId, documentId: row.id, reason })) setRevision(n => n + 1);
    }}>{row.status === "cancelled" ? "Anulowany" : "Anuluj dokument"}</Button></div>)}
  </div></details>;
}

function StocktakingEditor({ inventory, busy, command }: { inventory: StocktakingDto; busy: boolean; command: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [counts, setCounts] = React.useState<Record<string, string>>(() => Object.fromEntries(inventory.lines.map(l => [l.sku, l.counted ? String(l.countedQuantity) : ""])));
  const [page, setPage] = React.useState(0);
  const sourceVersion = React.useRef(inventory.updatedAt);
  React.useEffect(() => {
    if (sourceVersion.current === inventory.updatedAt) return;
    sourceVersion.current = inventory.updatedAt;
    setCounts(Object.fromEntries(inventory.lines.map(l => [l.sku, l.counted ? String(l.countedQuantity) : ""])));
  }, [inventory.updatedAt, inventory.lines]);
  const pageSize = 25, pages = Math.max(1, Math.ceil(inventory.lines.length / pageSize));
  const visible = inventory.lines.slice(page * pageSize, (page + 1) * pageSize);
  const changes = visible.filter(line => counts[line.sku] !== "" && counts[line.sku] !== (line.counted ? String(line.countedQuantity) : ""));
  const base = { warehouseId: inventory.warehouseId, stocktakingId: inventory.id, version: inventory.updatedAt };
  const dirty = inventory.lines.some(line => counts[line.sku] !== (line.counted ? String(line.countedQuantity) : ""));
  return <details className="rounded-xl border p-3"><summary className="cursor-pointer">{inventory.number} · {inventory.warehouseName} · {inventory.lines.filter(l => l.counted).length}/{inventory.lines.length} policzonych</summary>
    <form className="space-y-2 mt-3" onSubmit={e => { e.preventDefault(); if (changes.length) void command({ ...base, action: "saveStocktaking", counts: changes.map(l => ({ sku: l.sku, countedQuantity: Number(counts[l.sku]) })) }); }}>
      <p className="text-xs">Strona {page + 1} z {pages}. Zapisz zmienione ilości przed przejściem do następnej strony. Puste pole oznacza pozycję jeszcze niepoliczoną.</p>
      {visible.map(line => <label key={line.sku} className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-3 text-sm"><span className="break-words">{line.sku} · {line.name} ({line.unit})<span className="block text-xs text-muted-foreground">Stan księgowy: {line.expectedQuantity}</span></span><Input aria-label={`Policzona ilość ${line.sku}`} type="number" min="0" step="0.001" required={line.counted} disabled={busy} value={counts[line.sku] ?? ""} onChange={e => setCounts(previous => ({ ...previous, [line.sku]: e.target.value }))} /></label>)}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !changes.length}>Zapisz tę stronę</Button><Button type="button" variant="ghost" disabled={busy || dirty || page === 0} onClick={() => setPage(n => n - 1)}>Poprzednia</Button><Button type="button" variant="ghost" disabled={busy || dirty || page + 1 >= pages} onClick={() => setPage(n => n + 1)}>Następna</Button><Button type="button" disabled={busy || dirty || inventory.lines.some(l => !l.counted)} onClick={() => { if (window.confirm("Zamknąć remanent i zaksięgować różnice zapisanych ilości?")) void command({ ...base, action: "closeStocktaking" }); }}>Zamknij i skoryguj stany</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { if (window.confirm("Anulować arkusz bez zmiany stanów?")) void command({ ...base, action: "cancelStocktaking" }); }}>Anuluj arkusz</Button></div>
    </form>
  </details>;
}
