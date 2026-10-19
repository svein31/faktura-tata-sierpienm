"use client";

import { Check, Clock, Download, RefreshCw, AlertCircle } from "lucide-react";
import { ksefPresentation } from "@/lib/ksef/presentation";
import { formatDateTime } from "@/lib/format";
import type { Invoice } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface InvoiceStatusTimelineProps {
  invoice: Invoice;
  onRefreshStatus?: () => void;
  onDownloadUpo?: (ksefNumber: string) => void;
  onDownloadXml?: (ksefNumber: string) => void;
  isRefreshing?: boolean;
}
export function InvoiceStatusTimeline({ invoice, onRefreshStatus, onDownloadUpo, onDownloadXml, isRefreshing = false }: InvoiceStatusTimelineProps) {
  const status = ksefPresentation(invoice);
  if (status.excluded) return <section aria-label="Status KSeF" className="surface-card p-4 sm:p-5"><h3 className="text-sm font-semibold">{status.label}</h3><p className="mt-2 text-sm text-muted-foreground">{invoice.isProforma ? "Proforma nie jest fakturą VAT i nie jest wysyłana do KSeF." : status.detail}</p></section>;
  return <section aria-label="Status KSeF" className="surface-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h3 className="text-base font-semibold">Obieg dokumentu w KSeF</h3>
        <p className="mt-1 text-sm text-muted-foreground">Zapisana → W kolejce → Wysłana → Przyjęta</p>
        {status.environment && status.environment !== "production" && <p className="mt-2 text-xs font-medium text-finance-office">{status.simulated ? "Symulacja demo · nie potwierdza przyjęcia w urzędowym KSeF" : "Środowisko testowe · dokument nie jest fakturą produkcyjną"}</p>}
      </div>
      {onRefreshStatus && <Button variant="outline" size="sm" onClick={onRefreshStatus} loading={isRefreshing}>
        {!isRefreshing && <RefreshCw className="size-3.5" aria-hidden="true" />}Sprawdź status
      </Button>}
    </div>
    <div role="status" aria-live="polite" className={`mt-4 rounded-xl border p-3.5 ${status.rejected ? "border-rose-500/25 bg-rose-500/5" : "border-border/60 bg-muted/20"}`}>
      <p className="flex items-center gap-2 text-sm font-semibold">{status.rejected && <AlertCircle className="size-4 text-finance-expense" aria-hidden="true" />}{status.label}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{status.detail}</p>
      {status.rejectionMessage && <div className="mt-3 border-t border-rose-500/15 pt-3 text-xs leading-relaxed"><p className="font-medium">Komunikat KSeF:</p><p className="mt-1 whitespace-pre-wrap break-words">{status.rejectionMessage}</p></div>}
      {status.number && <p className="mt-3 break-all font-mono text-xs text-muted-foreground">Numer KSeF: {status.number}</p>}
    </div>
    <ol className="mt-4 grid gap-2 md:grid-cols-5" aria-label="Etapy obsługi KSeF">
      {status.steps.map((step,index) => <li key={step.id} aria-current={step.state === "current" ? "step" : undefined}
        data-step={step.id} data-state={step.state} className={`min-w-0 rounded-xl border p-3 ${step.state === "error" ? "border-rose-500/30 bg-rose-500/5" : step.state === "current" ? "border-primary/30 bg-primary/5" : "border-border/60"}`}>
        <div className="flex items-center gap-2"><span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${step.state === "completed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
          {step.state === "completed" ? <Check className="size-3.5" /> : step.state === "current" ? <Clock className="size-3.5" /> : index+1}
        </span><span className="text-xs font-semibold">{step.label}</span></div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{step.description}</p>
        <span className="sr-only">{step.state === "completed" ? "Zakończono" : step.state === "current" ? "W toku" : step.state === "error" ? "Odrzucono" : "Oczekuje"}</span>
        {step.timestamp && <p className="mt-2 text-[10px] tabular-nums text-muted-foreground">{formatDateTime(step.timestamp)}</p>}
      </li>)}
    </ol>
    {status.number && <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
      {onDownloadUpo && status.hasUpo && <Button variant="outline" size="sm" onClick={() => onDownloadUpo(status.number!)}><Download className="size-3.5" aria-hidden="true" />{status.simulated ? "Potwierdzenie demo" : "Pobierz UPO"}</Button>}
      {onDownloadXml && <Button variant="ghost" size="sm" onClick={() => onDownloadXml(status.number!)}><Download className="size-3.5" aria-hidden="true" />Pobierz XML faktury</Button>}
    </div>}
  </section>;
}
