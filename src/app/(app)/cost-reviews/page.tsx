"use client";
import * as React from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";

type Step = { userId: string; name: string };
type Review = { id: string; number: string; status: string; currentStep: number; steps: Step[]; version: number; documentId: string; documentType: string; snapshot: { totalNet: number; totalVat: number; totalGross: number; currency: string; issueDate: string } };
type Event = { id: string; authorName: string; action: string; message: string; step: number; createdAt: string };
type Listing = { reviews: Review[]; nextCursor: string | null; policy: { steps: Step[]; version: number }; approvers: Step[]; userId: string; role: string; candidates: { id: string; documentType: string; number: string; totalGross: number; currency: string; issueDate: string }[] };
const statusLabel: Record<string, string> = { pending: "W akceptacji", approved: "Zaakceptowany", rejected: "Odrzucony" };
const actionLabel: Record<string, string> = { submit: "Przekazanie do obiegu", approve: "Akceptacja etapu", reject: "Odrzucenie", comment: "Komentarz", reopen: "Ponowne otwarcie" };

export default function CostReviewsPage() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  return <div className="page space-y-4"><PageHeader title="Obieg kosztów" description="Akceptacja etapami, komentarze i historia decyzji. Dane oryginalnych faktur pozostają niezmienne." />{companyId ? <Workspace key={companyId} companyId={companyId} /> : <p>Wybierz firmę.</p>}</div>;
}
function Workspace({ companyId }: { companyId: string }) {
  const [data, setData] = React.useState<Listing | null>(null), [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all"), [selected, setSelected] = React.useState<Review | null>(null);
  const [events, setEvents] = React.useState<Event[]>([]), [historyCursor, setHistoryCursor] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState(""), [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false), [loading, setLoading] = React.useState(false);
  const generation = React.useRef(0), detailGeneration = React.useRef(0), mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++generation.current; ++detailGeneration.current; }; }, []);
  const load = React.useCallback(async (cursor?: string) => {
    const current = ++generation.current; setLoading(true);
    try {
      const query = new URLSearchParams({ companyId, search, status, ...(cursor ? { cursor } : {}) });
      const response = await fetch(`/api/cost-reviews?${query}`), result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (current === generation.current && mounted.current) setData(previous => ({ ...result, reviews: cursor && previous ? [...previous.reviews, ...result.reviews] : result.reviews }));
    } catch (e) { if (current === generation.current && mounted.current) setError(e instanceof Error ? e.message : "Błąd pobierania."); }
    finally { if (current === generation.current && mounted.current) setLoading(false); }
  }, [companyId, search, status]);
  React.useEffect(() => { setData(null); setError(""); const timer = setTimeout(() => void load(), 250); return () => { clearTimeout(timer); ++generation.current; }; }, [load]);
  const open = async (id: string, cursor?: string) => {
    const current = ++detailGeneration.current;
    try {
      const query = new URLSearchParams({ companyId, reviewId: id, ...(cursor ? { cursor } : {}) });
      const response = await fetch(`/api/cost-reviews?${query}`), result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (mounted.current && current === detailGeneration.current) { setSelected(result.review); setEvents(previous => cursor ? [...previous, ...result.events] : result.events); setHistoryCursor(result.nextCursor); if (!cursor) setMessage(""); }
    } catch (e) { if (mounted.current && current === detailGeneration.current) setError(e instanceof Error ? e.message : "Błąd podglądu."); }
  };
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("reviewId");
    if (id && /^[0-9a-f]{24}$/i.test(id)) void open(id);
    // A deep link is opened once when this company workspace mounts.
  }, [companyId]);
  const command = async (body: Record<string, unknown>) => {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/cost-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) }), result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!mounted.current) return;
      await load(); if (result.review) await open(result.review.id);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Błąd zapisu. Odśwież obieg przed ponowieniem decyzji."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const decision = selected?.status === "pending" && selected.steps[selected.currentStep]?.userId === data?.userId;
  const money = (amount: number, currency: string) => `${amount.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  return <div className="space-y-4">
    {error && <div role="alert" className="rounded-xl border border-rose-500 p-3 text-sm">{error}<Button variant="ghost" onClick={() => { void load(); if (selected) void open(selected.id); }}>Odśwież</Button></div>}
    {data?.role === "owner" && <Policy key={data.policy.version} data={data} busy={busy} command={command} />}
    <div className="grid sm:grid-cols-2 gap-3"><Input aria-label="Szukaj numeru kosztu" placeholder="Numer dokumentu…" value={search} onChange={e => setSearch(e.target.value)} /><Select aria-label="Status obiegu" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Wszystkie statusy</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
    {data && data.role !== "viewer" && <details className="rounded-xl border p-3"><summary className="cursor-pointer">Przekaż dokument do akceptacji</summary><p className="text-xs text-muted-foreground my-2">Do 20 ostatnich faktur zakupowych i 20 kosztów bez obiegu. Wyszukaj numer, żeby zawęzić listę. Przekazanie rozpoczyna akceptację od pierwszej osoby.</p><div className="space-y-2">{data.candidates.map(doc => <div key={`${doc.documentType}:${doc.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2"><span className="text-sm">{doc.number} · {doc.issueDate} · {money(doc.totalGross, doc.currency)}</span><Button disabled={busy} onClick={() => command({ action: "submit", documentType: doc.documentType, documentId: doc.id })}>Przekaż do obiegu</Button></div>)}</div></details>}
    {loading && <p role="status">Wczytywanie…</p>}
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2">{data?.reviews.map(review => <button key={review.id} disabled={busy} onClick={() => open(review.id)} className={`w-full rounded-xl border p-3 text-left ${selected?.id === review.id ? "border-primary" : ""}`}><span className="block font-medium">{review.number}</span><span className="text-xs text-muted-foreground">{statusLabel[review.status]} · Etap {review.currentStep + 1}/{review.steps.length}</span></button>)}{data && !data.reviews.length && !loading && <p className="text-sm text-muted-foreground">Brak obiegów w tym widoku.</p>}{data?.nextCursor && <Button disabled={loading} onClick={() => load(data.nextCursor!)}>Wczytaj następne</Button>}</div>
      {selected && <section className="rounded-xl border p-4 space-y-4">
        <div><h2 className="font-semibold">{selected.number}</h2><p className="text-sm">{statusLabel[selected.status]}</p><Link prefetch={false} className="text-sm underline text-primary" href={selected.documentType === "invoice" ? `/invoices/${selected.documentId}` : "/expenses"}>Podgląd dokumentów źródłowych</Link></div>
        <p className="text-sm">Netto: {money(selected.snapshot.totalNet, selected.snapshot.currency)} · VAT: {money(selected.snapshot.totalVat, selected.snapshot.currency)} · Brutto: {money(selected.snapshot.totalGross, selected.snapshot.currency)}</p>
        <ol className="list-decimal pl-5 text-sm space-y-1">{selected.steps.map((step, i) => <li key={step.userId}>{step.name}{i === selected.currentStep && selected.status === "pending" ? " — oczekuje na decyzję" : i < selected.currentStep || selected.status === "approved" ? " — zaakceptowano" : ""}</li>)}</ol>
        {data?.role !== "viewer" && <><label className="block text-sm">Komentarz lub uzasadnienie<Textarea maxLength={2000} value={message} disabled={busy} onChange={e => setMessage(e.target.value)} /></label><div className="flex flex-wrap gap-2"><Button disabled={busy || !message.trim()} variant="ghost" onClick={() => command({ action: "comment", reviewId: selected.id, version: selected.version, message })}>Dodaj komentarz</Button>{decision && <><Button disabled={busy} onClick={() => command({ action: "approve", reviewId: selected.id, version: selected.version, message })}>Akceptuję etap</Button><Button variant="ghost" disabled={busy || !message.trim()} onClick={() => command({ action: "reject", reviewId: selected.id, version: selected.version, message })}>Odrzuć z uzasadnieniem</Button></>}{data?.role === "owner" && <Button variant="ghost" disabled={busy || !message.trim()} onClick={() => { if (window.confirm("Rozpocząć akceptację od początku według obecnych zasad?")) void command({ action: "reopen", reviewId: selected.id, version: selected.version, message }); }}>Otwórz ponownie</Button>}</div></>}
        <h3 className="font-medium">Historia decyzji i komentarzy</h3><div className="space-y-3">{events.map(event => <article key={event.id} className="border-t pt-2 text-sm"><p>{event.authorName} · {actionLabel[event.action] || event.action} · Etap {event.step + 1}</p><time className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}</time>{event.message && <p className="whitespace-pre-wrap mt-1">{event.message}</p>}</article>)}</div>{historyCursor && <Button variant="ghost" onClick={() => open(selected.id, historyCursor)}>Starsza historia</Button>}
      </section>}
    </div>
  </div>;
}
function Policy({ data, busy, command }: { data: Listing; busy: boolean; command: (body: Record<string, unknown>) => Promise<void> }) {
  const [steps, setSteps] = React.useState(data.policy.steps.map(s => s.userId));
  return <details className="rounded-xl border p-3"><summary className="cursor-pointer">Kolejność akceptacji w firmie</summary><p className="text-xs text-muted-foreground my-2">Zasady dotyczą nowych i ponownie otwieranych obiegów. Zmiana nie przestawia etapów trwającej akceptacji. Dostępne są osoby z uprawnieniem eksportu księgowego.</p><div className="space-y-2">{steps.map((id, index) => <label key={index} className="flex gap-2 items-center text-sm"><span>Etap {index + 1}</span><Select value={id} disabled={busy} onChange={e => setSteps(previous => previous.map((v, i) => i === index ? e.target.value : v))}><option value="">Wybierz osobę</option>{data.approvers.map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}</Select><Button variant="ghost" disabled={busy || steps.length === 1} onClick={() => setSteps(previous => previous.filter((_, i) => i !== index))}>Usuń</Button></label>)}</div><div className="flex gap-2 mt-3"><Button variant="ghost" disabled={busy || steps.length >= 5} onClick={() => setSteps(previous => [...previous, ""])}>Dodaj etap</Button><Button disabled={busy || steps.some(id => !id) || new Set(steps).size !== steps.length} onClick={() => command({ action: "policy", version: data.policy.version, steps: steps.map(userId => ({ userId })) })}>Zapisz zasady</Button></div></details>;
}
