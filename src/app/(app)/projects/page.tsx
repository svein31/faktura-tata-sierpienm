"use client";
import * as React from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { projectDetails } from "@/lib/projects";
type Detail = Awaited<ReturnType<typeof projectDetails>> & { nextCursor: string | null };
type Project = Detail["project"];
type Candidate = { id: string; number: string; currency?: string };
const money = (value: number, currency: string) => new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(value);

export default function ProjectsPage() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  return <div className="page space-y-4"><PageHeader title="Rentowność projektów" description="Przychody, zatwierdzone koszty, materiały i czas pracy — osobno dla każdej waluty." />{companyId ? <Workspace key={companyId} companyId={companyId} /> : <p>Wybierz firmę.</p>}</div>;
}
function Workspace({ companyId }: { companyId: string }) {
  const [projects, setProjects] = React.useState<Project[]>([]), [next, setNext] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Detail | null>(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
  const [name, setName] = React.useState(""), [basis, setBasis] = React.useState("documents");
  const [kind, setKind] = React.useState("invoice"), [search, setSearch] = React.useState(""), [candidates, setCandidates] = React.useState<Candidate[]>([]), [candidateNext, setCandidateNext] = React.useState<string | null>(null);
  const [materialPurchase, setMaterialPurchase] = React.useState(false);
  const [time, setTime] = React.useState({ workDate: "", description: "", minutes: "", hourlyCost: "", currency: "PLN" });
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const get = React.useCallback(async (params: Record<string, string> = {}) => {
    const res = await fetch(`/api/projects?${new URLSearchParams({ companyId, ...params })}`);
    const data = await res.json(); if (!res.ok) throw new Error(data.error); return data;
  }, [companyId]);
  const list = React.useCallback(async (cursor?: string) => {
    const data = await get(cursor ? { cursor } : {});
    if (alive.current) { setProjects(prev => cursor ? [...prev, ...data.projects] : data.projects); setNext(data.nextCursor); }
  }, [get]);
  React.useEffect(() => { void list().catch(e => { if (alive.current) setError(e.message); }); }, [list]);
  const work = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await operation(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Nie udało się wykonać operacji."); }
    finally { if (alive.current) setBusy(false); }
  };
  const open = async (id: string, cursor?: string) => {
    const data = await get({ projectId: id, ...(cursor ? { cursor } : {}) });
    if (alive.current) setDetail(prev => cursor && prev?.project.id === id ? { ...data, entries: [...prev.entries, ...data.entries] } : data);
  };
  const command = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, projectId: detail?.project.id, version: detail?.project.version, ...body }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    if (alive.current) { await list(); await open(data.id); }
  };
  const find = async (cursor?: string) => {
    const data = await get({ kind, search, ...(cursor ? { cursor } : {}) });
    if (alive.current) { setCandidates(prev => cursor ? [...prev, ...data.candidates] : data.candidates); setCandidateNext(data.nextCursor); }
  };
  const active = detail?.project.status === "active";
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded border border-rose-500 p-3">{error} <Button variant="ghost" disabled={busy} onClick={() => work(() => detail ? open(detail.project.id) : list())}>Odśwież</Button></p>}
    <details className="rounded-xl border p-4"><summary>Nowy projekt</summary><div className="grid gap-3 mt-3 sm:grid-cols-2">
      <label>Nazwa<Input value={name} maxLength={150} onChange={e => setName(e.target.value)} /></label>
      <label>Materiały w wyniku<Select value={basis} onChange={e => setBasis(e.target.value)}><option value="documents">Według dokumentów zakupu</option><option value="consumption">Według zużycia RW/WZ</option></Select></label>
      <p className="text-sm sm:col-span-2">Wybierz jedną podstawę wyceny materiałów. Zakup i zużycie nie są odejmowane jednocześnie. Koszty usług i pracy są dodawane w obu wariantach.</p>
      <Button disabled={busy || !name.trim()} onClick={() => work(async () => { await command({ action: "create", name, materialBasis: basis }); setName(""); })}>Utwórz projekt</Button>
    </div></details>
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2">{projects.map(project => <button key={project.id} disabled={busy} onClick={() => work(async () => { await open(project.id); setCandidates([]); setCandidateNext(null); })} className={`block w-full border rounded-xl p-3 text-left ${detail?.project.id === project.id ? "border-primary" : ""}`}><strong className="block break-words">{project.name}</strong><span className="text-xs">{project.status === "active" ? "Aktywny" : "Zamknięty"}</span></button>)}{!projects.length && <p>Brak projektów.</p>}{next && <Button disabled={busy} onClick={() => work(() => list(next))}>Następne projekty</Button>}</div>
      {detail && <div className="min-w-0 space-y-4">
        <div className="rounded-xl border p-4 space-y-2"><h2 className="font-semibold">{detail.project.name}</h2><p className="text-sm">Materiały: {detail.project.materialBasis === "documents" ? "dokumenty zakupu" : "zużycie RW/WZ"}. Wynik netto, przed podatkiem. To bieżąca analiza, również po zamknięciu projektu — zmiany dokumentów źródłowych wpływają na wynik.</p>
          <Button disabled={busy} variant="ghost" onClick={() => work(async () => { const reason = window.prompt(active ? "Powód zamknięcia projektu:" : "Powód ponownego otwarcia:"); if (reason) await command({ action: active ? "close" : "reopen", reason }); })}>{active ? "Zamknij projekt" : "Otwórz ponownie"}</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">{detail.summary.map(row => <div key={row.currency} className="rounded-xl border p-4 text-sm space-y-1"><h3 className="font-semibold">{row.currency}</h3><p>Przychody: {money(row.revenue, row.currency)}</p><p>Usługi i pozostałe koszty: {money(row.costs, row.currency)}</p><p>Materiały w wyniku: {money(row.deductedMaterials, row.currency)}</p><p>Czas: {row.minutes} min · {money(row.time, row.currency)}</p><p className="font-bold">Wynik: {money(row.profit, row.currency)}</p><p>Marża: {row.marginPercent === null ? "—" : row.marginPercent + "%"}</p><details><summary>Dane materiałowe</summary><p>Zakupy: {money(row.materialPurchases, row.currency)}</p><p>Rozchody: {money(row.materials, row.currency)}</p></details></div>)}</div>
        {!detail.summary.length && <p>Dodaj dokumenty lub czas pracy, aby obliczyć wynik.</p>}
        {active && <details className="rounded-xl border p-4"><summary>Powiąż dokument</summary><p className="text-sm my-2">Cały dokument może należeć do jednego projektu. Zatwierdzone koszty przypisz jako materiały lub pozostałe koszty. Dokumenty źródłowe pozostają bez zmian.</p>
          <div className="flex flex-wrap gap-2"><Select disabled={busy} value={kind} onChange={e => { setKind(e.target.value); setCandidates([]); setCandidateNext(null); }}><option value="invoice">Faktura sprzedaży / zakupu</option><option value="expense">Koszt</option><option value="material">Rozchód materiałów RW/WZ</option></Select><Input value={search} aria-label="Numer dokumentu" placeholder="Numer dokumentu" onChange={e => { setSearch(e.target.value); setCandidates([]); setCandidateNext(null); }} /><Button disabled={busy} onClick={() => work(() => find())}>Szukaj</Button></div>
          {kind !== "material" && <label className="flex gap-2 text-sm my-3"><input type="checkbox" checked={materialPurchase} onChange={e => setMaterialPurchase(e.target.checked)} />Dokument kosztowy dotyczy zakupu materiałów</label>}
          {candidates.map(row => <div key={row.id} className="flex justify-between items-center gap-2 border-t py-2 text-sm"><span className="break-all">{row.number} {row.currency}</span><Button disabled={busy} variant="ghost" onClick={() => work(() => command({ action: "link", kind, sourceId: row.id, materialPurchase }))}>Powiąż</Button></div>)}
          {candidateNext && <Button disabled={busy} onClick={() => work(() => find(candidateNext))}>Następne dokumenty</Button>}
        </details>}
        {active && <details className="rounded-xl border p-4"><summary>Dodaj czas pracy</summary><div className="grid gap-2 sm:grid-cols-2 mt-3">
          {Object.entries({ workDate: "Data pracy", description: "Opis", minutes: "Liczba minut", hourlyCost: "Koszt godziny pracy", currency: "Waluta" }).map(([key, label]) => <label className="text-sm" key={key}>{label}<Input value={time[key as keyof typeof time]} type={key === "workDate" ? "date" : ["minutes", "hourlyCost"].includes(key) ? "number" : "text"} step={key === "hourlyCost" ? "0.01" : "1"} onChange={e => setTime(prev => ({ ...prev, [key]: e.target.value }))} /></label>)}
          <Button disabled={busy || time.minutes === "" || time.hourlyCost === ""} onClick={() => work(async () => { await command({ action: "time", ...time, minutes: Number(time.minutes), hourlyCost: Number(time.hourlyCost) }); setTime(prev => ({ ...prev, description: "", minutes: "" })); })}>Zapisz czas</Button>
        </div><p className="text-xs mt-2">Wpisz koszt pracy, nie stawkę sprzedaży. Nie dodawaj ponownie pracy już ujętej w powiązanej fakturze kosztowej.</p></details>}
        <div className="rounded-xl border p-4"><h3 className="font-semibold">Powiązania i czas pracy</h3>{detail.entries.map(entry => <div key={entry.id} className="border-t py-3 text-sm space-y-1"><p className="font-medium break-words">{entry.number}</p>{entry.amount && <p>{money(entry.amount.amount, entry.amount.currency)} · {entry.kind === "time" ? "czas pracy" : entry.kind === "material" ? "rozchód" : entry.materialPurchase ? "zakup materiałów" : "dokument"}</p>}{entry.reason && <p role="status">{entry.reason}</p>}{active && <Button disabled={busy} variant="ghost" onClick={() => work(async () => { const reason = window.prompt("Powód usunięcia wpisu z projektu (oryginał pozostanie bez zmian):"); if (reason) await command({ action: "unlink", entryId: entry.id, reason }); })}>Usuń powiązanie</Button>}</div>)}{detail.nextCursor && <Button disabled={busy} onClick={() => work(() => open(detail.project.id, detail.nextCursor!))}>Następne wpisy</Button>}</div>
      </div>}
    </div>
  </div>;
}
