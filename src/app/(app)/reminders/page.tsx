"use client";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
type Data={settings:{id:string;invoiceId:string;enabled:boolean;channels:string[];smsPhone:string|null}[];deliveries:{id:string;eventKey:string;status:string;error:string|null;recipient:string|null;channel:string}[];providers:{email:boolean;sms:boolean}};
export default function RemindersPage(){
 const {selectedCompanyId:companyId,invoices}=useAppStore();
 const scope=useRef(companyId);scope.current=companyId;
 const [sms,setSms]=useState(false),[email,setEmail]=useState(true),[phone,setPhone]=useState("");
 const [data,setData]=useState<Data|null>(null),[invoiceId,setInvoiceId]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[version,setVersion]=useState(0),[retry,setRetry]=useState<string|null>(null);
 useEffect(()=>{const controller=new AbortController();setData(null);setError("");setRetry(null);setInvoiceId("");setSms(false);setEmail(true);setPhone("");if(companyId)fetch(`/api/due-reminders?companyId=${companyId}`,{signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[companyId,version]);
 async function save(payload:Record<string,unknown>){const current=companyId;setBusy(true);setError("");try{const r=await fetch("/api/due-reminders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({companyId,...payload})});const d=await r.json();if(!r.ok)throw new Error(d.error);if(scope.current===current)setVersion(v=>v+1);}catch(e){if(scope.current===current)setError(e instanceof Error?e.message:"Błąd");}finally{setBusy(false);}}
 const available=invoices.filter(i=>i.sellerCompanyId===companyId&&i.type==="sale"&&!i.isProforma&&!i.isCorrection);
 return <div className="space-y-4"><PageHeader title="Przypomnienia e-mail i SMS" description="Automatyczne przypomnienie 3 dni przed terminem, w dniu terminu i 7 dni po terminie. Włączane osobno dla faktury."/>{error&&<p role="alert">{error}</p>}
 <Select value={invoiceId} onChange={e=>setInvoiceId(e.target.value)}><option value="">Wybierz fakturę</option>{available.map(i=><option key={i.id} value={i.id}>{i.number} · termin {i.dueDate}</option>)}</Select><div className="my-3 flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={email} onChange={e=>setEmail(e.target.checked)}/> E-mail</label><label><input type="checkbox" checked={sms} disabled={!data?.providers.sms} onChange={e=>setSms(e.target.checked)}/> SMS</label>{sms&&<label>Numer odbiorcy<input type="tel" placeholder="+48 500 000 000" value={phone} onChange={e=>setPhone(e.target.value)} className="ml-2 max-w-full rounded border bg-background p-2"/></label>}</div><p className="mb-3 text-xs text-muted-foreground">{data?.providers.sms?"SMSAPI skonfigurowane. SMS może obejmować do 3 płatnych części.":"SMS wymaga konfiguracji SMSAPI przez administratora."}</p><Button disabled={busy||(!email&&!sms)||!available.some(i=>i.id===invoiceId)} onClick={()=>save({invoiceId,enabled:true,channels:[...(email?["email"]:[]),...(sms?["sms"]:[])],smsPhone:phone})}>Włącz przypomnienia</Button>
 {data?.settings.map(s=><p key={s.id}>{invoices.find(i=>i.id===s.invoiceId)?.number||s.invoiceId} · {s.enabled?"włączone":"wyłączone"} <Button disabled={busy} onClick={()=>save({invoiceId:s.invoiceId,enabled:!s.enabled})}>{s.enabled?"Wyłącz":"Włącz"}</Button></p>)}
 <p>Ostatnie wiadomości</p>{data?.deliveries.map(d=><div key={d.id} className="rounded border p-2">{d.recipient} · {d.channel||"email"} · {d.status} {d.error}{["failed","verify_needed"].includes(d.status)&&<Button disabled={busy} onClick={()=>setRetry(d.id)}>Ponów po sprawdzeniu</Button>}</div>)}
 <ConfirmDialog open={!!retry} onClose={()=>setRetry(null)} title="Ponowić wiadomość?" description="Sprawdź historię dostawcy. Przy niepewnym wyniku poprzednia wiadomość mogła zostać doręczona; ponowienie może wysłać duplikat." onConfirm={()=>{if(retry)void save({action:"retry",id:retry});setRetry(null);}}/>
 </div>;
}
