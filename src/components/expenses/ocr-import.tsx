'use client';
import * as React from 'react';
import { Camera, ScanLine, Upload, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import type { OcrInvoice, OcrLine } from '@/lib/ocr/contract';

type Draft={id:string;companyId:string;filename:string;data:OcrInvoice;warnings:string[]};
const fields: {key:Exclude<keyof OcrInvoice,'lines'>;label:string;type?:string}[]=[
 {key:'contractorName',label:'Nazwa sprzedawcy'},{key:'nip',label:'NIP sprzedawcy'},
 {key:'number',label:'Nr faktury'},{key:'issueDate',label:'Data wystawienia',type:'date'},
 {key:'saleDate',label:'Data sprzedaży',type:'date'},{key:'dueDate',label:'Termin płatności',type:'date'},
 {key:'totalNet',label:'Kwota netto',type:'number'},{key:'totalVat',label:'Kwota VAT',type:'number'},
 {key:'totalGross',label:'Kwota brutto',type:'number'},{key:'currency',label:'Waluta (ISO)'},{key:'iban',label:'IBAN sprzedawcy'},
];
const lineFields: {key:keyof OcrLine;label:string;numeric?:boolean}[]=[{key:'name',label:'Nazwa'},{key:'quantity',label:'Ilość',numeric:true},{key:'unit',label:'Jednostka'},{key:'vatRate',label:'Stawka VAT'},{key:'net',label:'Netto pozycji',numeric:true},{key:'vat',label:'VAT pozycji',numeric:true},{key:'gross',label:'Brutto pozycji',numeric:true}];
export function OcrImport({onSaved}:{onSaved:()=>void}) {
 const companyId=useAppStore(s=>s.selectedCompanyId);
 const [draft,setDraft]=React.useState<Draft|null>(null),[drafts,setDrafts]=React.useState<Draft[]>([]);
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[configured,setConfigured]=React.useState<boolean|null>(null);
 const [preview,setPreview]=React.useState<{url:string;mime:string}|null>(null);
 const input=React.useRef<HTMLInputElement>(null),camera=React.useRef<HTMLInputElement>(null);
 const activeCompany=React.useRef(companyId); activeCompany.current=companyId;
 const endpoint=`/api/expenses/ocr?companyId=${companyId||''}`;
 const load=React.useCallback(async()=>{
  if(!companyId)return;
  const id=companyId;
  try {const r=await fetch(`/api/expenses/ocr?companyId=${id}`); const d=await r.json();if(!r.ok)throw new Error(d.error);if(activeCompany.current!==id)return;setDrafts(d.drafts);setConfigured(d.configured);}catch(e){if(activeCompany.current===id)setError(e instanceof Error?e.message:'Nie udało się pobrać odczytów.');}
 },[companyId]);
 React.useEffect(()=>{setDraft(null);setDrafts([]);setConfigured(null);setError('');setPreview(null);void load();},[load]);
 React.useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 async function upload(file:File|undefined) {
  if(!file||!companyId)return;
  if(file.size>10*1024*1024){setError('Maksymalny rozmiar dokumentu to 10 MB.');return;}
  const uploadingCompany=companyId;setBusy(true);setError('');
  try {const form=new FormData();form.append('file',file);const r=await fetch(endpoint,{method:'POST',body:form});const d=await r.json();if(!r.ok)throw new Error(d.error);if(activeCompany.current!==uploadingCompany)return;setDraft(d.draft);setPreview({url:URL.createObjectURL(file),mime:file.type});void load();}
  catch(e){if(activeCompany.current===uploadingCompany)setError(e instanceof Error?e.message:'Błąd odczytu.');}finally{setBusy(false);if(input.current)input.current.value='';if(camera.current)camera.current.value='';}
 }
 async function confirm(e:React.FormEvent) {
  e.preventDefault();if(!draft||draft.companyId!==companyId)return;setBusy(true);setError('');
  try {const r=await fetch(`/api/expenses/ocr/${draft.id}/confirm?companyId=${companyId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft.data)});const d=await r.json();if(!r.ok)throw new Error(d.error);setDraft(null);setPreview(null);await load();onSaved();}
  catch(e){setError(e instanceof Error?e.message:'Nie udało się zapisać kosztu.');}finally{setBusy(false);}
 }
 function setValue(key:Exclude<keyof OcrInvoice,'lines'>,value:string,numeric=false){setDraft(old=>old?{...old,data:{...old.data,[key]:value===''?null:numeric?Number(value):value}}:null);}
 return <>
  <Card style={{padding:'1rem',marginBottom:'1rem'}}>
   <div style={{display:'flex',gap:'1rem',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}>
    <div><h2 style={{fontWeight:700}}><ScanLine size={18} style={{display:'inline',marginRight:8}}/>Odczytaj fakturę kosztową</h2><p style={{color:'var(--muted)',fontSize:14}}>PDF lub zdjęcie → sprawdzenie danych → zatwierdzenie kosztu.</p></div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
     <Button type="button" variant="outline" disabled={busy||!companyId||configured!==true} onClick={()=>input.current?.click()}><Upload size={16}/>{busy?'Odczytywanie…':'Wybierz PDF / zdjęcie'}</Button>
     <Button type="button" variant="primary" disabled={busy||!companyId||configured!==true} onClick={()=>camera.current?.click()}><Camera size={16}/>Zrób zdjęcie faktury</Button>
    </div>
   </div>
   <input ref={input} hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0])}/>
   <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={e=>void upload(e.target.files?.[0])}/>
   {!companyId&&<p>Wybierz profil firmy, do której należy koszt.</p>}
   {configured===false&&<p style={{marginTop:8,color:'var(--muted)'}}>OCR oczekuje na wybór i konfigurację dostawcy przez administratora. Możesz dodać koszt ręcznie.</p>}
   {error&&!draft&&<p role="alert" style={{color:'var(--danger)',marginTop:8}}>{error}</p>}
   {drafts.length>0&&<div style={{marginTop:12}}><p>Odczyty do sprawdzenia (przechowywane przez 7 dni):</p>{drafts.map(d=><div key={d.id} style={{display:'flex',gap:8}}><Button type="button" variant="ghost" onClick={()=>{setDraft(d);setPreview(null);setError('');}}>{d.filename}</Button><Button type="button" variant="ghost" aria-label={`Usuń odczyt ${d.filename}`} disabled={busy} onClick={async()=>{setBusy(true);try{const r=await fetch(`/api/expenses/ocr/${d.id}?companyId=${companyId}`,{method:'DELETE'});const data=await r.json();if(!r.ok)throw new Error(data.error);await load();}catch(e){setError(e instanceof Error?e.message:'Nie udało się usunąć odczytu.');}finally{setBusy(false);}}}><Trash2 size={14}/></Button></div>)}</div>}
  </Card>
  <Dialog size="lg" open={!!draft} title="Sprawdź odczytaną fakturę" onClose={()=>{if(!busy){setDraft(null);setPreview(null);setError('');}}}>
   {draft&&<form onSubmit={confirm} style={{display:'grid',gap:16}}>
    <p>Sprawdź dane ze źródłem. Zatwierdzenie zapisze dokument w kosztach wybranej firmy.</p>
    {!!draft.warnings.length&&<ul style={{color:'var(--warning)'}}>{draft.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}
    {preview&&<a href={preview.url} target="_blank" rel="noreferrer">Otwórz podgląd dokumentu źródłowego</a>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
     {fields.map(f=><div key={f.key}><Label htmlFor={`ocr-${f.key}`}>{f.label}</Label><Input id={`ocr-${f.key}`} type={f.type||'text'} step={f.type==='number'?'0.01':undefined} value={draft.data[f.key]??''} onChange={e=>setValue(f.key,e.target.value,f.type==='number')} required={['contractorName','number','issueDate','totalNet','totalVat','totalGross','currency'].includes(f.key)}/></div>)}
    </div>
    <h3>Pozycje faktury</h3>
    {draft.data.lines.map((l,i)=><fieldset key={i} style={{border:'1px solid var(--border)',borderRadius:8,padding:12}}><legend>Pozycja {i+1}</legend><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8}}>{lineFields.map(f=><div key={f.key}><Label htmlFor={`ocr-line-${i}-${f.key}`}>{f.label}</Label><Input id={`ocr-line-${i}-${f.key}`} type={f.numeric?'number':'text'} step={f.key==='quantity'?'any':'0.01'} value={l[f.key]??''} onChange={e=>{const value=e.target.value;setDraft(d=>d?{...d,data:{...d.data,lines:d.data.lines.map((v,j)=>i===j?{...v,[f.key]:value===''?null:f.numeric?Number(value):value}:v)}}:null);}}/></div>)}</div><Button type="button" variant="ghost" onClick={()=>setDraft(d=>d?{...d,data:{...d.data,lines:d.data.lines.filter((_,j)=>i!==j)}}:null)}><Trash2 size={14}/>Usuń pozycję</Button></fieldset>)}
    <Button type="button" variant="outline" onClick={()=>setDraft(d=>d?{...d,data:{...d.data,lines:[...d.data.lines,{name:'',quantity:null,unit:null,net:null,vat:null,gross:null,vatRate:null}]}}:null)}><Plus size={16}/>Dodaj pozycję</Button>
    {error&&<p role="alert" style={{color:'var(--danger)'}}>{error}</p>}
    <Button type="submit" variant="primary" disabled={busy}>{busy?'Zapisywanie…':'Zatwierdź i zapisz koszt'}</Button>
   </form>}
  </Dialog>
 </>;
}
