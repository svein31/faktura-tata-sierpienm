import { publicMetadata } from "@/lib/seo/metadata";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { SUBPROCESSORS_DOCUMENT } from "@/lib/legal/content";

export const metadata = publicMetadata(
  "/podwykonawcy",
  "Podwykonawcy i transfery danych | FakturaProsto",
  "Podmioty przetwarzające dane w imieniu operatora FakturaProsto, ich role oraz zasady transferu danych poza EOG.",
);

export default function PodwykonawcyPage() {
  return <LegalPageLayout document={SUBPROCESSORS_DOCUMENT} />;
}
