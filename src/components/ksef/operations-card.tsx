"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, RefreshCw } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/toast";

type Center = {
  checkedAt: string;
  environment: string;
  official: { status: string; environment: string; messages: { id: string; title: string; category: string; type: string; start: string; end: string | null }[] };
  certificate: { validTo: string | null; fingerprintEnd: string | null; notice: "missing" | "expired" | "expiring" | "valid" };
  counts: Record<string, number>;
  tasks: { id: string; invoiceId: string; number: string; status: string; attempts: number; maxAttempts: number; stuck: boolean; nextStep: string }[];
  limited: boolean;
};

const statusLabel: Record<string, string> = {
  AVAILABLE: "MF: dostępny", MAINTENANCE: "MF: prace", FAILURE: "MF: awaria",
  TOTAL_FAILURE: "MF: awaria całkowita", UNAVAILABLE: "MF: brak danych",
};
const certLabel = { missing: "Certyfikat: brak danych", expired: "Certyfikat: wygasł", expiring: "Certyfikat: kończy się", valid: "Certyfikat: ważny" };
const taskLabel: Record<string, string> = { failed: "Błąd", verify_needed: "Sprawdź wynik", queued: "W kolejce", processing: "Przetwarzanie" };

export function KsefOperationsCard() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const toast = useToast();
  const [data, setData] = React.useState<Center | null>(null);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [checking, setChecking] = React.useState<string | null>(null);

  async function checkTask(invoiceId: string) {
    setChecking(invoiceId);
    try {
      const response = await fetch(`/api/ksef/status/${encodeURIComponent(invoiceId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się sprawdzić statusu.");
      toast("success", result.status === "ACCEPTED" ? "Potwierdzono w KSeF" : result.status === "REJECTED" ? "KSeF odrzucił fakturę" : "Status nadal niepewny; nie ponawiaj wysyłki.");
      setRefresh(n => n + 1);
    } catch (cause) { toast("error", "Sprawdzenie KSeF", cause instanceof Error ? cause.message : "Błąd odczytu."); }
    finally { setChecking(null); }
  }

  React.useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    if (companyId) fetch(`/api/ksef/center?companyId=${encodeURIComponent(companyId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Nie udało się pobrać stanu KSeF."); return body as Center; })
      .then(body => { if (!controller.signal.aborted) setData(body); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Błąd połączenia."); });
    return () => controller.abort();
  }, [companyId, refresh]);

  async function updateCertificate(action: "upload" | "clear", file?: File) {
    if (!companyId) return;
    setSaving(true);
    try {
      let certificateBase64: string | undefined;
      if (action === "upload") {
        if (!file || file.size > 24000 || file.size < 100) throw new Error("Wybierz publiczny certyfikat X.509 (maks. 24 KB). Pliki P12/PFX z kluczem prywatnym nie są przyjmowane.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const content = new TextDecoder().decode(bytes);
        if (/PRIVATE KEY|BEGIN PKCS12/i.test(content)) throw new Error("Nie przesyłaj klucza prywatnego. Wybierz tylko publiczny certyfikat CER/CRT/PEM.");
        if (content.includes("-----BEGIN")) {
          const match = content.match(/^-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END CERTIFICATE-----\s*$/);
          if (!match) throw new Error("Plik PEM musi zawierać jeden publiczny certyfikat X.509.");
          certificateBase64 = match[1].replace(/\s/g, "");
        } else certificateBase64 = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
      }
      const response = await fetch("/api/ksef/center", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, action, certificateBase64 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Nie udało się zapisać informacji o certyfikacie.");
      toast("success", action === "upload" ? "Zapisano datę ważności certyfikatu" : "Usunięto informacje o certyfikacie");
      setRefresh(n => n + 1);
    } catch (cause) { toast("error", "Certyfikat", cause instanceof Error ? cause.message : "Błąd odczytu pliku."); }
    finally { setSaving(false); }
  }

  if (!companyId) return null;
  const urgent = data?.tasks.filter(task => task.stuck || task.status === "failed" || task.status === "verify_needed") || [];
  return <section aria-label="Stan KSeF" className="rounded-2xl border bg-card p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Stan KSeF <span className="ml-1 text-xs font-normal text-muted-foreground">{data?.environment === "demo" ? "(demo · komunikaty produkcyjne MF)" : data?.environment === "test" ? "(test)" : "(produkcja)"}</span></h2>
      <button type="button" onClick={() => setRefresh(n => n + 1)} className="inline-flex items-center gap-1 text-xs text-primary" aria-label="Odśwież stan KSeF"><RefreshCw className="size-3.5" />Odśwież</button>
    </div>
    {error && <p role="alert" className="mt-2 flex items-center gap-1 text-xs text-destructive"><AlertCircle className="size-3.5" />{error}</p>}
    {!data && !error && <p role="status" className="mt-2 text-xs text-muted-foreground">Sprawdzanie stanu…</p>}
    {data && <>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-lg px-2.5 py-1.5 ${data.official.status === "AVAILABLE" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{statusLabel[data.official.status] || "MF: brak danych"}</span>
        <span className={`rounded-lg px-2.5 py-1.5 ${data.certificate.notice === "valid" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{certLabel[data.certificate.notice]}{data.certificate.validTo ? ` · ${new Date(data.certificate.validTo).toLocaleDateString("pl-PL")}` : ""}</span>
        <span className={`rounded-lg px-2.5 py-1.5 ${urgent.length ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>Do sprawdzenia: {urgent.length}{data.limited ? "+" : ""}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>Komunikaty MF: {data.official.status === "UNAVAILABLE" ? "nie udało się pobrać" : data.official.messages.length}</span>
        <span>Kolejka: {Object.entries(data.counts).filter(([key]) => key !== "completed").map(([key, value]) => `${taskLabel[key] || key} ${value}`).join(" · ") || "pusta"}</span>
      </div>
      <details className="mt-3 border-t pt-2 text-xs">
        <summary className="cursor-pointer font-medium">Szczegóły i certyfikat</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="font-medium">Zadania do sprawdzenia</p>
            {urgent.slice(0, 5).map(task => <div key={task.id} className="rounded-lg border p-2"><Link prefetch={false} href={`/invoices/${task.invoiceId}`} className="font-medium text-primary hover:underline">{task.number} · {task.stuck ? "Opóźnione" : taskLabel[task.status]}</Link><span className="ml-1 text-muted-foreground">({task.attempts}/{task.maxAttempts})</span><p className="mt-1 text-muted-foreground">{task.nextStep}</p>{task.status === "verify_needed" && <button type="button" disabled={checking === task.invoiceId} onClick={() => void checkTask(task.invoiceId)} className="mt-1 text-primary underline disabled:opacity-50">{checking === task.invoiceId ? "Sprawdzanie…" : "Sprawdź status w MF"}</button>}</div>)}
            {!urgent.length && <p className="text-muted-foreground">Brak zadań wymagających uwagi w ostatnich 40 wpisach.</p>}
          </div>
          <div className="space-y-2">
            <p className="font-medium">Komunikaty techniczne MF</p>
            {data.official.messages.slice(0, 3).map(message => <p key={message.id} className="rounded-lg border p-2">{message.title || message.category}{message.start && <span className="block text-muted-foreground">Od {new Date(message.start).toLocaleString("pl-PL")}</span>}</p>)}
            {!data.official.messages.length && <p className="text-muted-foreground">{data.official.status === "UNAVAILABLE" ? "Stan komunikatów nieznany." : "Brak aktualnych komunikatów."}</p>}
            <a href="https://ksef.podatki.gov.pl/komunikaty-techniczne/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">Komunikaty MF <ArrowUpRight className="size-3" /></a>
          </div>
        </div>
        <div className="mt-3 border-t pt-3 text-xs">
          <p className="font-medium">Ważność publicznego certyfikatu X.509</p>
          <p className="mt-1 text-muted-foreground">Odczytujemy tylko daty i odcisk pliku; nie zapisujemy certyfikatu ani klucza prywatnego. To lokalny odczyt, bez potwierdzenia uprawnień przez MF.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs hover:border-primary/50">{saving ? "Zapisywanie…" : "Wybierz CER/CRT/PEM"}<input type="file" accept=".cer,.crt,.pem" disabled={saving} className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void updateCertificate("upload", file); event.currentTarget.value = ""; }} /></label>
            {data.certificate.validTo && <button type="button" disabled={saving} onClick={() => void updateCertificate("clear")} className="text-muted-foreground underline disabled:opacity-50">Usuń dane</button>}
            {data.certificate.fingerprintEnd && <span className="text-muted-foreground">Odcisk: …{data.certificate.fingerprintEnd}</span>}
          </div>
        </div>
      </details>
    </>}
  </section>;
}
