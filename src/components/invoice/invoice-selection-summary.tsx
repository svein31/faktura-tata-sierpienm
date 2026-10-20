import { formatMoney } from "@/lib/format";
import type { InvoiceCurrencyTotal } from "@/lib/invoice-selection-totals";

export function InvoiceSelectionSummary({totals}:{totals:InvoiceCurrencyTotal[]}) {
  return <section aria-label="Podsumowanie zaznaczonych dokumentów" className="basis-full border-t border-primary/15 pt-3">
    <p className="mb-3 text-xs text-muted-foreground">Suma wartości zaznaczonych dokumentów na bieżącej stronie, osobno dla każdej waluty.</p>
    <div className="grid gap-3 lg:grid-cols-2">{totals.map(total=><div key={total.currency} data-selection-currency={total.currency} className="rounded-xl border border-border/70 bg-card p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{total.currency}</h3><span className="text-xs text-muted-foreground">Dokumenty: {total.count}</span></div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">{([['Netto',total.net],['VAT',total.vat],['Brutto',total.gross]] as const).map(([label,value])=><div key={label} className="flex items-baseline justify-between gap-2 sm:block"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`break-words text-sm tabular-nums sm:mt-1 ${label==='Brutto'?'font-semibold':'font-medium'}`}>{formatMoney(value,total.currency)}</dd></div>)}</dl>
      {(total.drafts>0 || total.proformas>0)&&<p className="mt-3 text-xs leading-5 text-muted-foreground">W sumie uwzględniono{total.drafts>0?` szkice: ${total.drafts}`:''}{total.drafts>0&&total.proformas>0?' oraz':''}{total.proformas>0?` proformy: ${total.proformas}`:''}.</p>}
    </div>)}</div>
  </section>;
}
