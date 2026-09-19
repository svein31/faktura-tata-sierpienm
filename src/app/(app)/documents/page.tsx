"use client";
import * as React from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

type Doc = { id: string; fileName: string; mimeType: string; sizeBytes: number; status: string; version: number; rawText?: string; errorMessage?: string; parsed?: Record<string, string | number>; expenseId?: string };
const labels: Record<string,string> = { needs_review: "Do weryfikacji", processing: "Rozpoznawanie", converted: "Zatwierdzony", rejected: "Odrzucony", failed: "Błąd OCR" };
const empty = { number: "", contractorName: "", nip: "", issueDate: "", currency: "PLN", category: "inne", totalNet: "", totalVat: "", totalGross: "" };
export default function DocumentsPage() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const [docs, setDocs] = React.useState<Doc[]>([]), [selected, setSelected] = React.useState<Doc | null>(null);
  const [fields, setFields] = React.useState<Record<string, string | number>>(empty);
  const [next, setNext] = React.useState<string | null>(null), [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false), [loading, setLoading] = React.useState(false), [error, setError] = React.useState("");
  const [message, setMessage] = React.useState(""), [ocrAvailable, setOcrAvailable] = React.useState(false);
  const generation = React.useRef(0);
  const scope = React.useRef(companyId); scope.current = companyId;
  const load = React.useCallback(async (cursor?: string) => {
    if (!companyId) return;
    const attempt = ++generation.current; setLoading(true); setError("");
    try {
      const res = await fetch(`/api/documents?companyId=${companyId}&search=${encodeURIComponent(search)}${cursor ? `&cursor=${cursor}` : ""}`);
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (attempt !== generation.current) return;
      setDocs(prev => cursor ? [...prev, ...data.documents] : data.documents); setNext(data.nextCursor); setOcrAvailable(data.ocrAvailable);
    } catch (e) { if (attempt === generation.current) setError(e instanceof Error ? e.message : "Nie udało się pobrać dokumentów."); }
    finally { if (attempt === generation.current) setLoading(false); }
  }, [companyId, search]);
  React.useEffect(() => { setDocs([]); setSelected(null); const timer = setTimeout(() => void load(), 250); return () => { clearTimeout(timer); generation.current += 1; }; }, [load]);
  const open = async (id: string) => {
    const currentCompany = companyId;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/documents/${id}`), data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (currentCompany !== scope.current) return;
      setSelected(data.document); setFields({ ...empty, ...data.document.parsed });
    } catch (e) { setError(e instanceof Error ? e.message : "Błąd podglądu."); }
    finally { setBusy(false); }
  };
  const upload = async (file?: File) => {
    if (!file || !companyId) return;
    if (file.size > 3 * 1024 * 1024) { setError("Wybierz plik do 3 MB."); return; }
    const currentCompany = companyId;
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.set("file", file);
      const res = await fetch(`/api/documents?companyId=${companyId}`, { method: "POST", body: form });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (currentCompany !== scope.current) return;
      setMessage(data.duplicate ? "Ten plik znajduje się już w skrzynce firmy." : "Dodano dokument do weryfikacji.");
      await load(); await open(data.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Błąd dodawania dokumentu."); }
    finally { setBusy(false); }
  };
  const action = async (kind: "save" | "approve" | "reject" | "ocr") => {
    if (!selected || busy) return;
    const currentCompany = companyId, id = selected.id;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch(`/api/documents/${id}${kind === "ocr" ? "/ocr" : ""}`, { method: kind === "ocr" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, totalNet: fields.totalNet === "" ? null : Number(fields.totalNet), totalVat: fields.totalVat === "" ? null : Number(fields.totalVat), totalGross: fields.totalGross === "" ? null : Number(fields.totalGross), version: selected.version, action: kind }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (currentCompany !== scope.current) return;
      setMessage(kind === "approve" ? "Zatwierdzono dokument i dodano koszt." : kind === "reject" ? "Zapisano odrzucenie." : "Zapisano. Sprawdź dane przed zatwierdzeniem.");
      await load(); await open(id);
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się zapisać."); }
    finally { setBusy(false); }
  };
  const immutable = selected?.status === "converted" || selected?.status === "rejected";
  return <div className="page space-y-4">
    <PageHeader title="Skrzynka dokumentów" description="Dodaj oryginał, sprawdź dane i przekaż dokument do kosztów wybranej firmy." />
    {!companyId && <p>Wybierz firmę, aby otworzyć skrzynkę.</p>}
    <div className="flex flex-wrap gap-3 items-center rounded-xl border p-4">
      <label className="text-sm">Dodaj PDF, JPG lub PNG (do 3 MB)<input className="block mt-2 max-w-full" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy || !companyId} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      <label className="text-sm">Zrób zdjęcie<input className="block mt-2 max-w-full" type="file" accept="image/jpeg,image/png" capture="environment" disabled={busy || !companyId} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-500 p-3">{error} <Button variant="ghost" onClick={() => selected ? open(selected.id) : load()}>Odśwież</Button></div>}
    {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
    <Input aria-label="Szukaj dokumentu" placeholder="Szukaj po nazwie pliku…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <div className="space-y-2" aria-busy={loading}>
        {!loading && !docs.length && <p className="p-4 text-muted-foreground">Brak dokumentów w tym widoku.</p>}
        {docs.map(doc => <button disabled={busy} key={doc.id} onClick={() => open(doc.id)} className={`block w-full rounded-xl border p-3 text-left ${selected?.id === doc.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}><span className="block truncate font-medium">{doc.fileName}</span><span className="text-xs text-muted-foreground">{labels[doc.status] || doc.status} · {Math.ceil(doc.sizeBytes / 1024)} KB</span></button>)}
        {next && <Button disabled={loading} onClick={() => load(next)}>Wczytaj następne</Button>}
      </div>
      {selected && <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2"><a href={`/api/documents/${selected.id}/file`} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Otwórz oryginał</a><iframe title="Oryginał dokumentu" sandbox="" src={`/api/documents/${selected.id}/file`} className="w-full h-[560px] rounded-xl border bg-white" />
          {selected.rawText && <details className="rounded-xl border p-3"><summary>Tekst odczytany przez OCR — wymaga sprawdzenia</summary><pre className="mt-2 whitespace-pre-wrap text-xs max-h-80 overflow-y-auto">{selected.rawText}</pre></details>}
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">{labels[selected.status] || selected.status}</h2>
          <p className="text-xs text-muted-foreground">Oryginalny plik pozostaje niezmienny. Zweryfikuj dane według oryginału. OCR odczytuje tekst; kwoty i dane sprzedawcy zatwierdza człowiek.</p>
          {!immutable && <><Button disabled={busy || !ocrAvailable} onClick={() => action("ocr")}>{busy ? "Przetwarzanie…" : "Odczytaj tekst OCR"}</Button><p className="text-xs text-muted-foreground">{ocrAvailable ? "Odczyt przesyła dokument do skonfigurowanej usługi OCR.space." : "OCR nie jest skonfigurowany. Możesz wpisać dane ręcznie."}</p></>}
          {Object.entries({ number: "Numer dokumentu", contractorName: "Sprzedawca", nip: "NIP sprzedawcy", issueDate: "Data wystawienia", currency: "Waluta", totalNet: "Netto", totalVat: "VAT", totalGross: "Brutto", category: "Kategoria" }).map(([key, label]) => <label className="block text-sm" key={key}>{label}<Input disabled={immutable || busy} type={key === "issueDate" ? "date" : key.startsWith("total") ? "number" : "text"} step={key.startsWith("total") ? "0.01" : undefined} value={fields[key] ?? ""} onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))} /></label>)}
          {!immutable && <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => action("save")}>Zapisz dane</Button><Button disabled={busy} onClick={() => action("approve")}>Zatwierdź koszt</Button><Button disabled={busy} variant="ghost" onClick={() => action("reject")}>Odrzuć</Button></div>}
        </div>
      </div>}
    </div>
  </div>;
}
