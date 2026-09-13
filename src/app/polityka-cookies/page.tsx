import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { COOKIE_POLICY } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "Polityka plików cookies i pamięci przeglądarki (PKE) | FakturoProsto",
  description: "Informacje o wykorzystaniu plików cookies i pamięci lokalnej przeglądarki zgodnie z Prawem komunikacji elektronicznej i RODO.",
};

export default function PolitykaCookiesPage() {
  return <LegalPageLayout document={COOKIE_POLICY} />;
}
