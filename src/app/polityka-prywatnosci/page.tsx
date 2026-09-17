import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { PRIVACY_POLICY } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "Polityka prywatności i ochrona danych (RODO) | FakturaProsto",
  description: "Zasady przetwarzania danych osobowych, cele, podstawy prawne, prawa użytkowników oraz procedury bezpieczeństwa w FakturaProsto.",
};

export default function PolitykaPrywatnosciPage() {
  return <LegalPageLayout document={PRIVACY_POLICY} />;
}
