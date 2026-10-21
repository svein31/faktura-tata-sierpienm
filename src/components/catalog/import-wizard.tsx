"use client";
import * as React from "react";
import { Check, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { parseImportCsv } from "@/lib/csv-import";
import { csvCell } from "@/lib/accountant-summary";
import { CATALOG_COLUMNS, suggestCatalogMapping, type CatalogImportKind, type CatalogImportPreview } from "@/lib/catalog-import-config";

type Table = { headers: string[]; rows: string[][]; sheets?: string[]; sheetIndex?: number };
function downloadCsv(name: string, rows: unknown[][]) {
  const href = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = href; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
export function CatalogImportWizard({ kind }: { kind: CatalogImportKind }) {
  const companyId = useAppStore(state => state.selectedCompanyId);
  const company = useAppStore(state => state.company);
  return <ImportBody key={`${kind}:${companyId}`} kind={kind} companyId={companyId} companyName={company?.companyName || "Wybrana firma"} canImport={Boolean(company?.currentUserRole === "owner" || company?.currentUserPermissions?.canIssueInvoices)} />;
}
function ImportBody({ kind, companyId, companyName, canImport }: { kind: CatalogImportKind; companyId: string | null; companyName: string; canImport: boolean }) {
  const columns = CATALOG_COLUMNS[kind], label = kind === "contractors" ? "kontrahentów" : "produktów i usług";
  const [source, setSource] = React.useState<File | null>(null), [table, setTable] = React.useState<Table | null>(null);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [preview, setPreview] = React.useState<CatalogImportPreview | null>(null), [completed, setCompleted] = React.useState(false);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
  const pending = React.useRef(false), controller = React.useRef<AbortController | null>(null), mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const rows = React.useMemo(() => table?.rows.map(cells => Object.fromEntries(columns.map(field => [field.key, mapping[field.key] ? cells[Number(mapping[field.key])] || "" : ""]))) || [], [table, mapping, columns]);
  const assigned = Object.values(mapping).filter(Boolean), duplicateMapping = assigned.length !== new Set(assigned).size;
  const canPreview = Boolean(companyId && canImport && table?.rows.length && columns.every(field => !field.required || Boolean(mapping[field.key])) && !duplicateMapping);
  const step = completed ? 3 : preview ? 2 : table ? 1 : 0;
  const begin = () => { if (pending.current) return null; pending.current = true; setBusy(true); setError(""); controller.current = new AbortController(); return controller.current.signal; };
  const finish = () => { if (mounted.current) { pending.current = false; setBusy(false); } };
  async function readFile(file: File, sheet = 0) {
    const signal = begin(); if (!signal) return;
    setPreview(null); setCompleted(false); setTable(null);
    try {
      let parsed: Table;
      if (/\.xlsx$/i.test(file.name)) {
        if (file.size > 2_000_000) throw new Error("Plik Excel może mieć najwyżej 2 MB.");
        const response = await fetch(`/api/catalog/import-file?${new URLSearchParams({ companyId: companyId || "", sheet: String(sheet) })}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file, signal });
        parsed = await response.json();
        if (!response.ok) throw new Error((parsed as unknown as { error: string }).error || "Nie można odczytać arkusza.");
      } else if (/\.csv$/i.test(file.name)) {
        if (file.size > 262144) throw new Error("Plik CSV może mieć najwyżej 256 KB.");
        const bytes = await file.arrayBuffer();
        let text: string;
        try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
        catch { text = new TextDecoder("windows-1250").decode(bytes); }
        parsed = parseImportCsv(text);
      } else throw new Error("Wybierz CSV lub Excel .xlsx. Starszy plik .xls zapisz jako .xlsx lub CSV.");
      if (!mounted.current || signal.aborted) return;
      setSource(file); setTable(parsed); setMapping(suggestCatalogMapping(kind, parsed.headers));
    } catch (cause) { if (mounted.current && !signal.aborted) { setError(cause instanceof Error ? cause.message : "Nie można odczytać pliku."); setSource(null); } }
    finally { finish(); }
  }
  async function send(action: "preview" | "import") {
    if (!canPreview || (action === "import" && (!preview?.ready || completed))) return;
    const signal = begin(); if (!signal) return;
    try {
      const response = await fetch(`/api/${kind}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, action, rows }), signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się przetworzyć importu.");
      if (!mounted.current || signal.aborted) return;
      setPreview(result); setCompleted(action === "import");
      if (action === "import" && useAppStore.getState().selectedCompanyId === companyId) {
        try { await useAppStore.getState().revalidate(); }
        catch { if (mounted.current) setError("Import został zapisany. Odśwież stronę, aby zobaczyć nowe pozycje."); }
      }
    } catch (cause) { if (mounted.current && !signal.aborted) setError(cause instanceof Error ? cause.message : "Błąd importu. Sprawdź połączenie i ponów podgląd."); }
    finally { finish(); }
  }
  function template() {
    const values = kind === "contractors" ? ["Przykładowa firma", "5260301706", "Przykładowa 1", "Warszawa", "00-001", "kontakt@example.pl", ""] : ["Usługa konsultacyjna", "USL-001", "godz.", "150,00", "23", "PLN", "Konsultacja"];
    downloadCsv(`wzor-${kind}.csv`, [columns.map(field => field.label), values]);
  }
  return <details className="mb-5 rounded-xl border bg-card text-sm" data-catalog-import={kind}>
    <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Upload aria-hidden="true" className="size-4 text-muted-foreground" />Import {label} z CSV lub Excel</summary>
    <div className="space-y-5 border-t p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">Przenieś kartotekę do firmy: {companyName}</p><p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">Do 200 wierszy i 30 kolumn w jednym pliku. Import dodaje nowe pozycje; istniejące dane pozostają bez zmian. {kind === "products" ? "Ceny netto w PLN, VAT: 23, 8, 5, 0, zw, np lub oo." : "Obsługiwani są kontrahenci z polskim NIP. Numery NIP i kody pocztowe zapisz w Excelu jako tekst."}</p></div><Button variant="outline" size="sm" onClick={template}><Download aria-hidden="true" className="size-4" />Pobierz wzór CSV</Button></div>
      <ol aria-label="Etapy importu" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{["Wybierz plik", "Dopasuj kolumny", "Sprawdź podgląd", "Wynik importu"].map((title, index) => <li key={title} aria-current={step === index ? "step" : undefined} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${step === index ? "border-primary/40 bg-primary/5 font-medium text-foreground" : "text-muted-foreground"}`}><span className="tabular-nums">{step > index ? <Check aria-label="Ukończono" className="size-3.5" /> : index + 1}</span>{title}</li>)}</ol>
      {!companyId || !canImport ? <p role="status" className="text-muted-foreground">{!companyId ? "Wybierz firmę w górnym pasku." : "Import wymaga uprawnienia do edycji katalogu (wystawiania faktur)."}</p> : <>
        <label className="block space-y-2"><span className="text-xs font-medium">Plik źródłowy · CSV do 256 KB, XLSX do 2 MB</span><input aria-label={`Plik importu ${label}`} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} className="block w-full min-w-0 rounded-lg border bg-background p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={event => { const chosen = event.target.files?.[0]; event.target.value = ""; if (chosen) void readFile(chosen); }} /></label>
        {busy && <p role="status" className="text-xs text-muted-foreground">Przetwarzanie importu…</p>}
        {table && <>
          <p className="break-words text-xs text-muted-foreground">{source?.name} · {table.rows.length} wierszy danych</p>
          {!table.rows.length && <p role="status" className="text-xs text-muted-foreground">Arkusz nie zawiera danych do importu. Wybierz inny arkusz lub dodaj nagłówek i wiersze danych.</p>}
          {table.sheets && table.sheets.length > 1 && <label className="block max-w-sm space-y-1 text-xs">Arkusz<Select aria-label="Arkusz importu" value={table.sheetIndex || 0} disabled={busy} onChange={event => { if (source) void readFile(source, Number(event.target.value)); }}>{table.sheets.map((name, index) => <option key={index} value={index}>{name}</option>)}</Select></label>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{columns.map(field => <label key={field.key} className="min-w-0 space-y-1 text-xs font-medium">{field.label}{field.required ? " *" : ""}<Select aria-label={`${field.label}${field.required ? " *" : ""}`} value={mapping[field.key] ?? ""} disabled={busy} onChange={event => { setMapping(previous => ({ ...previous, [field.key]: event.target.value })); setPreview(null); setCompleted(false); }}><option value="">{field.required ? "Wybierz kolumnę" : "Pomiń"}</option>{table.headers.map((header, index) => <option key={index} value={index}>{index + 1}. {header || "Bez nazwy"}</option>)}</Select></label>)}</div>
          {duplicateMapping && <p role="alert" className="text-xs text-destructive">Jedna kolumna może być przypisana tylko do jednego pola.</p>}
          <details className="rounded-lg border p-3"><summary className="cursor-pointer text-xs font-medium">Dane po dopasowaniu kolumn · pierwsze 5 wierszy</summary><div tabIndex={0} role="region" aria-label="Podgląd danych po dopasowaniu kolumn" className="mt-3 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><table className="w-full text-left text-xs"><thead><tr>{columns.map(field => <th key={field.key} className="whitespace-nowrap border-b p-2 font-medium">{field.label}</th>)}</tr></thead><tbody>{rows.slice(0, 5).map((row, i) => <tr key={i}>{columns.map(field => <td key={field.key} className="max-w-60 break-words border-b p-2 align-top">{row[field.key] || "—"}</td>)}</tr>)}</tbody></table></div></details>
          <Button variant="outline" size="sm" disabled={!canPreview || busy} onClick={() => void send("preview")}><FileSpreadsheet aria-hidden="true" className="size-4" />{preview ? "Sprawdź ponownie" : "Sprawdź import"}</Button>
        </>}
        {preview && <section aria-label="Wynik sprawdzenia importu" className="space-y-3 border-t pt-4">
          <div role="status" className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><p className="font-medium">{completed ? `Dodano: ${preview.created}` : `Gotowe do dodania: ${preview.ready}`}</p><p>Duplikaty: {preview.duplicate}</p><p>Błędy: {preview.invalid}</p></div>
          <p className="text-xs text-muted-foreground">{kind === "products" ? "Duplikaty rozpoznajemy po SKU, a przy braku SKU po nazwie bez rozróżniania wielkości liter." : "Duplikaty rozpoznajemy po NIP w pliku i kartotece wybranej firmy."} Popraw błędne wiersze w pliku i wczytaj go ponownie. Zmiana kolumn wymaga ponownego sprawdzenia.</p>
          <div tabIndex={0} role="region" aria-label="Szczegóły wierszy importu" className="max-h-72 overflow-auto rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-card"><tr>{["Wiersz danych", "Nazwa", "Status", "Szczegóły"].map(title => <th key={title} className="border-b p-2.5 font-medium">{title}</th>)}</tr></thead><tbody>{preview.results.map(row => <tr key={row.line}><td className="border-b p-2.5 align-top tabular-nums">{row.line - 1}</td><td className="max-w-64 break-words border-b p-2.5 align-top">{row.name || "Brak nazwy"}</td><td className="border-b p-2.5 align-top">{row.status === "ready" ? completed ? "Dodano" : "Gotowe" : row.status === "duplicate" ? "Duplikat" : "Błąd"}</td><td className="min-w-40 border-b p-2.5 align-top">{row.reason || "—"}</td></tr>)}</tbody></table></div>
          <div className="flex flex-wrap items-center gap-3">{!completed && <Button size="sm" disabled={busy || !preview.ready} onClick={() => void send("import")}>{kind === "products" ? "Importuj pozycje" : "Importuj kontrahentów"} ({preview.ready})</Button>}<Button variant="outline" size="sm" onClick={() => downloadCsv(`raport-${kind}.csv`, [["Wiersz danych", "Nazwa", "Status", "Szczegóły"], ...preview.results.map(row => [row.line - 1, row.name, row.status === "ready" ? completed ? "Dodano" : "Gotowe" : row.status === "duplicate" ? "Duplikat" : "Błąd", row.reason])])}><Download aria-hidden="true" className="size-4" />Pobierz raport CSV</Button></div>
        </section>}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </details>;
}
