import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { DPA_AGREEMENT } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "Umowa powierzenia przetwarzania danych osobowych (DPA art. 28 RODO) | FakturaProsto",
  description: "Warunki powierzenia przetwarzania danych osobowych klientów i kontrahentów wprowadzanych przez Użytkownika do serwisu FakturaProsto.",
};

export default function PowierzenieDanychPage() {
  return <LegalPageLayout document={DPA_AGREEMENT} />;
}
