"use client";
import * as React from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
type Task = { id:string; status:string; attempts?:number; invoiceId?:string; fileName?:string };
type Health = { checkedAt:string; queue:Task[]; ocr:Task[]; webhooks:Task[]; ocrConfigured:boolean; note:string };
export default function HealthPage(){
 const companyId=useAppStore(s=>s.selectedCompanyId),[data,setData]=React.useState<Health|null>(null),[error,setError]=React.useState(""),[attempt,setAttempt]=React.useState(0);
 React.useEffect(()=>{const c=new AbortController();setData(null);setError("");if(companyId)fetch(`/api/workspace/health?companyId=${companyId}`,{signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}).then(d=>{if(!c.signal.aborted)setData(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[companyId,attempt]);
 return <div className="page space-y-4"><PageHeader title="Stan przetwarzania" description="Niedokończone zadania i błędy wybranej firmy." actions={<Button onClick={()=>setAttempt(v=>v+1)}>Odśwież</Button>}/>{error&&<p role="alert">{error}</p>}{data&&<><p className="text-sm text-muted-foreground">Sprawdzono: {new Date(data.checkedAt).toLocaleString("pl-PL")}. OCR: {data.ocrConfigured?"skonfigurowany":"tryb ręczny"}.</p><p className="text-sm text-muted-foreground">{data.note}</p>{([["KSeF",data.queue,"/ksef"],["Dokumenty i OCR",data.ocr,"/documents"],["Webhooki",data.webhooks,"/settings/integrations"]] as const).map(([title,tasks,href])=><section className="rounded-xl border p-4 space-y-2" key={title}><h2 className="font-semibold">{title} ({tasks.length})</h2>{!tasks.length&&<p className="text-sm text-muted-foreground">Brak niedokończonych zadań w tej grupie.</p>}{tasks.map(t=><div key={t.id} className="flex flex-wrap justify-between gap-2 text-sm border-t py-2"><span>{t.fileName||t.id}</span><span>{t.status}{t.attempts!==undefined?` · prób: ${t.attempts}`:""}</span></div>)}<Link className="text-sm text-primary underline" href={href}>Otwórz moduł</Link></section>)}</>}</div>;
}
