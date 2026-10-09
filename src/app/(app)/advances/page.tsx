"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { invoiceTotals, formatMoney } from "@/lib/format";
import { buildAdvanceLines, buildFinalLines } from "@/lib/advance-lines";
import { warsawDate } from "@/lib/scheduling";
export default function AdvancesPage(){
 const {invoices,selectedCompanyId:companyId,revalidate}=useAppStore();
 const [sourceId,setSourceId]=useState(""),[kind,setKind]=useState("advance"),[net,setNet]=useState(""),[number,setNumber]=useState(""),[issueDate,setIssueDate]=useState(warsawDate()),[receivedDate,setReceivedDate]=useState(warsawDate()),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[created,setCreated]=useState("");
 const [ledger,setLedger]=useState<{invoiceId:string;sourceId:string;kind:string}[]>([]),[version,setVersion]=useState(0),[requestId,setRequestId]=useState("");
 useEffect(()=>{const controller=new AbortController();setLedger([]);setSourceId("");setCreated("");setError("");setRequestId(crypto.randomUUID());if(companyId)fetch(`/api/invoice-settlements?companyId=${companyId}`,{signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}).then(d=>setLedger(d.settlements)).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[companyId,version]);
 const sources=invoices.filter(i=>i.sellerCompanyId===companyId&&i.isProforma&&i.currency==="PLN"),source=sources.find(i=>i.id===sourceId);
 const documents=ledger.filter(l=>l.sourceId===sourceId).map(l=>invoices.find(i=>i.id===l.invoiceId)).filter((i):i is NonNullable<typeof i>=>!!i);
 const advances=documents.filter(i=>i.documentKind==="advance"),finished=ledger.some(l=>l.sourceId===sourceId&&l.kind==="final");
 let preview=null,previewError="";try{if(source)preview=invoiceTotals({lines:kind==="advance"?buildAdvanceLines(source.lines,advances.map(a=>a.lines),Number(net)):buildFinalLines(source.lines,advances)});}catch(e){previewError=e instanceof Error?e.message:"Nieprawidłowa kwota";}
 async function create(){setBusy(true);setError("");try{const r=await fetch("/api/invoice-settlements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sourceId,kind,amountNet:Number(net),number,issueDate,receivedDate,receiptConfirmed:confirmed,requestId})});const d=await r.json();if(!r.ok)throw new Error(d.error);await revalidate();setCreated(d.invoice.id);setVersion(v=>v+1);}catch(e){setError(e instanceof Error?e.message:"Błąd");}finally{setBusy(false);}}
 return <div className="max-w-3xl space-y-4"><PageHeader title="Proformy i zaliczki" description="Rozliczanie proform PLN. Wprowadź kwotę netto zaliczki i sprawdź wyliczoną kwotę brutto przed wystawieniem."/>
 <Select value={sourceId} onChange={e=>{setSourceId(e.target.value);setRequestId(crypto.randomUUID());setConfirmed(false);}}><option value="">Wybierz proformę</option>{sources.map(i=><option key={i.id} value={i.id}>{i.number}</option>)}</Select>
 <Select value={kind} onChange={e=>{setKind(e.target.value);setRequestId(crypto.randomUUID());}}><option value="advance">Faktura zaliczkowa</option><option value="final">Faktura końcowa / VAT z proformy</option></Select>
 <label className="block"><Label>Numer nowej faktury</Label><Input value={number} onChange={e=>setNumber(e.target.value)}/></label><label className="block"><Label>Data wystawienia</Label><Input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)}/></label>
 {kind==="advance"&&<><label className="block"><Label>Kwota netto zaliczki PLN</Label><Input type="number" min="0.01" step="0.01" value={net} onChange={e=>{setNet(e.target.value);setRequestId(crypto.randomUUID());}}/></label><label className="block"><Label>Rzeczywista data otrzymania zaliczki</Label><Input type="date" value={receivedDate} onChange={e=>setReceivedDate(e.target.value)}/></label><label className="block"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Potwierdzam otrzymanie poniższej kwoty brutto zaliczki.</label></>}
 {preview&&<p>Netto {formatMoney(preview.net)} · VAT {formatMoney(preview.vat)} · Brutto {formatMoney(preview.gross)}</p>}{previewError&&<p>{previewError}</p>}{finished&&<p>Proforma została już rozliczona.</p>}{error&&<p role="alert">{error}</p>}
 <Button disabled={busy||!source||!preview||finished||!number||(kind==="advance"&&!confirmed)} onClick={create}>Wystaw dokument</Button>{created&&<Link prefetch={false} href={`/invoices/${created}`} className="underline">Otwórz wystawiony dokument</Link>}
 {documents.map(i=><p key={i.id}><Link prefetch={false} href={`/invoices/${i.id}`}>{i.number} · {formatMoney(invoiceTotals(i).gross)}</Link></p>)}
 <p className="text-sm text-muted-foreground">Powiązana proforma i dokumenty rozliczenia są chronione przed edycją i usunięciem. Zmiany wymagające korekty rozliczenia należy uzgodnić z księgowością. Ten moduł nie realizuje przelewów.</p>
 </div>;
}
