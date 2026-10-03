import { PillarPage } from "@/components/seo/public-pages";
import { publicMetadata } from "@/lib/seo/metadata";
export const metadata = publicMetadata("/porownania", "Porównania programów do faktur — FakturaProsto", "Porównaj zakres pracy, KSeF i koszt brutto. FakturaProsto, Faktura.pl, Fakturowo, Fakturownia, iFirma, wFirma i aplikacja MF.");
export default function Page() { return <PillarPage title="Jak wybrać program do faktur?" description="Porównuj konkretny produkt i ten sam proces: fakturę, koszt, UPO oraz współpracę z księgową. Aktualne ceny i ograniczenia sprawdź w ofercie producenta. Te opracowania przygotowała redakcja FakturaProsto; źródła i ograniczenia znajdziesz na każdej stronie." prefix="/porownania" />; }
