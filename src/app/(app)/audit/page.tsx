"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { AuditLogEntry } from "@/lib/types";

export default function AuditPage() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [action, setAction] = useState("");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async (next?: string) => {
    const requestId = ++generation.current;
    setLoading(true); setError("");
    const params = new URLSearchParams({ limit: "50" });
    if (companyId) params.set("companyId", companyId);
    if (from) params.set("from", `${from}T00:00:00`);
    if (to) params.set("to", `${to}T23:59:59.999`);
    if (action) params.set("action", action);
    if (next) params.set("cursor", next);
    try {
      const res = await fetch(`/api/audit?${params}`), data = await res.json();
      if (!res.ok) throw new Error(data.error || "Nie udało się pobrać historii.");
      if (requestId !== generation.current) return;
      setLogs(previous => next ? [...previous, ...data.logs] : data.logs); setCursor(data.nextCursor);
    } catch (e) { if (requestId === generation.current) setError(e instanceof Error ? e.message : "Błąd historii."); }
    finally { if (requestId === generation.current) setLoading(false); }
  }, [companyId, from, to, action]);
  useEffect(() => { setLogs([]); setCursor(null); void load(); return () => { generation.current++; }; }, [load]);
  return <div>
    <PageHeader title="Dziennik zmian" description="Kto, co i kiedy zmienił w wybranej firmie." />
    <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
      <div><Label htmlFor="audit-from">Od</Label><Input id="audit-from" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
      <div><Label htmlFor="audit-to">Do</Label><Input id="audit-to" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      <div><Label htmlFor="audit-action">Zdarzenie</Label><Input id="audit-action" placeholder="np. invoice_updated" value={action} onChange={e => setAction(e.target.value)} /></div>
    </Card>
    {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
    {!loading && !logs.length && !error && <p>Brak wpisów dla wybranych filtrów.</p>}
    <div className="space-y-3">{logs.map(log => <Card key={log.id} className="p-4">
      <p className="text-sm font-semibold">{log.description || log.action}</p>
      <p className="text-xs text-muted-foreground">{log.userName || log.userEmail || "System"} · {new Date(log.createdAt).toLocaleString("pl-PL")} · {log.entityType}</p>
      {(log.diff || log.details) && <details className="mt-2 text-sm"><summary>Szczegóły zmiany</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(log.diff || log.details, null, 2)}</pre></details>}
    </Card>)}</div>
    {loading && <p role="status" className="mt-4">Ładowanie historii…</p>}
    {cursor && <Button className="mt-4" disabled={loading} onClick={() => void load(cursor)}>Pokaż starsze wpisy</Button>}
  </div>;
}
