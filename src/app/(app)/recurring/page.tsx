"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { warsawDate, addCalendarDays } from "@/lib/scheduling";

export default function RecurringPage() {
  const { invoices, selectedCompanyId, revalidate } = useAppStore();
  const available = invoices.filter(i => i.sellerCompanyId === selectedCompanyId && i.type === "sale" && !i.isCorrection);
  const templates = available.filter(i => i.isRecurring);
  const [invoiceId, setInvoiceId] = useState(""), [interval, setInterval] = useState("monthly");
  const [nextDate, setNextDate] = useState(addCalendarDays(warsawDate(), 1)), [autoSend, setAutoSend] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save(id: string, body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/invoices/${id}/recurrence`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Błąd harmonogramu.");
      await revalidate();
    } catch (e) { setError(e instanceof Error ? e.message : "Błąd harmonogramu."); }
    finally { setBusy(false); }
  }
  return <div><PageHeader title="Faktury cykliczne" description="Harmonogramy dla wybranej firmy. Daty według czasu w Polsce." />
    <Card className="mb-5 space-y-3 p-5">
      <Label htmlFor="recurring-template">Dokument źródłowy</Label><Select id="recurring-template" value={invoiceId} onChange={e => setInvoiceId(e.target.value)}><option value="">Wybierz fakturę</option>{available.map(i => <option key={i.id} value={i.id}>{i.number}</option>)}</Select>
      <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="recurring-interval">Powtarzanie</Label><Select id="recurring-interval" value={interval} onChange={e => setInterval(e.target.value)}><option value="weekly">Co tydzień</option><option value="monthly">Co miesiąc</option><option value="quarterly">Co kwartał</option><option value="yearly">Co rok</option></Select></div><div><Label htmlFor="recurring-date">Kolejny termin</Label><Input id="recurring-date" type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} /></div></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoSend} onChange={e => setAutoSend(e.target.checked)} />Kolejkuj automatycznie w KSeF (środowisko z ustawień konta)</label>
      <Button disabled={busy || !invoiceId || !available.some(i => i.id === invoiceId)} onClick={() => void save(invoiceId, { interval, nextDate, autoSend, paused: false })}>Zapisz harmonogram</Button>
    </Card>
    {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
    <div className="space-y-3">{templates.map(i => <Card key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{i.number}</p><p className="text-sm">Następny termin: {i.recurringNextDate} · {i.recurringPaused ? "Wstrzymany" : "Aktywny"}</p>{i.recurringLastError && <p role="alert" className="text-sm text-destructive">{i.recurringLastError}</p>}</div><Button variant="outline" disabled={busy} onClick={() => void save(i.id, { paused: !i.recurringPaused })}>{i.recurringPaused ? "Wznów" : "Wstrzymaj"}</Button></Card>)}</div>
    {!templates.length && <p>Brak harmonogramów w tej firmie.</p>}
  </div>;
}
