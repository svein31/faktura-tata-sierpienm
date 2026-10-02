"use client";
import * as React from "react";
import type { Invoice } from "@/lib/types";
import type { PreflightIssue } from "@/lib/invoice-preflight";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
export function StoredInvoiceAssistant({ invoice, action, onClose, onApprove }: { invoice: Invoice; action: string | null; onClose: () => void; onApprove: () => void }) {
  const [result, setResult] = React.useState<{canProceed: boolean; issues: PreflightIssue[]} | null>(null), [error,setError]=React.useState("");
  React.useEffect(() => {
    setResult(null);setError(""); if(!action)return;
    const controller=new AbortController();
    fetch("/api/invoices/preflight",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...invoice,companyId:invoice.sellerCompanyId,invoiceId:invoice.id}),signal:controller.signal})
      .then(async res=>{const body=await res.json();if(!res.ok)throw new Error(body.error);return body;})
      .then(body=>{if(!controller.signal.aborted)setResult(body);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[action,invoice]);
  return <Dialog open={Boolean(action)} onClose={onClose} title="Asystent przed wysyłką faktury" footer={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onClose}>Wróć do dokumentu</Button><Button disabled={!result?.canProceed} onClick={onApprove}>Zatwierdzam i kontynuuję</Button></div>}><div className="space-y-3 text-sm">
    {error && <p role="alert">{error}</p>}
    {!result && !error && <p>Sprawdzanie danych…</p>}
    {result?.issues.map(issue=><div key={issue.code} className="rounded-lg border p-3"><p>{issue.severity==="error"?"Popraw dane":"Sprawdź"} · {issue.message}</p>{issue.href&&<a href={issue.href} target="_blank" rel="noopener noreferrer" className="mt-2 block text-primary underline">Otwórz dokument →</a>}</div>)}
    {result && !result.issues.length && <p>Nie znaleziono błędów danych i numeracji. Sprawdź podgląd oraz właściwe opodatkowanie.</p>}
  </div></Dialog>;
}
