"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
type Row = { id: string; kind: "invoice" | "expense"; number: string; date: string; currency: string; totalGross: number; approved: boolean; bookedAt: string | null; revision: string; type: string };
type Data = { rows: Row[]; comments: { id: string; docId: string; authorName: string; message: string }[]; nextPage: number | null };
export default function AccountantPortal() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)), [page, setPage] = useState(0), [version, setVersion] = useState(0);
  const [data, setData] = useState<Data | null>(null), [selected, setSelected] = useState<string[]>([]), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [target, setTarget] = useState("generic");
  useEffect(() => { setPage(0); }, [companyId, month]);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setSelected([]); setError("");
    if (companyId) fetch(`/api/accountant/portal?companyId=${companyId}&month=${month}&page=${page}`, { signal: controller.signal }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [companyId, month, page, version]);
  async function act(action: string) {
    const snapshot = companyId; setBusy(true); setError("");
    try {
      const r = await fetch("/api/accountant/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: snapshot, action, message, items: data?.rows.filter(row => selected.includes(row.kind + row.id)).map(({ id, kind, revision }) => ({ id, kind, revision })) }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      if (useAppStore.getState().selectedCompanyId === snapshot) { setMessage(""); setVersion(v => v + 1); }
    } catch (e) { if (useAppStore.getState().selectedCompanyId === snapshot) setError(e instanceof Error ? e.message : "Błąd operacji."); } finally { setBusy(false); }
  }
  return <div className="space-y-5"><PageHeader title="Pulpit księgowy" description="Weryfikacja dokumentów, uwagi i status zaksięgowania w wybranej firmie." />
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Miesiąc<Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label><Link href="/cost-reviews" className="text-sm text-primary underline">Obieg kosztów</Link><Link href="/accountant" className="text-sm text-primary underline">Zamknięcie miesiąca</Link><Link href="/settings/team" className="text-sm text-primary underline">Uprawnienia i dostęp</Link></div>
    {!companyId && <p>Wybierz firmę w górnym pasku.</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
    <Card className="p-4"><div className="flex flex-wrap gap-2">{[["approve", "Zatwierdź koszty"], ["book", "Oznacz zaksięgowane"], ["unbook", "Cofnij zaksięgowanie"]].map(([action, label]) => <Button key={action} variant="outline" disabled={busy || !selected.length} onClick={() => act(action)}>{label}</Button>)}</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label="Uwaga do wybranych dokumentów" placeholder="Uwaga do wybranych dokumentów" maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} /><Button disabled={busy || !selected.length || !message.trim()} onClick={() => act("comment")}>Dodaj uwagę</Button></div></Card>
    <div className="space-y-3">{data?.rows.map(row => { const key = row.kind + row.id; return <Card className="p-4" key={key}><div className="flex flex-wrap items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" aria-label={"Wybierz " + row.number} checked={selected.includes(key)} onChange={e => setSelected(s => e.target.checked ? [...s, key] : s.filter(k => k !== key))} /><div className="min-w-0 flex-1"><Link className="break-words font-semibold text-primary" href={row.kind === "invoice" ? "/invoices/" + row.id : "/expenses"}>{row.number}</Link><p className="text-sm text-muted-foreground">{row.date} · {row.type === "sale" ? "Sprzedaż" : "Koszt"} · {row.bookedAt ? "Zaksięgowano" : row.approved ? "Zweryfikowano" : "Do weryfikacji"}</p></div><span className="text-sm font-semibold">{formatMoney(row.totalGross || 0, row.currency)}</span></div>{data.comments.filter(c => c.docId === row.id).map(c => <p key={c.id} className="mt-3 break-words rounded-lg bg-muted p-3 text-sm"><strong>{c.authorName}: </strong>{c.message}</p>)}</Card>; })}{data && !data.rows.length && <p>Brak dokumentów w tym miesiącu.</p>}</div>
    <div className="flex gap-2"><Button variant="outline" disabled={page === 0 || busy} onClick={() => setPage(p => p - 1)}>Poprzednie</Button><Button variant="outline" disabled={data?.nextPage == null || busy} onClick={() => setPage(data!.nextPage!)}>Następne</Button></div>
    <Card className="space-y-3 p-4"><h2 className="font-semibold">Paczka dokumentów dla księgowości</h2><Select aria-label="Program księgowy" value={target} onChange={e => setTarget(e.target.value)}>{[["generic", "Uniwersalna"], ["optima", "Optima"], ["rachmistrz", "Rachmistrz"], ["symfonia", "Symfonia"], ["enova", "Enova"]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Select><p className="text-sm text-muted-foreground">ZIP zawiera zestawienie CSV, zapisane XML KSeF i PDF faktur. CSV można mapować w programie księgowym; format nie jest natywnym schematem producenta.</p>{companyId && <a className="inline-block text-primary underline" href={`/api/accountant/package?companyId=${companyId}&month=${month}&target=${target}`}>Pobierz ZIP</a>}</Card>
  </div>;
}
