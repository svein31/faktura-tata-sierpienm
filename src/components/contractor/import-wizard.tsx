"use client";
import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/toast";
import { parseImportCsv } from "@/lib/csv-import";
import { IMPORT_FIELDS, type ImportField, type ImportRow, type ImportResult } from "@/lib/contractor-import-fields";

const fieldNames: Record<ImportField, string> = { name: "Nazwa *", nip: "NIP *", street: "Ulica", city: "Miasto", postal: "Kod pocztowy", email: "E-mail", phone: "Telefon" };
type Preview = { created: number; ready: number; duplicate: number; invalid: number; results: ImportResult[] };

export function ContractorImportWizard() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const toast = useToast();
  const [file, setFile] = React.useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = React.useState<Record<ImportField, string>>({ name: "", nip: "", street: "", city: "", postal: "", email: "", phone: "" });
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  React.useEffect(() => { setFile(null); setPreview(null); setError(""); }, [companyId]);
  const rows = React.useMemo(() => file?.rows.map(cells => Object.fromEntries(IMPORT_FIELDS.map(field => [field, mapping[field] === "" ? "" : cells[Number(mapping[field])] || ""])) as ImportRow) || [], [file, mapping]);
  const duplicatedMapping = Object.values(mapping).filter(Boolean).length !== new Set(Object.values(mapping).filter(Boolean)).size;
  const canPreview = !!companyId && !!file && mapping.name !== "" && mapping.nip !== "" && !duplicatedMapping;
  async function send(action: "preview" | "import") {
    if (!canPreview) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/contractors/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, action, rows }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Nie udało się przetworzyć pliku.");
      if (action === "preview") setPreview(body as Preview);
      else { toast("success", "Import zakończony", `Dodano ${body.created}, pominięto ${body.duplicate + body.invalid}.`); await useAppStore.getState().revalidate(); setFile(null); setPreview(null); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Błąd importu."); }
    finally { setBusy(false); }
  }
  return <details className="mb-4 rounded-xl border bg-card text-xs">
    <summary className="cursor-pointer px-3 py-2.5 font-medium"><Upload className="mr-2 inline size-3.5" />Importuj kontrahentów z CSV</summary>
    <div className="space-y-3 border-t p-3">
      <p className="text-muted-foreground">Plik → kolumny → podgląd → import. Maks. 200 wierszy; powtórzone NIP zostaną pominięte.</p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2">Wybierz plik CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={async event => {
        const chosen = event.target.files?.[0]; event.target.value = ""; if (!chosen) return;
        setPreview(null); setError("");
        try {
          if (chosen.size > 262144) throw new Error("Plik przekracza 256 KB.");
          const parsed = parseImportCsv(await chosen.text());
          setFile({ name: chosen.name, ...parsed });
          setMapping(Object.fromEntries(IMPORT_FIELDS.map(field => [field, String(parsed.headers.findIndex(header => ({ name: ["nazwa", "name", "firma"], nip: ["nip"], street: ["ulica", "street", "adres"], city: ["miasto", "city"], postal: ["kod pocztowy", "postal"], email: ["email", "e-mail"], phone: ["telefon", "phone"] }[field] as string[]).includes(header.trim().toLowerCase()))) ]).map(([field, position]) => [field, position === "-1" ? "" : position])) as Record<ImportField, string>);
        } catch (cause) { setFile(null); setError(cause instanceof Error ? cause.message : "Nie można odczytać CSV."); }
      }} /></label>
      {file && <>
        <span className="ml-2 text-muted-foreground">{file.name} · {file.rows.length} wierszy</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{IMPORT_FIELDS.map(field => <label key={field} className="flex min-w-0 flex-col gap-1">{fieldNames[field]}<Select display="dropdown" className="min-w-0" value={mapping[field]} onChange={event => { setMapping(previous => ({ ...previous, [field]: event.target.value })); setPreview(null); }}><option value="">Pomiń</option>{file.headers.map((header, index) => <option key={index} value={index}>{header || `Kolumna ${index + 1}`}</option>)}</Select></label>)}</div>
        {duplicatedMapping && <p role="alert" className="text-destructive">Jedna kolumna może być przypisana tylko raz.</p>}
        <Button size="sm" variant="outline" disabled={!canPreview || busy} onClick={() => void send("preview")}>Sprawdź import</Button>
      </>}
      {preview && <div className="space-y-2 border-t pt-2"><p>Gotowe: <b>{preview.ready}</b> · duplikaty: {preview.duplicate} · błędy: {preview.invalid}</p><div className="max-h-44 space-y-1 overflow-y-auto">{preview.results.map(row => <p key={row.line} className="break-words" title={row.reason}><span className={row.status === "ready" ? "text-emerald-600" : "text-amber-600"}>{row.status === "ready" ? "Gotowe" : row.status === "duplicate" ? "Duplikat" : "Błąd"}</span> · {row.line}: {row.name} ({row.nip}) {row.reason}</p>)}</div><Button size="sm" disabled={busy || preview.ready === 0} onClick={() => void send("import")}>Importuj {preview.ready}</Button></div>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  </details>;
}
