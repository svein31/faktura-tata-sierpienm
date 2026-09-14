"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { InvoiceCreator } from "@/components/invoice/invoice-creator";
import { PageHeader } from "@/components/page-header";
import { InvoiceDetailSkeleton } from "@/components/ui/skeleton";

export default function NewInvoicePage() {
  const router = useRouter();
  const draft = useAppStore((s) => s.draftInvoice);
  const blocked = draft?.type === "purchase";
  React.useEffect(() => {
    if (blocked && draft?.id) router.replace("/invoices/" + draft.id);
  }, [blocked, draft?.id, router]);
  if (blocked) return <InvoiceDetailSkeleton />;

  return (
    <div>
      <PageHeader
        title="Kreator e-Faktury"
        description="Wypełnij formularz — podgląd aktualizuje się na żywo w czasie rzeczywistym. Zapisuj, wysyłaj bezpośrednio do KSeF (FA(3)) lub pobieraj PDF/XML."
      />
      <React.Suspense fallback={<InvoiceDetailSkeleton />}>
        <InvoiceCreator />
      </React.Suspense>
    </div>
  );
}
