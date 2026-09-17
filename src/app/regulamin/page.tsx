import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { TERMS_OF_SERVICE } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "Regulamin serwisu i świadczenia usług | FakturaProsto",
  description: "Zasady świadczenia usług drogą elektroniczną, prawa i obowiązki użytkowników oraz warunki korzystania z platformy fakturowej FakturaProsto.",
};

export default function RegulaminPage() {
  return <LegalPageLayout document={TERMS_OF_SERVICE} />;
}
