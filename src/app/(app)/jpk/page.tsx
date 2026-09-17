"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default function JpkPage(){
 const companyId=useAppStore(s=>s.selectedCompanyId);
 const [form,setForm]=useState({format:"fa",dateFrom:"",dateTo:"",office:"",email:"",currency:"PLN",individual:false,firstName:"",lastName:"",birthDate:"",exemptionBasis:"",normalDomestic:false,fullDeduction:false,noSpecialCodes:false,nonKsefCode:"BFK"});
 const [address,setAddress]=useState<Record<string,string>>({}),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function download(){setBusy(true);setError("");try{const r=await fetch("/api/jpk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,address,companyId})});if(!r.ok){const d=await r.json();throw new Error(d.error);}
 const url=URL.createObjectURL(await r.blob()),a=document.createElement("a");a.href=url;a.download=`${form.format==='fa'?'JPK_FA4':'JPK_V7M3-ewidencja'}-${form.dateFrom}.xml`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){setError(e instanceof Error?e.message:"Błąd eksportu");}finally{setBusy(false);}}
 const field=(key:"dateFrom"|"dateTo"|"office"|"email"|"firstName"|"lastName"|"birthDate"|"exemptionBasis",label:string,type="text")=><label className="block space-y-1" key={key}><Label>{label}</Label><Input type={type} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>;
 return <div className="max-w-3xl space-y-4"><PageHeader title="Eksport JPK" description="Eksport XML dla wybranej firmy. Zwykłe krajowe transakcje VAT; plik wymaga sprawdzenia przez księgowość."/>
 <Select value={form.format} onChange={e=>setForm({...form,format:e.target.value})}><option value="fa">JPK_FA(4) — faktury sprzedaży</option><option value="vat">JPK_V7M(3) — ewidencja do księgowości</option></Select>
 {form.format==='vat'&&<p className="rounded border p-3">Plik zawiera samą ewidencję, bez deklaracji VAT. Nie jest kompletnym pierwotnym JPK_V7M do złożenia w urzędzie. Wybierz pełny miesiąc od lutego 2026. Okres oparty na dacie wystawienia — księgowość musi sprawdzić właściwy okres podatkowy.</p>}
 <div className="grid gap-3 sm:grid-cols-2">{field("dateFrom","Od","date")}{field("dateTo","Do","date")}{field("office","Kod urzędu skarbowego (4 cyfry)")}
 {form.format==='fa'?<><label><Label>Waluta faktur</Label><Select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{['PLN','EUR','USD','GBP'].map(c=><option key={c}>{c}</option>)}</Select></label>{['Wojewodztwo','Powiat','Gmina','Ulica','NrDomu','NrLokalu','Miejscowosc','KodPocztowy'].map(k=><label key={k}><Label>{k}</Label><Input value={address[k]||""} onChange={e=>setAddress({...address,[k]:e.target.value})}/></label>)}{field('exemptionBasis','Podstawa prawna zwolnienia VAT (jeżeli występuje)')}</>:<>{field('email','E-mail podatnika','email')}<label><input type="checkbox" checked={form.individual} onChange={e=>setForm({...form,individual:e.target.checked})}/> Podatnik jest osobą fizyczną (np. JDG)</label>{form.individual&&<>{field('firstName','Pierwsze imię')}{field('lastName','Nazwisko')}{field('birthDate','Data urodzenia','date')}</>}<label><Label>Oznaczenie dokumentów bez numeru KSeF</Label><Select value={form.nonKsefCode} onChange={e=>setForm({...form,nonKsefCode:e.target.value})}><option value="BFK">BFK — faktura poza KSeF</option><option value="OFF">OFF — faktura w trybie awarii</option><option value="DI">DI — inny dokument</option></Select></label></>}
 </div>
 <label className="block"><input type="checkbox" checked={form.normalDomestic} onChange={e=>setForm({...form,normalDomestic:e.target.checked})}/> Potwierdzam: zwykłe transakcje krajowe, bez metody kasowej, samofakturowania, marży, OSS/IOSS, odwrotnego obciążenia, MPP i innych szczególnych adnotacji.</label>
 {form.format==='vat'&&<><label className="block"><input type="checkbox" checked={form.noSpecialCodes} onChange={e=>setForm({...form,noSpecialCodes:e.target.checked})}/> Potwierdzam brak GTU i procedur szczególnych dla wszystkich dokumentów w eksporcie.</label><label className="block"><input type="checkbox" checked={form.fullDeduction} onChange={e=>setForm({...form,fullDeduction:e.target.checked})}/> Zakupy: pełne odliczenie VAT, brak środków trwałych i szczególnych korekt odliczenia.</label></>}
 {error&&<p role="alert">{error}</p>}<Button disabled={busy||!companyId||!form.normalDomestic} onClick={download}>{busy?'Generowanie…':'Pobierz XML'}</Button>
 </div>;
}
