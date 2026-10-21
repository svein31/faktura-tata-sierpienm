"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { InvoiceSuggestions, SuggestedLine } from "@/lib/invoice-suggestions";
import type { PaymentMethod, Currency } from "@/lib/types";
import { formatMoney } from "@/lib/format";

const methodNames: Record<PaymentMethod, string> = { transfer: "Przelew", cash: "Gotówka", card: "Karta", blik: "BLIK", compensation: "Kompensata" };
export function InvoiceSuggestionsPanel({ companyId, contractorId, currency, onContractor, onLine, onTerms }: {
  companyId: string; contractorId: string; currency: Currency;
  onContractor: (id: string) => void; onLine: (line: SuggestedLine) => void;
  onTerms: (method: PaymentMethod, days: number) => void;
}) {
  const key = JSON.stringify([companyId, contractorId, currency]);
  const [state, setState] = React.useState<{ key: string; data: InvoiceSuggestions } | null>(null);
  const [failed, setFailed] = React.useState(false), [attempt, retry] = React.useReducer(n => n + 1, 0);
  React.useEffect(() => {
    const controller = new AbortController(); setFailed(false);
    const query = new URLSearchParams({ companyId, currency });
    if (contractorId) query.set("contractorId", contractorId);
    fetch("/api/invoices/suggestions?" + query, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("suggestions");
      return response.json() as Promise<InvoiceSuggestions>;
    }).then(data => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [key, companyId, contractorId, currency, attempt]);
  const data = state?.key === key ? state.data : null;
  if (failed) return <div className="rounded-md border p-3 text-xs text-muted-foreground">Podpowiedzi są chwilowo niedostępne. Możesz wypełnić formularz ręcznie. <button type="button" className="text-primary underline" onClick={retry}>Ponów</button></div>;
  if (!data || !data.contractors.length && !data.lines.length && !data.terms) return null;
  return <section aria-label="Podpowiedzi z ostatnich faktur" className="space-y-3 rounded-lg border bg-muted/20 p-3">
    <p className="text-xs font-medium text-muted-foreground">Z ostatnich faktur tej firmy · dane wstawisz dopiero po wybraniu</p>
    {!contractorId && data.contractors.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-xs">Kontrahenci:</span>{data.contractors.map(contact => <Button key={contact.id} variant="outline" size="sm" title={contact.nip} onClick={() => onContractor(contact.id)}>{contact.name}</Button>)}</div>}
    {data.lines.length > 0 && <div className="space-y-2"><p className="text-xs font-medium">Często używane pozycje · {currency}</p><div className="flex flex-wrap gap-2">{data.lines.map((line, index) => <Button key={index} variant="outline" size="sm" className="h-auto max-w-full whitespace-normal text-left" onClick={() => onLine(line)}>
      <span>Dodaj: {line.name} · {formatMoney(line.netPrice, currency)} netto / {line.unit}</span>
    </Button>)}</div></div>}
    {data.terms && <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs"><span>Warunki z {data.terms.sourceNumber}: {methodNames[data.terms.method]} · {data.terms.days} dni</span><Button variant="outline" size="sm" onClick={() => onTerms(data.terms!.method, data.terms!.days)}>Zastosuj warunki płatności</Button></div>}
  </section>;
}
