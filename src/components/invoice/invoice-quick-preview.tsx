"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, FileText } from "lucide-react";
import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KsefStatusBadge } from "./ksef-status-badge";
import { ksefPresentation } from "@/lib/ksef/presentation";
import { formatDate, formatMoney, invoiceTotals, round2 } from "@/lib/format";
import { invoicePaymentPresentation } from "@/lib/invoice-payment-presentation";
import type { Contractor, Invoice } from "@/lib/types";

const PAYMENT_LABELS: Record<string, string> = { transfer: "Przelew", cash: "Gotówka", card: "Karta", blik: "BLIK", compensation: "Kompensata" };

export function InvoiceQuickPreview({ invoice, contractor, onClose }: { invoice: Invoice; contractor?: Contractor | null; onClose: () => void }) {
  const calculated = invoiceTotals(invoice);
  const total = { net: invoice.totalNet ?? calculated.net, vat: invoice.totalVat ?? calculated.vat, gross: invoice.totalGross ?? calculated.gross };
  const status = invoicePaymentPresentation(invoice);
  const ksef = ksefPresentation(invoice);
  const paid = invoice.paidAmount ?? 0;
  const remaining = Math.max(0, round2(total.gross - paid));
  const kind = invoice.isCorrection ? "Faktura korygująca" : invoice.isProforma ? "Proforma" : invoice.type === "purchase" ? "Faktura zakupowa" : "Faktura sprzedaży";
  return <SidePanel title={invoice.number || "Dokument bez numeru"} description={`${kind} · szybki podgląd`} onClose={onClose} footer={<>
    <Button variant="ghost" onClick={onClose}>Wróć do listy</Button>
    <Link prefetch={false} href={`/invoices/${encodeURIComponent(invoice.id)}`} className="ui-detail-link">Otwórz szczegóły <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
  </>}>
    <div className="space-y-6">
      <section aria-label="Wartość i płatność" className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{invoice.isCorrection ? "Zmiana wartości brutto" : "Wartość brutto"}</span><Badge className={status.color}>{status.label}</Badge></div>
        <p className="mt-3 break-words text-3xl font-semibold leading-tight tracking-tight tabular-nums">{formatMoney(total.gross, invoice.currency)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-primary/10 pt-4 text-sm">
          <div><dt className="text-xs text-muted-foreground">Netto</dt><dd className="mt-1 font-medium tabular-nums">{formatMoney(total.net, invoice.currency)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">VAT</dt><dd className="mt-1 font-medium tabular-nums">{formatMoney(total.vat, invoice.currency)}</dd></div>
        </dl>
        {!invoice.isCorrection && <dl className="mt-4 flex flex-wrap justify-between gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Wpłacono</dt><dd className="mt-1 tabular-nums">{formatMoney(paid, invoice.currency)}</dd></div><div className="text-right"><dt className="text-xs text-muted-foreground">Pozostało do zapłaty</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(remaining, invoice.currency)}</dd></div></dl>}
      </section>

      <section aria-label="Kontrahent"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{invoice.type === "purchase" ? "Sprzedawca" : "Nabywca"}</h3>
        <p className="mt-2 break-words text-base font-semibold leading-6">{contractor?.name || "Klient detaliczny"}</p>
        {contractor?.nip && <p className="mt-1 text-sm text-muted-foreground">NIP: <span className="tabular-nums">{contractor.nip}</span></p>}
      </section>

      <section aria-label="Daty i sposób płatności" className="rounded-xl border border-border/70 p-4"><h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />Daty i płatność</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
          {[['Wystawiono', formatDate(invoice.issueDate)], ['Data sprzedaży', formatDate(invoice.saleDate)], ['Termin płatności', formatDate(invoice.dueDate)], ['Sposób płatności', PAYMENT_LABELS[invoice.paymentMethod] || invoice.paymentMethod || '—']].map(([label,value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{value}</dd></div>)}
        </dl>
      </section>

      <section aria-label="KSeF w podglądzie"><div className="flex items-start justify-between gap-4"><h3 className="text-sm font-semibold">KSeF</h3><KsefStatusBadge invoice={invoice} /></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{ksef.detail}</p>
        {ksef.number && <p className="mt-2 break-all text-xs tabular-nums text-muted-foreground">Numer KSeF: {ksef.number}</p>}
        {ksef.rejectionMessage && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm leading-6">{ksef.rejectionMessage}</p>}
      </section>

      <section aria-label="Pozycje w podglądzie"><h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-muted-foreground" aria-hidden="true" />Pozycje <span className="ml-auto text-xs font-normal text-muted-foreground">{invoice.lines.length}</span></h3>
        <ol className="mt-3 divide-y divide-border/60">{invoice.lines.slice(0, 5).map((line,index) => <li key={line.id || index} className="flex items-start gap-3 py-3 text-sm"><span className="mt-0.5 text-xs tabular-nums text-muted-foreground">{index + 1}.</span><div className="min-w-0"><p className="break-words font-medium leading-6">{line.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{line.quantity.toLocaleString('pl-PL')} {line.unit} · {formatMoney(line.netPrice, invoice.currency)} netto / jedn.</p></div></li>)}</ol>
        {invoice.lines.length > 5 && <p className="mt-2 text-xs text-muted-foreground">Pozostałe pozycje ({invoice.lines.length - 5}) znajdziesz w szczegółach dokumentu.</p>}
      </section>
      {invoice.isCorrection && invoice.originalInvoiceNumber && <p className="rounded-xl bg-muted/40 p-3 text-sm leading-6">Korekta do: <strong>{invoice.originalInvoiceNumber}</strong>{invoice.correctionReason && <span className="mt-1 block break-words text-muted-foreground">{invoice.correctionReason}</span>}</p>}
    </div>
  </SidePanel>;
}
