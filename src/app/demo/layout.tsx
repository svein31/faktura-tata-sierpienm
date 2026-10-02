import { JsonLd } from "@/components/seo/public-pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata("/demo", "Demo faktury i symulacja KSeF", "Wypróbuj przykładową fakturę i symulację KSeF bez rejestracji. Nic nie trafia do produkcyjnego KSeF.");

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <><JsonLd value={{ "@context": "https://schema.org", "@type": "WebPage", name: "Demo FakturaProsto", url: "https://fakturaprosto.pl/demo", description: "Symulacja faktury i KSeF bez rejestracji, bez wysyłki dokumentów do KSeF.", inLanguage: "pl-PL" }} />{children}</>;
}
