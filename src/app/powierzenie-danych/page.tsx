import { publicMetadata } from "@/lib/seo/metadata";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { DPA_AGREEMENT } from "@/lib/legal/content";

export const metadata = publicMetadata(
  "/powierzenie-danych",
  "Powierzenie danych: umowa DPA | FakturaProsto",
  "Warunki powierzenia przetwarzania danych osobowych klientów i kontrahentów wprowadzanych do FakturaProsto, zgodnie z art. 28 RODO.",
);

export default function PowierzenieDanychPage() {
  return <LegalPageLayout document={DPA_AGREEMENT} />;
}
