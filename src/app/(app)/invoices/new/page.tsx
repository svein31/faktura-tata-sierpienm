"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { InvoiceCreator } from "@/components/invoice/invoice-creator";
import { PageHeader } from "@/components/page-header";
import { InvoiceDetailSkeleton } from "@/components/ui/skeleton";

export default function NewInvoicePage() {
  const router = useRouter();
  React.useEffect(() => { void import("@/lib/pilot-client").then(m => m.sendCreatorCheckpoint()).catch(() => {}); }, []);
  const draft = useAppStore((s) => s.draftInvoice);
  const editorSession = useAppStore(s => s.invoiceEditorSession);
  const companyId = useAppStore((s) => s.selectedCompanyId);
  const draftIsNew = useAppStore(s => s.draftInvoiceIsNew);
  React.useEffect(() => {
    if (!draftIsNew && draft?.sellerCompanyId && draft.sellerCompanyId !== companyId && useAppStore.getState().companies.some(company => company.id === draft.sellerCompanyId)) {
      useAppStore.getState().setSelectedCompanyId(draft.sellerCompanyId);
    }
  }, [draftIsNew, draft?.sellerCompanyId, companyId]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState("");
  const uploadPurchase = async (file?: File) => {
    if (!file) return;
    if (!companyId) { setUploadError("Wybierz firmę przed dodaniem faktury zakupowej."); return; }
    if (file.size > 3 * 1024 * 1024) { setUploadError("Plik może mieć najwyżej 3 MB."); return; }
    setUploading(true); setUploadError("");
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(`/api/documents?companyId=${encodeURIComponent(companyId)}`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nie udało się wczytać faktury.");
      router.push(`/documents?document=${encodeURIComponent(data.id)}`);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Nie udało się wczytać faktury.");
    } finally { setUploading(false); }
  };
  const blocked = draft?.type === "purchase";
  React.useEffect(() => {
    if (blocked && draft?.id) router.replace("/invoices/" + draft.id);
  }, [blocked, draft?.id, router]);
  if (blocked) return <InvoiceDetailSkeleton />;

  return (
    <div>
      <PageHeader
        title="Kreator e-Faktury"
        description="Wybierz nabywcę, dodaj pozycje i sprawdź podgląd. Możesz zapisać szkic przed wystawieniem dokumentu."
      />
      <details className="mb-6 rounded-lg border p-4" aria-label="Faktura zakupowa">
        <summary className="cursor-pointer text-sm font-medium">Chcesz dodać fakturę zakupową od sprzedawcy?</summary>
        <p className="mt-1 text-sm text-muted-foreground">Wczytaj PDF, JPG lub PNG (do 3 MB). Sprawdź dane w skrzynce i zatwierdź dokument, aby dodać go do kosztów firmy. Opcjonalny OCR pomaga przepisać dane.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
            {uploading ? "Wczytywanie…" : "Wczytaj fakturę zakupową"}
            <input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading || !companyId} onChange={e => { void uploadPurchase(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <Link prefetch={false} className="text-sm text-primary underline" href="/documents">Skrzynka dokumentów</Link>
        </div>
        {!companyId && <p className="mt-2 text-sm">Wybierz firmę, aby dodać dokument.</p>}
        {uploadError && <p className="mt-2 text-sm text-destructive" role="alert">{uploadError}</p>}
      </details>
      <React.Suspense fallback={<InvoiceDetailSkeleton />}>
        <InvoiceCreator key={`${companyId}:${editorSession}`} />
      </React.Suspense>
    </div>
  );
}
