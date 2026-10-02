"use client";
import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
export function SensitiveDownload({ url, scope }: { url: string; scope: string }) {
  const [open,setOpen]=React.useState(false),[password,setPassword]=React.useState(""),[code,setCode]=React.useState(""),[error,setError]=React.useState(""),[busy,setBusy]=React.useState(false);
  const current=React.useRef(scope), pending=React.useRef(false);current.current=scope;
  React.useEffect(()=>{setOpen(false);setPassword("");setCode("");setError("");setBusy(false);pending.current=false;},[scope]);
  async function download() {
    if(pending.current)return; const operation=scope;pending.current=true;setBusy(true);setError("");
    try {
      const res=await fetch(url);
      if(res.status===428){await res.json();if(current.current===operation)setOpen(true);return;}
      if(!res.ok){const data=await res.json();throw new Error(data.error);}
      const blob=await res.blob();if(current.current!==operation)return;
      const href=URL.createObjectURL(blob),a=document.createElement("a");a.href=href;a.download="dokumenty-"+scope.replace(/[^a-z0-9-]/gi,"-")+".zip";a.click();setTimeout(()=>URL.revokeObjectURL(href),60000);
    }catch(e){if(current.current===operation)setError(e instanceof Error?e.message:"Błąd pobierania.");}
    finally{if(current.current===operation){pending.current=false;setBusy(false);}}
  }
  async function confirm(e:React.FormEvent) {
    e.preventDefault();if(pending.current)return;const operation=scope;pending.current=true;setBusy(true);setError("");
    try {const res=await fetch("/api/auth/step-up",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password,code})}),data=await res.json();if(!res.ok)throw new Error(data.error);if(current.current!==operation)return;setPassword("");setCode("");setOpen(false);pending.current=false;await download();}
    catch(e){if(current.current===operation)setError(e instanceof Error?e.message:"Błąd potwierdzenia.");}
    finally{if(current.current===operation){pending.current=false;setBusy(false);}}
  }
  return <><button type="button" disabled={busy} onClick={()=>void download()} className="text-primary underline">{busy?"Pobieranie…":"Pobierz paczkę miesiąca →"}</button>{error&&!open&&<p role="alert" className="text-rose-600">{error}</p>}<Dialog open={open} dismissible={!busy} onClose={()=>{if(!busy){setOpen(false);setPassword("");setCode("");}}} title="Potwierdź eksport dokumentów"><form onSubmit={confirm} className="space-y-3"><p className="text-sm">Eksport zawiera dane firmy. Potwierdzenie tożsamości jest ważne przez 10 minut; pozostaniesz w wybranym miesiącu.</p><Label htmlFor="month-export-password">Hasło konta</Label><Input id="month-export-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={128} /><Label htmlFor="month-export-code">Kod 2FA lub kod odzyskiwania, jeśli masz włączone 2FA</Label><Input id="month-export-code" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} maxLength={128}/>{error&&<p role="alert">{error}</p>}<Button disabled={busy}>Potwierdź i pobierz</Button></form></Dialog></>;
}
