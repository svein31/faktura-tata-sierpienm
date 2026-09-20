"use client";

import * as React from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { WarehouseOperations } from "@/components/warehouse-operations";

type View = "stock" | "documents" | "movements";
type Row = { id: string; warehouseId: string; sku?: string; name?: string; unit?: string; quantity?: number; reserved?: number; available?: number; minQuantity?: number; isLowStock?: boolean; location?: string; number?: string; type?: string; status?: string; issueDate?: string; contractorName?: string; lines?: { sku: string; name: string; unit: string; quantity: number }[]; quantityChange?: number; quantityBefore?: number; quantityAfter?: number; createdAt?: string };
type Result = { warehouses: { id: string; code: string; name: string; isActive: boolean }[]; rows: Row[]; nextCursor: string | null; total: number };
const qty = (value?: number) => (value ?? 0).toLocaleString("pl-PL", { maximumFractionDigits: 3 });
const views: Record<View, string> = { stock: "Stany towarów", documents: "Dokumenty", movements: "Historia ruchów" };
const statuses: Record<string, string> = { issued: "Wystawiony", cancelled: "Anulowany", draft: "Szkic" };

export default function WarehousePage() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const [legacy, setLegacy] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  // Remount immediately on company/archive changes: old responses and rows cannot leak into the new view.
  const scope = legacy ? "legacy" : companyId;
  return <div className="page space-y-4">
    <PageHeader title="Magazyn" description="Podgląd stanów, dokumentów i historii zmian w wybranej firmie." />
    <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={legacy} onChange={e => setLegacy(e.target.checked)} />Archiwum własnych magazynów bez przypisanej firmy</label>
    {legacy && <p className="rounded-xl border p-3 text-sm">Archiwum nie dotyczy firmy wybranej w górnym pasku. Historyczne magazyny nie są automatycznie przypisywane ani przenoszone.</p>}
    {companyId && !legacy && <WarehouseOperations key={companyId} companyId={companyId} onChange={() => setRevision(n => n + 1)} />}
    {scope ? <Inventory key={`${companyId}:${scope}:${revision}`} scope={scope} /> : <p>Wybierz firmę, aby zobaczyć jej magazyny.</p>}
  </div>;
}

function Inventory({ scope }: { scope: string }) {
  const [view, setView] = React.useState<View>("stock");
  const [warehouseId, setWarehouseId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [lowOnly, setLowOnly] = React.useState(false);
  const [item, setItem] = React.useState<{ id: string; name: string } | null>(null);
  const [reload, setReload] = React.useState(0);
  const query = new URLSearchParams({ companyId: scope, view, warehouseId, search, lowOnly: String(lowOnly), ...(view === "movements" && item ? { itemId: item.id } : {}) }).toString();
  const [state, setState] = React.useState<{ query: string; data: Result } | null>(null);
  const [loading, setLoading] = React.useState(true), [error, setError] = React.useState("");
  const [errorQuery, setErrorQuery] = React.useState("");
  const generation = React.useRef(0);
  const controller = React.useRef<AbortController | null>(null);
  const data = state?.query === query ? state.data : null;

  const load = React.useCallback(async (cursor?: string) => {
    controller.current?.abort();
    const control = new AbortController(); controller.current = control;
    const attempt = ++generation.current;
    setLoading(true); setError(""); setErrorQuery(query);
    try {
      const response = await fetch(`/api/warehouse/overview?${query}${cursor ? `&cursor=${cursor}` : ""}`, { signal: control.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się pobrać danych magazynu.");
      if (attempt !== generation.current) return;
      setState(previous => ({ query, data: { ...result, rows: cursor && previous?.query === query ? [...previous.data.rows, ...result.rows] : result.rows } }));
    } catch (e) {
      if (!control.signal.aborted && attempt === generation.current) setError(e instanceof Error ? e.message : "Błąd połączenia.");
    } finally { if (attempt === generation.current) setLoading(false); }
  }, [query]);

  React.useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => { clearTimeout(timer); ++generation.current; controller.current?.abort(); };
  }, [load, reload]);

  const warehouseName = (id: string) => data?.warehouses.find(w => w.id === id)?.code || "—";
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Poniższa historia jest tylko do odczytu. Operacje wykonasz w panelu powyżej. Historyczne rekordy bez waluty nie są uwzględniane w zbiorczej wycenie.</p>
    <div className="flex flex-wrap gap-2" aria-label="Widoki magazynu">{Object.entries(views).map(([key, label]) => <Button key={key} variant={view === key ? "primary" : "ghost"} aria-pressed={view === key} onClick={() => { setView(key as View); setItem(null); }}>{label}</Button>)}</div>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">Magazyn<Select value={warehouseId} onChange={e => { setWarehouseId(e.target.value); setItem(null); }}>
        <option value="">Wszystkie w tym widoku</option>
        {(data?.warehouses || state?.data.warehouses || []).map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}{!w.isActive ? " (nieaktywny)" : ""}</option>)}
      </Select></label>
      <label className="text-sm">Szukaj<Input value={search} maxLength={120} onChange={e => setSearch(e.target.value)} placeholder={view === "documents" ? "Numer lub kontrahent…" : "Nazwa lub SKU…"} /></label>
    </div>
    {view === "stock" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />Tylko stany na poziomie minimum lub niższe</label>}
    {view === "movements" && item && <p className="text-sm">Historia: {item.name} <Button variant="ghost" onClick={() => setItem(null)}>Wszystkie towary</Button></p>}
    {error && errorQuery === query && <div role="alert" className="rounded-xl border border-rose-500 p-3">{error} <Button variant="ghost" onClick={() => setReload(n => n + 1)}>Spróbuj ponownie</Button></div>}
    {(loading || (!data && !error)) && <p role="status">Wczytywanie magazynu…</p>}
    {data && <>
      <div className="flex items-center justify-between gap-2"><p className="text-sm">Wyniki: {data.total} · Wczytano: {data.rows.length}</p><Button variant="ghost" disabled={loading} onClick={() => setReload(n => n + 1)}>Odśwież</Button></div>
      {!data.warehouses.length && <p className="rounded-xl border p-5">{scope === "legacy" ? "Nie masz magazynów w archiwum." : "Brak magazynów przypisanych do tej firmy. Starsze własne magazyny znajdziesz w archiwum powyżej."}</p>}
      {!!data.warehouses.length && !data.rows.length && <p className="rounded-xl border p-5">Brak wyników dla wybranych filtrów.</p>}
      <div className="space-y-3" aria-busy={loading}>{data.rows.map(row => <article key={row.id} className="rounded-xl border p-4 space-y-2">
        <div className="flex flex-wrap gap-2 justify-between"><h2 className="font-semibold break-words">{view === "documents" ? row.number : row.name}</h2><span className="text-xs text-muted-foreground">Magazyn: {warehouseName(row.warehouseId)}</span></div>
        {view === "stock" && <><p className="text-sm text-muted-foreground">SKU: {row.sku} {row.location ? `· Lokalizacja: ${row.location}` : ""}</p><dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">{[["Stan", row.quantity], ["Zarezerwowane", row.reserved], ["Dostępne", row.available], ["Minimum", row.minQuantity]].map(([label, value]) => <div key={String(label)}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{qty(value as number)} {row.unit}</dd></div>)}</dl>{row.isLowStock && <p className="text-sm text-amber-600">Stan na poziomie minimum lub niższy</p>}<Button variant="ghost" onClick={() => { setItem({ id: row.id, name: row.name || row.sku || "Towar" }); setView("movements"); setSearch(""); }}>Historia towaru</Button></>}
        {view === "documents" && <><p className="text-sm">{row.type} · {statuses[row.status || ""] || row.status} · {row.issueDate}</p>{row.contractorName && <p className="text-sm">{row.contractorName}</p>}<details><summary className="cursor-pointer text-sm">Pozycje dokumentu ({row.lines?.length || 0})</summary><ul className="mt-2 space-y-2 text-sm">{row.lines?.map((line, i) => <li key={i}>{line.sku} · {line.name}: {qty(line.quantity)} {line.unit}</li>)}</ul></details></>}
        {view === "movements" && <><p className="text-sm text-muted-foreground">SKU: {row.sku} · {row.createdAt ? new Date(row.createdAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : ""}</p><p className="text-sm">Przed: {qty(row.quantityBefore)} · Zmiana: {(row.quantityChange || 0) > 0 ? "+" : ""}{qty(row.quantityChange)} · Po: {qty(row.quantityAfter)}</p></>}
      </article>)}</div>
      {data.nextCursor && <Button disabled={loading} onClick={() => load(data.nextCursor!)}>Wczytaj następne 30</Button>}
    </>}
  </div>;
}
