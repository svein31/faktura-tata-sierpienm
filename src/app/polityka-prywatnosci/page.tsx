import { publicMetadata } from "@/lib/seo/metadata";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { PRIVACY_POLICY } from "@/lib/legal/content";

export const metadata = publicMetadata(
  "/polityka-prywatnosci",
  "Polityka prywatności i RODO | FakturaProsto",
  "Zasady przetwarzania danych osobowych w FakturaProsto: cele, podstawy prawne, prawa użytkowników i bezpieczeństwo danych.",
);

export default function PolitykaPrywatnosciPage() {
  return <LegalPageLayout document={PRIVACY_POLICY} />;
}
