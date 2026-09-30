"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
type Data={settings:{id:string;invoiceId:string;enabled:boolean}[];deliveries:{id:string;eventKey:string;status:string;error:string|null;recipient:string|null}[]};
export default function RemindersPage(){
 const {selectedCompanyId:companyId,invoices}=useAppStore();
 const [sms,setSms]=useState(false),[phone,setPhone]=useState("");
 const [data,setData]=useState<Data|null>(null),[invoiceId,setInvoiceId]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[version,setVersion]=useState(0),[retry,setRetry]=useState<string|null>(null);
 useEffect(()=>{const controller=new AbortController();setData(null);setError("");setRetry(null);setInvoiceId("");if(companyId)fetch(`/api/due-reminders?companyId=${companyId}`,{signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[companyId,version]);
 async function save(payload:Record<string,unknown>){setBusy(true);setError("");try{const r=await fetch("/api/due-reminders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({companyId,...payload})});const d=await r.json();if(!r.ok)throw new Error(d.error);setVersion(v=>v+1);}catch(e){setError(e instanceof Error?e.message:"Błąd");}finally{setBusy(false);}}
 const available=invoices.filter(i=>i.sellerCompanyId===companyId&&i.type==="sale"&&!i.isProforma&&!i.isCorrection);
 return <div className="space-y-4"><PageHeader title="Przypomnienia płatności" description="Automatyczne przypomnienie 3 dni przed terminem, w dniu terminu i 7 dni po terminie. E-mail i opcjonalny SMS są włączane osobno dla faktury."/>{error&&<p role="alert">{error}</p>}
 <Select value={invoiceId} onChange={e=>setInvoiceId(e.target.value)}><option value="">Wybierz fakturę</option>{available.map(i=><option key={i.id} value={i.id}>{i.number} · termin {i.dueDate}</option>)}</Select><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sms} onChange={e=>setSms(e.target.checked)}/>Dodaj SMS</label>{sms&&<label className="text-sm">Numer odbiorcy<input className="ml-2 rounded border bg-background p-2" type="tel" placeholder="+48123456789" value={phone} onChange={e=>setPhone(e.target.value)}/></label>}<Button disabled={busy||!available.some(i=>i.id===invoiceId)} onClick={()=>save({invoiceId,enabled:true,channels:sms?["email","sms"]:["email"],smsRecipient:phone})}>Włącz przypomnienia</Button></div><p className="text-sm text-muted-foreground">SMS wymaga konfiguracji Twilio przez operatora; naliczane są opłaty dostawcy. Status „sent” potwierdza przyjęcie wiadomości, a nie jej przeczytanie.</p>
 {data?.settings.map(s=><p key={s.id}>{invoices.find(i=>i.id===s.invoiceId)?.number||s.invoiceId} · {s.enabled?"włączone":"wyłączone"} <Button disabled={busy} onClick={()=>save({invoiceId:s.invoiceId,enabled:!s.enabled})}>{s.enabled?"Wyłącz":"Włącz"}</Button></p>)}
 <p>Ostatnie wiadomości</p>{data?.deliveries.map(d=><div key={d.id} className="rounded border p-2">{d.recipient} · {d.status} {d.error}{["failed","verify_needed"].includes(d.status)&&<Button disabled={busy} onClick={()=>setRetry(d.id)}>Ponów po sprawdzeniu</Button>}</div>)}
 <ConfirmDialog open={!!retry} onClose={()=>setRetry(null)} title="Ponowić wiadomość?" description="Sprawdź historię dostawcy poczty. Przy niepewnym wyniku poprzednia wiadomość mogła zostać doręczona; ponowienie może wysłać duplikat." onConfirm={()=>{if(retry)void save({action:"retry",id:retry});setRetry(null);}}/>
 </div>;
}
