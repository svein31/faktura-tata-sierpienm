import type { Metadata } from "next";
import { PillarPage } from "@/components/seo/public-pages";

export const metadata: Metadata = {
  title: "VAT na fakturze — stawki, zwolnienia i obliczenia",
  description: "Stawki VAT 23%, 8%, 5% i 0% oraz zwolnienie. Źródła Ministerstwa Finansów i darmowy kalkulator netto, VAT i brutto.",
  alternates: { canonical: "/vat" },
};

export default function Page() {
  return <PillarPage title="VAT na fakturze" description="Najpierw ustal właściwą stawkę lub podstawę zwolnienia, potem oblicz kwoty. Zobacz przykłady i aktualne źródła urzędowe." prefix="/vat" />;
}
