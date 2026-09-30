"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";

type Data = {
  settings: { id: string; invoiceId: string; enabled: boolean }[];
  deliveries: { id: string; status: string; error: string | null; recipient: string | null }[];
};

export default function RemindersPage() {
  const { selectedCompanyId: companyId, invoices } = useAppStore();
  const [data, setData] = useState<Data | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [retry, setRetry] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(""); setRetry(null); setInvoiceId("");
    if (companyId) {
      fetch("/api/due-reminders?companyId=" + companyId, { signal: controller.signal })
        .then(async response => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          return body;
        })
        .then(setData)
        .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    }
    return () => controller.abort();
  }, [companyId, version]);

  async function save(payload: Record<string, unknown>) {
    const snapshot = companyId;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/due-reminders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: snapshot, ...payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (useAppStore.getState().selectedCompanyId === snapshot) setVersion(value => value + 1);
    } catch (reason) {
      if (useAppStore.getState().selectedCompanyId === snapshot) setError(reason instanceof Error ? reason.message : "Błąd operacji.");
    } finally { setBusy(false); }
  }

  const available = invoices.filter(invoice => invoice.sellerCompanyId === companyId && invoice.type === "sale" && !invoice.isProforma && !invoice.isCorrection);
  const number = (id: string) => invoices.find(invoice => invoice.id === id)?.number || id;
  return (
    <div className="space-y-5">
      <PageHeader title="Przypomnienia płatności" description="Automatyczne e-maile 3 dni przed terminem, w dniu terminu i 7 dni po terminie. Włącz je dla wybranych faktur." />
      {!companyId && <p>Wybierz firmę w górnym pasku.</p>}
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      <Card className="space-y-3 p-4">
        <Label htmlFor="reminder-invoice">Faktura sprzedaży</Label>
        <Select id="reminder-invoice" aria-label="Faktura sprzedaży" value={invoiceId} onChange={event => setInvoiceId(event.target.value)} disabled={busy}>
          <option value="">Wybierz fakturę</option>
          {available.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number} · termin {invoice.dueDate}</option>)}
        </Select>
        <Button disabled={busy || !available.some(invoice => invoice.id === invoiceId)} onClick={() => void save({ invoiceId, enabled: true })}>Włącz przypomnienia e-mail</Button>
        <p className="text-sm text-muted-foreground">Wiadomości trafiają na adres e-mail kontrahenta. Wysyłka wymaga konfiguracji poczty przez operatora.</p>
      </Card>
      <div className="space-y-3">
        {data?.settings.map(setting => (
          <Card key={setting.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1 break-words"><p className="font-medium">{number(setting.invoiceId)}</p><p className="text-sm text-muted-foreground">{setting.enabled ? "Włączone" : "Wyłączone"}</p></div>
            <Button variant="outline" disabled={busy} onClick={() => void save({ invoiceId: setting.invoiceId, enabled: !setting.enabled })}>{setting.enabled ? "Wyłącz" : "Włącz"}</Button>
          </Card>
        ))}
      </div>
      <h2 className="font-semibold">Ostatnie wiadomości e-mail</h2>
      {data && !data.deliveries.length && <p className="text-sm text-muted-foreground">Brak wysłanych przypomnień.</p>}
      {data?.deliveries.map(delivery => (
        <Card key={delivery.id} className="space-y-2 break-words p-4">
          <p className="text-sm">{delivery.recipient || "Brak odbiorcy"} · {delivery.status}</p>
          {delivery.error && <p className="text-sm text-muted-foreground">{delivery.error}</p>}
          {["failed", "verify_needed"].includes(delivery.status) && <Button variant="outline" disabled={busy} onClick={() => setRetry(delivery.id)}>Ponów po sprawdzeniu</Button>}
        </Card>
      ))}
      <ConfirmDialog open={!!retry} onClose={() => setRetry(null)} title="Ponowić wiadomość?" confirmLabel="Ponów wiadomość" danger={false}
        description="Sprawdź historię dostawcy poczty. Przy niepewnym wyniku poprzednia wiadomość mogła zostać doręczona; ponowienie może wysłać duplikat."
        onConfirm={() => { if (retry) void save({ action: "retry", id: retry }); setRetry(null); }} />
    </div>
  );
}
