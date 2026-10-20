"use client";
import { Check, Columns3, RotateCcw } from "lucide-react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { INVOICE_COLUMNS, type InvoiceColumnId } from "@/lib/invoice-columns";

export function InvoiceColumnsMenu({columns,toggle,reset}:{columns:InvoiceColumnId[];toggle:(id:InvoiceColumnId)=>void;reset:()=>void}) {
  return <DropdownMenu label="Widoczne kolumny faktur" minWidth={280} trigger={<Button variant="outline" className="hidden md:inline-flex" aria-label="Wybierz kolumny tabeli"><Columns3 className="size-4" aria-hidden="true" />Kolumny</Button>}>
    <div className="px-3 pb-2 pt-2 text-xs leading-5 text-muted-foreground">Dokument i akcje są zawsze widoczne.</div>
    {INVOICE_COLUMNS.map(column=><button key={column.id} type="button" role="menuitemcheckbox" aria-checked={columns.includes(column.id)} data-selected={columns.includes(column.id) || undefined} data-menu-keep-open onClick={()=>toggle(column.id)}>
      <span className="flex size-4 shrink-0 items-center justify-center rounded border border-border bg-card" aria-hidden="true">{columns.includes(column.id)&&<Check className="size-3 text-primary" />}</span>{column.label}
    </button>)}
    <div role="separator" className="my-1 border-t border-border/60" />
    <button type="button" onClick={reset}><RotateCcw className="size-4" aria-hidden="true" />Przywróć domyślne kolumny</button>
    <p className="px-3 pb-2 pt-2 text-xs leading-5 text-muted-foreground">Wybór zapamiętamy w tej przeglądarce dla tej firmy.</p>
  </DropdownMenu>;
}
