"use client";

import { InvoiceCreator } from "@/components/invoice/invoice-creator";
import { PageHeader } from "@/components/page-header";

export default function NewInvoicePage() {
  return (
    <div>
      <PageHeader
        title="Kreator faktury"
        description="Wypełnij formularz — podgląd HTML aktualizuje się na żywo. Zapisz, wyślij do KSeF (demo) lub eksportuj PDF/XML/JSON."
      />
      <InvoiceCreator />
    </div>
  );
}
