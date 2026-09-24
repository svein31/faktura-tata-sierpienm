import type { Metadata } from "next";
import { PillarPage } from "@/components/seo/public-pages";

export const metadata: Metadata = {
  title: "Faktury online — instrukcje, przykłady i darmowe demo",
  description: "Jak wystawić fakturę, zaliczkową, końcową i korektę? Praktyczne przykłady z oficjalnymi źródłami oraz darmowe demo.",
  alternates: { canonical: "/faktury" },
};

export default function Page() {
  return <PillarPage title="Faktury: odpowiedzi i przykłady" description="Wybierz rodzaj dokumentu, sprawdź przykład z kwotami i przejdź do demo wystawiania faktury. Wyjaśniamy także, kiedy przepisy wymagają dodatkowej kontroli." prefix="/faktury" />;
}
