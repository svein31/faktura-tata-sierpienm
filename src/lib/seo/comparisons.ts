import type { Topic } from "./content";

const ourPricing = { title: "FakturaProsto: cennik Free i Pro", url: "https://fakturaprosto.pl/cennik" };
const fakturowoPricing = { title: "Fakturowo: oficjalny cennik", url: "https://www.fakturowo.pl/pomoc/cennik" };
const fakturaPricing = { title: "Faktura.pl: oficjalny cennik i pakiety", url: "https://faktura.pl/cennik/" };

export const comparisonTopics: Topic[] = [
  {
    path: "/porownania/fakturowo",
    title: "Fakturowo czy FakturaProsto? Ceny, limity i KSeF",
    description: "Fakturowo: 15 zł brutto/mies. lub 100 zł/rok. FakturaProsto Pro: 7 zł/mies. lub 59 zł/rok. Porównaj też limity Free i dodatki.",
    publishedAt: "2026-10-03",
    modifiedAt: "2026-10-03",
    answer: "Fakturowo i FakturaProsto to programy do faktur online z KSeF. Według cennika Fakturowo abonament wynosi 15 zł brutto za miesiąc lub 100 zł za 12 miesięcy. FakturaProsto Pro kosztuje 7 zł brutto miesięcznie lub 59 zł rocznie. Porównaj również limity darmowego konta, dodatki oraz potrzebny zakres dokumentów.",
    sections: [
      {
        title: "Ile kosztuje Fakturowo i jak długo trwa test?",
        body: "Oficjalny cennik Fakturowo podaje 15 zł brutto za 1 miesiąc, 60 zł za 6 miesięcy i 100 zł za 12 miesięcy. Po rejestracji okres testowy trwa 100 dni i pozwala wystawić 10 dokumentów dziennie. Opłaty są pobierane z góry. Informacje zweryfikowaliśmy 3 października 2026 r.; przed zakupem sprawdź bieżący cennik.",
        source: fakturowoPricing,
      },
      {
        title: "Jakie są limity darmowych kont?",
        body: "Po okresie testowym nieopłacone konto Fakturowo nadal umożliwia bezpłatną pracę z ograniczeniami, w tym wystawienie 10 dokumentów miesięcznie. Free w FakturaProsto obejmuje 5 faktur miesięcznie. Limit nie jest jedynym kryterium: sprawdź dostępność potrzebnej funkcji w bezpłatnej wersji oraz typy dokumentów wliczane do limitu.",
        source: fakturowoPricing,
      },
      {
        title: "Czy abonament obejmuje wszystkie dodatki?",
        body: "Cennik Fakturowo odróżnia podstawowy abonament od dodatkowych usług. Wymienia m.in. osobną aktywację zmiany stopki i API oraz płatne wiadomości SMS. Porównuj koszt swojego scenariusza, a nie samą najniższą opłatę. W FakturaProsto ceny Pro wynoszą 7 zł brutto za miesiąc albo 59 zł za cały rok; Pro odnawia się automatycznie i można anulować odnowienie w ustawieniach konta.",
        source: fakturowoPricing,
      },
      {
        title: "Jak porównać KSeF i eksport dokumentów?",
        body: "Fakturowo opisuje wysyłanie dokumentów sprzedażowych do KSeF, odbiór kosztów i generowanie plików JPK. FakturaProsto przygotowuje XML FA(3), pokazuje statusy wysyłki i udostępnia dostępne UPO. Przetestuj fakturę, koszt, korektę i przekazanie miesiąca księgowej. Sprawdź dokładny typ eksportu, dostępność w wybranym planie i zgodność z narzędziem biura rachunkowego.",
        source: { title: "Fakturowo: opis integracji i funkcji", url: "https://www.fakturowo.pl/" },
      },
    ],
    comparison: [
      { criterion: "Darmowa praca", ours: "Free: do 5 faktur miesięcznie", theirs: "100 dni testu, do 10 dokumentów dziennie; po teście konto bez opłaty ma ograniczenia, m.in. 10 dokumentów miesięcznie" },
      { criterion: "Opłata miesięczna brutto", ours: "Pro: 7 zł za miesiąc", theirs: "Abonament na 1 miesiąc: 15 zł" },
      { criterion: "Opłata za 12 miesięcy brutto", ours: "Pro roczny: 59 zł", theirs: "Abonament na 12 miesięcy: 100 zł" },
      { criterion: "KSeF", ours: "XML FA(3), statusy i dostępne UPO; wymaga konfiguracji", theirs: "Producent opisuje wysyłanie sprzedaży i odbiór kosztów z KSeF" },
      { criterion: "Usługi dodatkowe", ours: "Sprawdź opis programu i warunki Pro w cenniku", theirs: "Osobne pozycje cennika obejmują m.in. zmianę stopki, API i SMS" },
    ],
    example: "Wystawiasz 8 faktur w miesiącu. Przekroczysz limit 5 faktur Free w FakturaProsto. Limit 10 dokumentów miesięcznie na nieopłaconym koncie Fakturowo może wystarczyć, ale sprawdź dostępność wymaganych funkcji po teście. Jeżeli potrzebujesz płatnego planu, porównaj 7 zł i 15 zł za miesiąc oraz zakres pracy w obu produktach.",
    caution: "Porównanie przygotowała redakcja FakturaProsto, producent jednego z opisywanych rozwiązań. Cennik i informacje producenta Fakturowo odczytano 3 października 2026 r. Pakiety i usługi dodatkowe mają różny zakres; nie jest to ranking wszystkich programów ani obietnica pełnej zgodności eksportów.",
    sources: [fakturowoPricing, { title: "Fakturowo: oficjalny opis programu", url: "https://www.fakturowo.pl/" }, ourPricing],
    related: ["/cennik", "/program-do-faktur", "/porownania/faktura-pl", "/porownania"],
  },
  {
    path: "/porownania/faktura-pl",
    title: "Faktura.pl czy FakturaProsto? Pakiety, KSeF i ceny",
    description: "Porównaj Faktura.pl i FakturaProsto: KSeF, pakiety, demo i konto Free. Pro w FakturaProsto: 7 zł brutto/mies. lub 59 zł/rok.",
    publishedAt: "2026-10-03",
    modifiedAt: "2026-10-03",
    answer: "Faktura.pl oferuje pakiety do fakturowania oraz księgowości online, a FakturaProsto łączy faktury, koszty i współpracę z księgową. W FakturaProsto Free obejmuje 5 faktur miesięcznie, Pro kosztuje 7 zł brutto miesięcznie lub 59 zł rocznie. Wybierz konkretny pakiet Faktura.pl i sprawdź jego cenę, funkcje oraz okres rozliczenia przed porównaniem.",
    sections: [
      {
        title: "Czym różnią się pakiety Faktura.pl?",
        body: "Oficjalny cennik Faktura.pl rozróżnia Program do KSeF, BASIC, OPTIMUM i PREMIUM z księgowością online. BASIC wymienia m.in. nielimitowane faktury sprzedaży, integrację z KSeF i dostęp dla księgowej. OPTIMUM rozszerza opis o OCR, magazyn i Allegro. PREMIUM obejmuje także zakres księgowości online. Te nazwy opisują różne pakiety; nie przypisuj funkcji PREMIUM do każdej darmowej wersji.",
        source: fakturaPricing,
      },
      {
        title: "Czy test bezpłatny oznacza darmowe konto bez limitu?",
        body: "Faktura.pl informuje o 30-dniowym teście i pokazuje także wariant DARMOWY za 0 zł. Dostępność konkretnej funkcji oraz limity sprawdź w bieżącej tabeli pakietów. FakturaProsto Free pozwala wystawić 5 faktur miesięcznie; demo bez rejestracji pokazuje przykładowe dane i nie wysyła rzeczywistych dokumentów do KSeF. Okres testowy, konto Free i demo to różne formy dostępu.",
        source: fakturaPricing,
      },
      {
        title: "Jak porównać koszty obu programów?",
        body: "Pro w FakturaProsto kosztuje 7 zł brutto za miesiąc lub 59 zł za cały rok. Faktura.pl pozwala wybrać okres rozliczenia na stronie cennika; przed zakupem odczytaj cenę konkretnego pakietu i ustal, czy jest netto czy brutto. Osobno porównaj sam program do faktur i usługę księgowości. Nie doliczaj do jednego produktu funkcji, które występują dopiero w innym planie.",
        source: ourPricing,
      },
      {
        title: "Co sprawdzić przy integracji z KSeF?",
        body: "Faktura.pl opisuje wystawianie i odbieranie faktur z KSeF. FakturaProsto przygotowuje FA(3), pokazuje wynik wysyłki i pozwala pobrać dostępne UPO. W obu rozwiązaniach sprawdź uprawnienia wystawcy, odbiór dokumentów kosztowych, przyjęcie faktury, korektę oraz eksport dla księgowej. Wysłanie dokumentu lub zapisanie PDF nie zastępuje potwierdzenia przyjęcia przez KSeF.",
        source: { title: "Faktura.pl: oficjalny opis programu i KSeF", url: "https://faktura.pl/" },
      },
    ],
    comparison: [
      { criterion: "Zakres oferty", ours: "Faktury, koszty, płatności i współpraca z księgową", theirs: "Program do KSeF, BASIC, OPTIMUM oraz PREMIUM z księgowością online" },
      { criterion: "Testowanie", ours: "Demo bez rejestracji; Free do 5 faktur miesięcznie", theirs: "30-dniowy test; cennik pokazuje też wariant DARMOWY, którego zakres trzeba sprawdzić" },
      { criterion: "Cena płatnego planu", ours: "Pro: 7 zł brutto/mies. lub 59 zł brutto/rok", theirs: "Cena zależy od pakietu i wybranego okresu; sprawdź aktualny cennik" },
      { criterion: "KSeF", ours: "XML FA(3), statusy wysyłki i dostępne UPO", theirs: "Producent opisuje wystawianie i odbieranie faktur z KSeF" },
      { criterion: "Księgowość", ours: "Współpraca z księgową i eksporty; sam program nie jest umową o usługę księgową", theirs: "Oferta rozróżnia program do faktur i pakiet z księgowością online" },
    ],
    example: "Potrzebujesz wystawiać faktury i przekazywać je własnej księgowej. Porównaj FakturaProsto z pakietem Faktura.pl odpowiadającym temu procesowi. Jeżeli potrzebujesz również usługi rozliczania podatków, przeanalizuj osobno zakres i koszt księgowości; cena aplikacji nie odpowiada cenie obsługi księgowej.",
    caution: "Porównanie przygotowała redakcja FakturaProsto, producent jednego z rozwiązań. Informacje z oficjalnych stron Faktura.pl odczytano 3 października 2026 r. Nie podajemy liczbowej ceny płatnego pakietu Faktura.pl, ponieważ zależy od wariantu i wyboru okresu. Sprawdź aktualne warunki przed zakupem.",
    sources: [fakturaPricing, { title: "Faktura.pl: oficjalny opis programu", url: "https://faktura.pl/" }, ourPricing],
    related: ["/cennik", "/porownania/fakturowo", "/program-do-faktur/dla-biur-rachunkowych", "/porownania"],
  },
];
