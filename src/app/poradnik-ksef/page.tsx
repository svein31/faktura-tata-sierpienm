import type { Metadata } from "next";
import { PillarPage } from "@/components/seo/public-pages";

export const metadata: Metadata = {
  title: "KSeF 2026 — terminy, próg 10 000 zł i numery faktur",
  description: "KSeF dla JDG, próg 10 000 zł brutto, numer KSeF i tryb offline24. Odpowiedzi z przykładami oraz źródłami Ministerstwa Finansów.",
  alternates: { canonical: "/poradnik-ksef" },
};

export default function Page() {
  return <PillarPage title="KSeF 2026: co zrobić w Twojej sytuacji?" description="Sprawdź terminy, wyjątek dla małej sprzedaży, status i numer faktury. Każda odpowiedź zawiera przykład oraz odnośnik do oficjalnych wyjaśnień." prefix="/poradnik-ksef" />;
}
