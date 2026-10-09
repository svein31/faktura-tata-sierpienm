import { publicMetadata } from "@/lib/seo/metadata";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { COOKIE_POLICY } from "@/lib/legal/content";

export const metadata = publicMetadata(
  "/polityka-cookies",
  "Polityka cookies i pamięci przeglądarki | FakturaProsto",
  "Informacje o cookies i pamięci przeglądarki w FakturaProsto, celach ich użycia i zarządzaniu zgodami.",
);

export default function PolitykaCookiesPage() {
  return <LegalPageLayout document={COOKIE_POLICY} />;
}
