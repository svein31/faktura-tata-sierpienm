import { pageMetadata } from "@/lib/seo/metadata";
import { PillarPage } from "@/components/seo/public-pages";

export const metadata = pageMetadata("/faktury", "Faktury online — instrukcje, przykłady i darmowe demo", "Jak wystawić fakturę, zaliczkową, końcową i korektę? Praktyczne przykłady z oficjalnymi źródłami oraz darmowe demo.");

export default function Page() {
  return <PillarPage title="Faktury: odpowiedzi i przykłady" description="Wybierz rodzaj dokumentu, sprawdź przykład z kwotami i przejdź do demo wystawiania faktury. Wyjaśniamy także, kiedy przepisy wymagają dodatkowej kontroli." prefix="/faktury" />;
}
