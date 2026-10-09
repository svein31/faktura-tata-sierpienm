import { publicMetadata } from "@/lib/seo/metadata";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { TERMS_OF_SERVICE } from "@/lib/legal/content";

export const metadata = publicMetadata(
  "/regulamin",
  "Regulamin serwisu | FakturaProsto",
  "Zasady korzystania z FakturaProsto: prawa i obowiązki użytkowników, świadczenie usług oraz warunki subskrypcji.",
);

export default function RegulaminPage() {
  return <LegalPageLayout document={TERMS_OF_SERVICE} />;
}
