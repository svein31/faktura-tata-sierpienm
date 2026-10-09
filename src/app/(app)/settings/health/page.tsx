"use client";
import * as React from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

type Task = { id: string; status: string; attempts?: number; maxAttempts?: number; invoiceId?: string; invoice?: { number: string }; fileName?: string; environment?: string; updatedAt?: string; nextAttemptAt?: string | null };
type Health = { backups: { status: string; completedAt: string | null; offsiteStatus: string; offsiteAt: string | null; restoreStatus: string; restoredAt: string | null }; scannerConfigured: boolean; scanRequired: boolean; checkedAt: string; queue: Task[]; ocr: Task[]; webhooks: Task[]; alerts: {kind:string;message:string;href:string}[]; ocrConfigured: boolean; note: string };
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
      <section aria-label="Alerty operatora" className="rounded-xl border bg-card p-3 text-sm"><h2 className="font-semibold">Alerty · {data.alerts.length}</h2>{data.alerts.slice(0,3).map((alert,i)=><Link prefetch={false} key={i} href={alert.href} className="mt-2 block text-xs text-primary hover:underline">{alert.kind} · {alert.message}</Link>)}{data.alerts.length>3&&<details className="mt-2 text-xs"><summary className="cursor-pointer">Pokaż pozostałe ({data.alerts.length-3})</summary>{data.alerts.slice(3).map((alert,i)=><Link prefetch={false} key={i} href={alert.href} className="mt-2 block text-primary hover:underline">{alert.kind} · {alert.message}</Link>)}</details>}{!data.alerts.length&&<p className="mt-1 text-xs text-muted-foreground">Brak bieżących alertów.</p>}<div className="mt-3 space-y-1 border-t pt-3 text-xs"><h3 className="font-medium">Kopie zapasowe i kontrola plików</h3>{([["Kopia bazy", data.backups.status, data.backups.completedAt], ["Kopia poza hostingiem", data.backups.offsiteStatus, data.backups.offsiteAt], ["Próba odtworzenia", data.backups.restoreStatus, data.backups.restoredAt]] as const).map(([label, state, date]) => <p key={label}>{label}: {state === "ok" ? "Aktualne potwierdzenie" : state === "stale" ? "Wymaga interwencji — stare potwierdzenie" : "Brak potwierdzenia"}{date ? " · " + new Date(date).toLocaleString("pl-PL") : ""}</p>)}<p>Antywirus: {data.scannerConfigured ? "skonfigurowany" : "nieskonfigurowany — tylko kontrola typu i aktywnej zawartości"} · {data.scanRequired ? "pełny skan wymagany" : "pełny skan niewymagany"}</p></div></section>
      <details className="rounded-xl border bg-card"><summary className="cursor-pointer p-3 text-sm font-semibold">KSeF · {data.queue.filter(t => t.status !== "completed").length} otwartych</summary><Link prefetch={false} href="/ksef" className="block border-t px-3 py-2 text-xs font-normal text-primary">Otwórz KSeF →</Link>
        <div className="divide-y border-t">{data.queue.length ? data.queue.map(task => <article key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"><div className="min-w-0"><Link prefetch={false} className="font-medium text-primary hover:underline" href={`/invoices/${task.invoiceId}`}>{task.invoice?.number || "Faktura"}</Link><span className="ml-2 text-xs text-muted-foreground">{task.environment} · {task.attempts}/{task.maxAttempts} prób · {task.updatedAt ? new Date(task.updatedAt).toLocaleString("pl-PL") : ""}</span><p className="text-xs text-muted-foreground">{task.status === "verify_needed" ? "Sprawdź status w KSeF przed ponowną wysyłką." : task.status === "failed" ? "Sprawdź przyczynę w szczegółach faktury." : task.status === "completed" ? "Zakończono przetwarzanie." : task.nextAttemptAt ? `Następna próba: ${new Date(task.nextAttemptAt).toLocaleString("pl-PL")}` : "Oczekuje na pracownika kolejki."}</p></div><span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs">{status[task.status] || task.status}</span></article>) : <p className="p-3 text-sm text-muted-foreground">Brak zadań.</p>}</div></details>
      {([["Dokumenty i OCR", data.ocr, "/documents"], ["Webhooki", data.webhooks, "/settings/integrations"]] as const).map(([title, tasks, href]) => <details key={title} className="rounded-xl border bg-card"><summary className="cursor-pointer p-3 text-sm font-semibold">{title} · {tasks.length}</summary><div className="divide-y border-t">{tasks.map(task => <p key={task.id} className="flex justify-between gap-3 p-3 text-sm"><span className="truncate">{task.fileName || task.id}</span><span className="shrink-0 text-muted-foreground">{status[task.status] || task.status}</span></p>)}{!tasks.length && <p className="p-3 text-sm text-muted-foreground">Brak otwartych zadań.</p>}<Link prefetch={false} href={href} className="block p-3 text-xs text-primary">Otwórz moduł →</Link></div></details>)}
    </>}
  </div>;
}
