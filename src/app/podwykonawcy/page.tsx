import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { SUBPROCESSORS_DOCUMENT } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "Wykaz podwykonawców i transfery danych (Sub-processors) | FakturaProsto",
  description: "Lista zewnętrznych podmiotów przetwarzających dane w imieniu operatora FakturaProsto oraz zasady transferu danych poza EOG.",
};

export default function PodwykonawcyPage() {
  return <LegalPageLayout document={SUBPROCESSORS_DOCUMENT} />;
}
