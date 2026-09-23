"use client";
import * as React from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

type Task = { id: string; status: string; attempts?: number; maxAttempts?: number; invoiceId?: string; invoice?: { number: string }; fileName?: string; environment?: string; updatedAt?: string; nextAttemptAt?: string | null };
type Health = { checkedAt: string; queue: Task[]; ocr: Task[]; webhooks: Task[]; ocrConfigured: boolean; note: string };
const status: Record<string, string> = { queued: "Oczekuje", processing: "Przetwarzanie", failed: "Błąd", verify_needed: "Wymaga weryfikacji", completed: "Zakończono" };

export default function HealthPage() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const [data, setData] = React.useState<Health | null>(null);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    if (companyId) fetch(`/api/workspace/health?companyId=${encodeURIComponent(companyId)}`, { signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Nie udało się pobrać stanu."); return result as Health; })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [companyId, refresh]);
  return <div className="space-y-4"><PageHeader title="Stan przetwarzania" description="Zadania i problemy wybranej firmy." actions={<Button onClick={() => setRefresh(v => v + 1)}>Odśwież</Button>} />
    {!companyId && <p className="text-sm">Wybierz firmę.</p>}
    {error && <p role="alert" className="rounded-xl border p-3 text-sm">{error}</p>}
    {companyId && !data && !error && <p role="status" className="text-sm text-muted-foreground">Wczytywanie…</p>}
    {data && <>
      <p className="text-xs text-muted-foreground">Sprawdzono {new Date(data.checkedAt).toLocaleString("pl-PL")} · OCR: {data.ocrConfigured ? "skonfigurowany" : "ręczne sprawdzanie"} · maks. 50 zadań w grupie</p>
      <section className="rounded-xl border bg-card"><div className="flex justify-between border-b p-3"><h2 className="text-sm font-semibold">KSeF · {data.queue.filter(t => t.status !== "completed").length} otwartych</h2><Link href="/ksef" className="text-xs text-primary">Otwórz KSeF →</Link></div>
        <div className="divide-y">{data.queue.length ? data.queue.map(task => <article key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"><div className="min-w-0"><Link className="font-medium text-primary hover:underline" href={`/invoices/${task.invoiceId}`}>{task.invoice?.number || "Faktura"}</Link><span className="ml-2 text-xs text-muted-foreground">{task.environment} · {task.attempts}/{task.maxAttempts} prób · {task.updatedAt ? new Date(task.updatedAt).toLocaleString("pl-PL") : ""}</span><p className="text-xs text-muted-foreground">{task.status === "verify_needed" ? "Sprawdź status w KSeF przed ponowną wysyłką." : task.status === "failed" ? "Sprawdź przyczynę w szczegółach faktury." : task.status === "completed" ? "Zakończono przetwarzanie." : task.nextAttemptAt ? `Następna próba: ${new Date(task.nextAttemptAt).toLocaleString("pl-PL")}` : "Oczekuje na pracownika kolejki."}</p></div><span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs">{status[task.status] || task.status}</span></article>) : <p className="p-3 text-sm text-muted-foreground">Brak zadań.</p>}</div></section>
      {([["Dokumenty i OCR", data.ocr, "/documents"], ["Webhooki", data.webhooks, "/settings/integrations"]] as const).map(([title, tasks, href]) => <details key={title} className="rounded-xl border bg-card"><summary className="cursor-pointer p-3 text-sm font-semibold">{title} · {tasks.length}</summary><div className="divide-y border-t">{tasks.map(task => <p key={task.id} className="flex justify-between gap-3 p-3 text-sm"><span className="truncate">{task.fileName || task.id}</span><span className="shrink-0 text-muted-foreground">{status[task.status] || task.status}</span></p>)}{!tasks.length && <p className="p-3 text-sm text-muted-foreground">Brak otwartych zadań.</p>}<Link href={href} className="block p-3 text-xs text-primary">Otwórz moduł →</Link></div></details>)}
    </>}
  </div>;
}
