"use client";
import * as React from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OcrExtraction } from "@/lib/ocr-extraction";

type ReviewLine = { name: string; unit: string; quantity: string | number; totalNet: string | number; totalVat: string | number; totalGross: string | number };
type Doc = { id: string; fileName: string; mimeType: string; sizeBytes: number; status: string; version: number; rawText?: string; errorMessage?: string; parsed?: Partial<typeof empty> & { lines?: ReviewLine[] }; expenseId?: string; ocrResult?: OcrExtraction };
const labels: Record<string,string> = { queued: "W kolejce OCR", needs_review: "Do weryfikacji", processing: "Rozpoznawanie", converted: "Zatwierdzony", rejected: "Odrzucony", failed: "Błąd OCR" };
const empty = { number: "", contractorName: "", nip: "", issueDate: "", currency: "PLN", category: "inne", totalNet: "", totalVat: "", totalGross: "" };
export default function DocumentsPage() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const [docs, setDocs] = React.useState<Doc[]>([]), [selected, setSelected] = React.useState<Doc | null>(null);
  const [fields, setFields] = React.useState<Record<string, string | number>>(empty);
  const [next, setNext] = React.useState<string | null>(null), [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false), [loading, setLoading] = React.useState(false), [error, setError] = React.useState("");
  const [message, setMessage] = React.useState(""), [ocrAvailable, setOcrAvailable] = React.useState(false);
  const [ocrReviewed, setOcrReviewed] = React.useState(false);
  const [lines, setLines] = React.useState<ReviewLine[]>([]);
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
  React.useEffect(() => { setDocs([]); setSelected(null); setBusy(false); setMessage(""); setOcrReviewed(false); setLines([]); const timer = setTimeout(() => void load(), 250); return () => { clearTimeout(timer); generation.current += 1; }; }, [load]);
  const open = React.useCallback(async (id: string) => {
    const currentCompany = companyId;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/documents/${id}`), data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (currentCompany !== scope.current) return;
      const { lines: savedLines = [], ...savedFields } = data.document.parsed || {};
      setSelected(data.document); setFields({ ...empty, ...savedFields }); setLines(savedLines); setOcrReviewed(false);
    } catch (e) { if (currentCompany === scope.current) setError(e instanceof Error ? e.message : "Błąd podglądu."); }
    finally { if (currentCompany === scope.current) setBusy(false); }
  }, [companyId]);
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("document");
    if (companyId && id && /^[a-f0-9]{24}$/i.test(id)) void open(id);
  }, [companyId, open]);
  React.useEffect(() => {
    if (!selected || !["queued", "processing"].includes(selected.status)) return;
    const controller = new AbortController(), id = selected.id, currentCompany = companyId;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/documents/${id}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (controller.signal.aborted || currentCompany !== scope.current) return;
        // Refresh OCR output without replacing the user's unsaved review fields.
        setSelected(prev => prev?.id === id && JSON.stringify(prev.parsed) === JSON.stringify(data.document.parsed) ? data.document : prev);
        setDocs(prev => prev.map(doc => doc.id === id ? data.document : doc));
      } catch { /* A later poll or manual refresh can recover a network failure. */ }
    }, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [selected?.id, selected?.status, companyId]);
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
      const reviewedLines = lines.map(line => ({ ...line, ...Object.fromEntries(["quantity", "totalNet", "totalVat", "totalGross"].map(key => [key, line[key as keyof ReviewLine] === "" ? null : Number(line[key as keyof ReviewLine])])) }));
      const res = await fetch(`/api/documents/${id}${kind === "ocr" ? "/ocr" : ""}`, { method: kind === "ocr" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, lines: reviewedLines, totalNet: fields.totalNet === "" ? null : Number(fields.totalNet), totalVat: fields.totalVat === "" ? null : Number(fields.totalVat), totalGross: fields.totalGross === "" ? null : Number(fields.totalGross), version: selected.version, action: kind, ocrReviewed }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (currentCompany !== scope.current) return;
      if (kind === "ocr") {
        setOcrReviewed(false);
        setMessage("Dokument dodano do kolejki OCR. Możesz zamknąć tę stronę.");
        const refreshed = await fetch(`/api/documents/${id}`);
        if (refreshed.ok) {
          const detail = await refreshed.json();
          if (currentCompany === scope.current) setSelected(prev => prev?.id === id ? detail.document : prev);
        }
        // The durable scheduler also runs this job if the browser disconnects.
        const processed = await fetch("/api/documents/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        if (!processed.ok && currentCompany === scope.current) setMessage("Dokument pozostaje w kolejce. Stan odczytu odświeża się automatycznie.");
        return;
      }
      setMessage(kind === "approve" ? "Zatwierdzono dokument i dodano koszt." : kind === "reject" ? "Zapisano odrzucenie." : "Zapisano. Sprawdź dane przed zatwierdzeniem.");
      await load(); await open(id);
    } catch (e) { if (currentCompany === scope.current) setError(e instanceof Error ? e.message : "Nie udało się zapisać."); }
    finally { if (currentCompany === scope.current) setBusy(false); }
  };
  const immutable = selected?.status === "converted" || selected?.status === "rejected";
  return <div className="page space-y-4">
    <PageHeader title="Skrzynka dokumentów" description="Dodaj oryginał, sprawdź dane i przekaż dokument do kosztów wybranej firmy." />
    {!companyId && <p>Wybierz firmę, aby otworzyć skrzynkę.</p>}
    <div className="flex min-w-0 flex-wrap gap-3 items-center rounded-xl border p-4">
      <label className="min-w-0 w-full sm:w-auto text-sm">Dodaj PDF, JPG lub PNG (do 3 MB)<input className="block mt-2 min-w-0 w-full max-w-full" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy || !companyId} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      <label className="min-w-0 w-full sm:w-auto text-sm">Zrób zdjęcie<input className="block mt-2 min-w-0 w-full max-w-full" type="file" accept="image/jpeg,image/png" capture="environment" disabled={busy || !companyId} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-500 p-3">{error} <Button variant="ghost" onClick={() => selected ? open(selected.id) : load()}>Odśwież</Button></div>}
    {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
    <Input aria-label="Szukaj dokumentu" placeholder="Szukaj po nazwie pliku…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-2" aria-busy={loading}>
        {!loading && !docs.length && <p className="p-4 text-muted-foreground">Brak dokumentów w tym widoku.</p>}
        {docs.map(doc => <button disabled={busy} key={doc.id} onClick={() => open(doc.id)} className={`block w-full rounded-xl border p-3 text-left ${selected?.id === doc.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}><span className="block truncate font-medium">{doc.fileName}</span><span className="text-xs text-muted-foreground">{labels[doc.status] || doc.status} · {Math.ceil(doc.sizeBytes / 1024)} KB</span></button>)}
        {next && <Button disabled={loading} onClick={() => load(next)}>Wczytaj następne</Button>}
      </div>
      {selected && <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2"><a href={`/api/documents/${selected.id}/file`} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Otwórz oryginał</a><iframe title="Oryginał dokumentu" sandbox="" src={`/api/documents/${selected.id}/file`} className="w-full h-[560px] rounded-xl border bg-white" />
          {selected.rawText && <details className="rounded-xl border p-3"><summary>Tekst odczytany przez OCR — wymaga sprawdzenia</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs max-h-80 overflow-y-auto">{selected.rawText}</pre></details>}
        </div>
        <div className="min-w-0 break-words space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">{labels[selected.status] || selected.status}</h2>
          {selected.expenseId && <a className="text-sm text-primary underline" href="/expenses">Koszt zapisany — zobacz w wydatkach</a>}
          <p className="text-xs text-muted-foreground">Oryginalny plik pozostaje niezmienny. Zweryfikuj dane według oryginału. OCR odczytuje tekst; kwoty i dane sprzedawcy zatwierdza człowiek.</p>
          {selected.errorMessage && <p role="status" className="text-sm">{selected.errorMessage}</p>}
          {!immutable && <><Button disabled={busy || !ocrAvailable || ["queued", "processing"].includes(selected.status)} onClick={() => action("ocr")}>{busy ? "Przetwarzanie…" : "Odczytaj tekst OCR"}</Button><p className="text-xs text-muted-foreground">{ocrAvailable ? "Odczyt przesyła dokument do skonfigurowanej usługi OCR.space. Dostępny rozmiar i liczba stron zależą od planu tej usługi." : "OCR nie jest skonfigurowany. Możesz wpisać dane ręcznie."}</p></>}
          {selected.ocrResult && <details className="rounded-lg border p-3" open>
            <summary>Propozycje OCR — porównaj z oryginałem</summary>
            {selected.ocrResult.warnings.map((warning, i) => <p key={i} className="text-xs mt-2">{warning}</p>)}
            {Object.entries(selected.ocrResult.fields).filter(([key]) => key in empty).map(([key, candidates]) => <div key={key} className="mt-3 space-y-1">
              {candidates.map((candidate, i) => <div key={i} className="rounded border p-2 text-sm">
                <p>{String(candidate.value)}</p><p className="text-xs text-muted-foreground">Strona {candidate.page}, wiersz {candidate.line}: {candidate.text}</p>
                {!immutable && <Button variant="ghost" disabled={busy} onClick={() => { setFields(prev => ({ ...prev, [key]: candidate.value })); setOcrReviewed(false); }}>Użyj propozycji</Button>}
              </div>)}
            </div>)}
          </details>}
          {Object.entries({ number: "Numer dokumentu", contractorName: "Sprzedawca", nip: "NIP sprzedawcy", issueDate: "Data wystawienia", currency: "Waluta", totalNet: "Netto", totalVat: "VAT", totalGross: "Brutto", category: "Kategoria" }).map(([key, label]) => <label className="block text-sm" key={key}>{label}<Input disabled={immutable || busy} type={key === "issueDate" ? "date" : key.startsWith("total") ? "number" : "text"} step={key.startsWith("total") ? "0.01" : undefined} value={fields[key] ?? ""} onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))} /></label>)}
          <details className="rounded-lg border p-3">
            <summary>Pozycje dokumentu ({lines.length})</summary>
            <p className="text-xs my-2">Pozycje są opcjonalne. Jeśli je dodasz, ich sumy netto, VAT i brutto muszą odpowiadać kwotom dokumentu.</p>
            {!immutable && !!selected.ocrResult?.lines.length && <Button disabled={busy} variant="ghost" onClick={() => {
              if (lines.length && !window.confirm("Zastąpić opracowane pozycje propozycjami OCR?")) return;
              setLines(selected.ocrResult!.lines.map(line => ({ name: line.name, unit: line.unit, quantity: line.quantity, totalNet: line.totalNet, totalVat: line.totalVat, totalGross: line.totalGross })));
              setOcrReviewed(false);
            }}>Wczytaj propozycje pozycji OCR</Button>}
            {selected.ocrResult?.lines.map((line, i) => <p key={i} className="text-xs text-muted-foreground my-1">OCR, strona {line.source.page}, wiersz {line.source.line}: {line.source.text}</p>)}
            {lines.map((line, index) => <fieldset key={index} disabled={immutable || busy} className="my-3 rounded-lg border p-2 grid grid-cols-2 gap-2">
              <legend>Pozycja {index + 1}</legend>
              {Object.entries({ name: "Nazwa", unit: "Jednostka", quantity: "Ilość", totalNet: "Netto", totalVat: "VAT", totalGross: "Brutto" }).map(([key, label]) => <label key={key} className="text-xs">{label}<Input type={["name", "unit"].includes(key) ? "text" : "number"} step={key === "quantity" ? "any" : "0.01"} value={line[key as keyof ReviewLine]} onChange={e => { setLines(prev => prev.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item)); setOcrReviewed(false); }} /></label>)}
              {!immutable && <Button variant="ghost" onClick={() => { setLines(prev => prev.filter((_, i) => i !== index)); setOcrReviewed(false); }}>Usuń pozycję</Button>}
            </fieldset>)}
            {!immutable && <Button disabled={busy || lines.length >= 200} variant="ghost" onClick={() => { setLines(prev => [...prev, { name: "", unit: "szt.", quantity: 1, totalNet: "", totalVat: "", totalGross: "" }]); setOcrReviewed(false); }}>Dodaj pozycję</Button>}
          </details>
          {!immutable && selected.ocrResult && <label className="flex gap-2 text-sm"><input type="checkbox" checked={ocrReviewed} disabled={busy} onChange={e => setOcrReviewed(e.target.checked)} />Sprawdziłem dane i kwoty z oryginałem dokumentu.</label>}
          {!immutable && <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => action("save")}>Zapisz dane</Button><Button disabled={busy || (!!selected.ocrResult && !ocrReviewed)} onClick={() => action("approve")}>Zatwierdź koszt</Button><Button disabled={busy} variant="ghost" onClick={() => action("reject")}>Odrzuć</Button></div>}
        </div>
      </div>}
    </div>
  </div>;
}
