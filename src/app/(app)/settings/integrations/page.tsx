"use client";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
type Data = { keys: {id:string;name:string;prefix:string;revoked:boolean}[]; webhooks: {id:string;url:string;active:boolean}[]; deliveries: {id:string;status:string;attempts:number;lastError:string|null}[] };
export default function IntegrationsPage() {
  const companyId = useAppStore(s => s.selectedCompanyId);
  const currentCompany = useRef(companyId); currentCompany.current = companyId;
  const [data,setData] = useState<Data|null>(null), [name,setName] = useState(""), [url,setUrl] = useState("");
  const [secret,setSecret] = useState(""), [error,setError] = useState(""), [busy,setBusy] = useState(false), [version,setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setSecret(""); setError("");
    if (companyId) fetch(`/api/integrations?companyId=${companyId}`, { signal: controller.signal }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [companyId,version]);
  async function action(action: string, id?: string) {
    setBusy(true); setError(""); setSecret("");
    try { const r = await fetch("/api/integrations", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({companyId,action,id,name,url}) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); if (currentCompany.current !== companyId) return;
      // Refresh metadata without discarding the one-time credential.
      const response = await fetch(`/api/integrations?companyId=${companyId}`); const metadata = response.ok ? await response.json() : null; if (currentCompany.current !== companyId) return; if (metadata) setData(metadata); setSecret(d.token || d.secret || "");
    } catch(e) { setError(e instanceof Error ? e.message : "Błąd"); } finally {setBusy(false);}
  }
  return <div className="space-y-4"><PageHeader title="API i webhooki" description="Statusy KSeF dla wybranej firmy. Zarządzanie dostępne dla właściciela." />
    {error && <p role="alert">{error}</p>}{secret && <div className="rounded border p-3"><p>Skopiuj sekret — jest wyświetlany tylko raz.</p><code className="break-all">{secret}</code><Button onClick={() => setSecret("")}>Ukryj</Button></div>}
    {data && <><section className="space-y-2"><Label>Nazwa klucza API</Label><Input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/><Button disabled={busy || !name.trim()} onClick={()=>action("createKey")}>Utwórz klucz</Button>
      {data.keys.map(k=><p key={k.id}>{k.name} · {k.prefix}… · {k.revoked ? "unieważniony" : <Button disabled={busy} onClick={()=>action("revokeKey",k.id)}>Unieważnij</Button>}</p>)}
    </section><section className="space-y-2"><Label>Adres webhooka HTTPS</Label><Input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/webhook"/><Button disabled={busy || !url} onClick={()=>action("createWebhook")}>Dodaj webhook</Button>
      {data.webhooks.map(w=><p key={w.id} className="break-all">{w.url} · {w.active ? <Button disabled={busy} onClick={()=>action("disableWebhook",w.id)}>Wyłącz</Button> : "wyłączony"}</p>)}
    </section><section><p>Ostatnie dostarczenia</p>{data.deliveries.map(d=><p key={d.id}>{d.status} · prób: {d.attempts} {d.lastError}</p>)}<Button disabled={busy} onClick={()=>setVersion(v=>v+1)}>Odśwież</Button></section>
    <p className="text-sm">REST: GET /api/v1/ksef/statuses, nagłówek Authorization: Bearer KLUCZ. Parametry: invoiceId lub cursor. Limit 120 żądań/min. Webhook: ksef.status, podpis SHA-256 HMAC z czasu i surowego JSON. Dokumentacja: docs/INTEGRATIONS.md.</p></>}
  </div>;
}
