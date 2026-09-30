# Quick wins (7 dni)

| Priorytet | Co zrobić | Gdzie | Gotowy materiał / instrukcja | Wpływ | Nakład |
| --- | --- | --- | --- | --- | --- |
| 1 | Popraw tytuły i usuń podwójną markę | src/app/layout.tsx; metadata stron | Użyj title.absolute i gotowej mapy onpage.json. Na /program-do-faktur obecny tytuł ma 64 znaki i dwie nazwy marki. | średni: CTR i spójność | 2–3 h |
| 2 | Wyłącz indeksację stron konta | layouty /login, /register, /forgot-password i (app) | robots: { index: false, follow: true }; osobne layouty serwerowe dla stron klientowych. (auth)/layout nie obejmuje obecnych /login i /register. | wysoki dla higieny indeksu | 1–2 h |
| 3 | Rozbuduj poradnik KSeF i odpowiedź offline24 | /poradnik-ksef; /poradnik-ksef/offline24 | Użyj gotowych odpowiedzi 40–60 słów. Dopisz następny dzień roboczy, odbiorców, QR i certyfikat typu 2 zgodnie z MF. | wysoki | 6–10 h |
| 4 | Doprecyzuj cennik i obietnice produktu | /; /program-do-faktur | Free: 5 faktur/mies. Pro: 7 zł brutto/mies. lub 59 zł brutto/rok. Demo jest symulacją. GUS dostarcza dane firmy; status VAT sprawdza rejestr MF. | wysoki dla zaufania i konwersji | 1–2 h |
| 5 | Dodaj obraz OpenGraph i kompletne metadane | src/app/opengraph-image.tsx; helper metadata | Gotowy szablon 1200×630; obraz w każdym zestawie OG, także gdy podstrona nadpisuje obiekt openGraph. | średni | 2–3 h |
| 6 | Uporządkuj nagłówki i linkowanie | PillarPage, TopicCards, menu publiczne | H1 → H2 „Wybierz temat” → H3 kart; hub → artykuł → narzędzie → produkt/demo. Nie twórz duplikatu /numer-ksef. | średni/wysoki | 2–3 h |
| 7 | Uzupełnij encje i dodaj llms.txt | JSON-LD; public/llms.txt | Szablony w templates/schema oraz llms.txt. Organization/SoftwareApplication mają faktyczne dane; FAQ/HowTo nie zapewniają rich results Google. | średni dla encji; niski/eksperymentalny dla llms | 2–4 h |
| 8 | Zapisz punkt startowy pomiaru | GSC, GA4/Matomo/Plausible, PSI/CrUX, arkusz AI | Eksport GSC; pomiar sign_up, first_invoice_issued, ksef_accepted i plan_activated; 30 promptów bez nazwy marki. | wysoki dla decyzji | 3–5 h |


Audyt: **30 września 2026 r.** Sprawdzono odpowiedzi HTTP i HTML 22 punktów serwisu, kod repozytorium, źródła MF i strony sześciu konkurentów. Ceny Pro **7 zł/mies. i 59 zł/rok są brutto**, co właściciel potwierdził podczas prac. To pakiet audytu i materiałów do wdrożenia; przygotowane szablony nie zmieniają automatycznie produkcji.

Nie da się zagwarantować TOP3 ani rekomendacji AI. Realistycznie: pierwsze efekty technicznych i treściowych zmian mogą pojawić się po 4–12 tygodniach; walka o TOP3 precyzyjnych fraz może trwać 3–6 miesięcy, a ogólnych fraz 9–18 miesięcy lub dłużej. To scenariusze przy regularnej pracy i odpowiednim autorytecie domeny, nie prognoza konkretnego serwisu bez danych.

**Nie otrzymano GSC/analityki ani danych osoby merytorycznie weryfikującej treści podatkowe.** Potrzebne: eksport frazy/URL/kraj/urządzenie za ostatnie 3 miesiące i porównanie rok do roku, raport indeksowania i CWV, sitemap, działania ręczne oraz rejestracje/aktywacje/abonamenty. Nie podawaj haseł ani tokenów. Do czasu potwierdzenia autora używaj „Redakcja FakturaProsto”, bez fikcyjnych kwalifikacji.

## Etap 30 dni: technika, intencje i najważniejsze odpowiedzi

### Ustalenia audytu

| Obszar | Ustalenie | Co zrobić |
| --- | --- | --- |
| Title | 8 sprawdzonych publicznych stron ma title >60 znaków; /program-do-faktur powiela nazwę marki. | Skróć pełny wynik HTML, nie tylko fragment przed globalnym szablonem. |
| Meta description | Sprawdzone opisy są obecne i mieszczą się w 155 znakach. Strony konta dziedziczą ogólny opis. | Popraw obietnicę i dopasowanie do intencji; meta description nie jest bezpośrednim czynnikiem rankingu. |
| H1–H3 | Główne publiczne strony mają H1. Huby renderują H3 kart bez poprzedzającego H2. | Dodaj H2 przed kartami; rozbuduj huba, nie samą siatkę linków. |
| Canonical | Sprawdzone publiczne strony mają canonical własnego URL. Konta nie mają canonical. | Zachowaj self-canonical; dla noindex stron konta nie ustawiaj canonical na homepage. |
| OpenGraph | Brak og:image na sprawdzonych stronach. | Dodaj rzeczywisty obraz i Twitter summary_large_image. |
| hreflang | Nie ma wersji językowych ani hreflang; html lang=pl jest obecne. | Brak hreflang nie jest błędem dla jednego języka. Dodaj dopiero przy realnych tłumaczeniach z odnośnikami wzajemnymi. |
| sitemap | HTTP 200; 26 publicznych URL; bez stron konta. Daty artykułów wywodzą się z jednego REVIEW_DATE. | Osobne rzeczywiste daty modyfikacji. Dodaj nowe URL dopiero po publikacji; bez sztucznego odświeżania lastmod. |
| robots | HTTP 200; Allow /; blokady /api/, /portal/, /dashboard/, /settings/. | robots.txt nie realizuje noindex ani ochrony danych. Zachowaj autoryzację; pozwól robotowi odczytać noindex stron konta. |
| llms.txt | HTTP 404. | Gotowy plik pomocniczy. Nie jest wymaganiem Google ani gwarancją korzystania przez modele. |
| Schema | Organization, WebSite, SoftwareApplication na /; Article i BreadcrumbList na poradnikach; CollectionPage na hubach. | Nie dodawaj tych typów od zera drugi raz. Rozszerz spójne @id, oferty i autorstwo; dodaj brakujące typy do właściwych stron. |
| Treść | /program-do-faktur ~150 słów, /poradnik-ksef ~148 słów w sprawdzonym HTML; hub głównie katalogiem. | Dodaj pełne odpowiedzi, przykłady i decyzje. Nie przyjmuj minimalnej liczby słów jako reguły SEO. |
| Linkowanie | Są menu, powiązane poradniki i CTA. Końcowe rekomendacje wybierają pierwsze dwa topics, nie zawsze kontekstowe. | Wybierz related semantycznie; linkuj narzędzie i główny poradnik w obie strony. |
| Indeksacja | /register, /login i /forgot-password zwracają 200 bez noindex. Faktyczne indeksowanie i canonical wybrany przez Google nieznane. | GSC: raport stron, inspekcja reprezentatywnych URL, sitemap, działania ręczne i bezpieczeństwo. |
| Core Web Vitals | Nie wykonywano pomiaru CrUX/RUM ani Lighthouse. Czas żądania HTTP z audytu nie jest wynikiem CWV. | PSI i 3 pomiary Lighthouse mobile; pole p75: LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1. RWD testowane wcześniej to osobna weryfikacja. |
| Zaufanie | Są dane operatora i źródła MF. Brak indywidualnego autora/bio w modelu artykułów. | Redakcja jako faktyczny autor; recenzent podatkowy dopiero po potwierdzeniu osoby i kwalifikacji. |

Brak hreflang dla serwisu tylko po polsku nie wymaga naprawy. robots.txt nie służy jako zabezpieczenie danych ani zamiennik noindex. Na stronach logowania i rejestracji musi być możliwość odczytania noindex przez robota. Prywatny panel pozostaje zabezpieczony autoryzacją serwerową.

Google nie wymaga osobnego schematu „AI” ani llms.txt do AI Overviews/AI Mode. FAQ rich results zostały wycofane od **7 maja 2026 r.**; dokumentację usunięto później w 2026 r. HowTo rich results wycofano we wrześniu 2023 r. Typy FAQPage i HowTo mogą porządkować faktyczną treść dla innych konsumentów schema.org, lecz nie są sposobem na dodatkowy rich result Google. Nie dodawaj fikcyjnych AggregateRating/Review, aby spełnić wymagania wyniku rozszerzonego SoftwareApplication.

### Mapa słów kluczowych

I = informacyjna, T = transakcyjna, P = porównawcza. Wolumeny to **hipotezy planistyczne rzędu wielkości miesięcznie w Polsce, nie wyniki narzędzia**. Nie mam Keyword Plannera/Senuto/Semstorm ani GSC; nie sumuj tych przedziałów i nie licz z nich ROI. Zwłaszcza popyt KSeF jest silnie zmienny. Trudność to jakościowa ocena konkurencji, nie liczbowy KD. W pierwszym tygodniu zweryfikuj koszyk i priorytety.

| Fraza / klaster | Intencja | Szacunek / miesiąc | Trudność | URL główny | Kanibalizacja |
| --- | --- | --- | --- | --- | --- |
| faktury online; fakturowanie online | T | 1–10 tys. | wysoka | / | Strona marki i produktu; nie powielaj katalogu rodzajów faktur. |
| program do faktur; darmowy program do faktur | T | 1–10 tys. | bardzo wysoka | /program-do-faktur | Jedna strona dla wariantów darmowy/program; bez drugiej identycznej strony. |
| KSeF; KSeF 2.0 | I | >10 tys. | bardzo wysoka | /poradnik-ksef | Główny poradnik; podstrony odpowiadają na węższe pytania. |
| FA(3); struktura FA3 | I | 100–1 tys. | średnia | /poradnik-ksef/fa3 | Nowy artykuł, jeden URL dla pisowni FA3 i FA(3). |
| KSeF dla JDG | I | 1–10 tys. | wysoka | /poradnik-ksef/jdg | Obowiązki, wyjątki i przygotowanie, nie ogólny landing produktu. |
| KSeF limit 10 000 zł | I | 100–1 tys. | średnia | /poradnik-ksef/limit-10000-zl | Wyjaśnienie prawne; kalkulator ma osobną intencję. |
| numer KSeF; numer KSeF a numer faktury | I | 100–1 tys. | średnia | /poradnik-ksef/numer-faktury | Zachowaj istniejący URL, nie twórz duplikatu /numer-ksef. |
| UPO KSeF; jak pobrać UPO | I | 100–1 tys. | średnia | /poradnik-ksef/upo | Nowa instrukcja; na stronie numeru tylko skrót i link. |
| offline24; KSeF offline | I | 100–1 tys. | średnia | /poradnik-ksef/offline24 | Odróżnij od awarii; awaria ma odrębną instrukcję. |
| faktura VAT; rodzaje faktur | I | 1–10 tys. | wysoka | /faktury | Hub wiedzy; główne frazy komercyjne przypisane do / i /program-do-faktur. |
| faktura korekta; faktura korygująca | I | 1–10 tys. | wysoka | /faktury/korygujaca | Jeden artykuł obejmuje synonimy. |
| jak wystawić fakturę online | I/T | 100–1 tys. | średnia | /faktury/jak-wystawic | Instrukcja, nie druga oferta darmowego programu. |
| kalkulator VAT; netto brutto | narzędzie | 1–10 tys. | bardzo wysoka | /narzedzia/kalkulator-vat | Narzędzie z objaśnieniem; hub /narzedzia pełni funkcję nawigacyjną. |
| kalkulator limitu KSeF | narzędzie | ≤100 | niska/średnia | /narzedzia/limit-ksef | Interaktywny wynik; źródło zasad w poradniku limitu. |
| demo programu do faktur; symulator KSeF | T | ≤100 | niska/średnia | /demo | Nie obiecuj prawdziwej faktury bez konta. |
| program do faktur dla JDG; freelancerów; biura | T | 100–1 tys. na segment | średnia/wysoka | /program-do-faktur/dla-jdg i strony segmentowe | Każdy segment wymaga własnego procesu i przykładu. |
| FakturaProsto vs Fakturownia / wFirma / iFirma | P | ≤100 na parę | niska przy własnej marce | /porownania/[konkurent] | Porównuj właściwe produkty i plany; brak danych nie oznacza braku funkcji. |

Strona główna sprzedaje produkt i markę, /program-do-faktur odpowiada na wybór darmowego programu, /faktury jest hubem dokumentów. /poradnik-ksef wyjaśnia system, a artykuły szczegółowe rozwiązują jedno pytanie. Kalkulator limitu i poradnik limitu mają różne intencje. Istniejący /poradnik-ksef/numer-faktury zostaje; nie twórz bliźniaczego /numer-ksef. Nowych stron sektorowych nie wypełniaj identyczną treścią z podmienioną nazwą branży.

### Gotowe title, opisy, H1 i nagłówki

Pełne title są sprawdzone: ≤60 znaków, descriptions ≤155. Użyj title.absolute, bo globalny template dodaje markę. title SEO i H1 mają być osobnymi polami; obecne topic.title służy też jako H1. /register otrzymuje noindex mimo dopracowanych metadanych.

| URL | Title | Meta description | H1 |
| --- | --- | --- | --- |
| / | Faktury online z KSeF 2.0 \| FakturaProsto | Faktury VAT online z KSeF 2.0. Free: 5 faktur miesięcznie. Pro: 7 zł brutto/mies. lub 59 zł brutto/rok. Sprawdź demo bez rejestracji i bez karty. | Faktury VAT online z KSeF 2.0 dla małych firm |
| /program-do-faktur | Darmowy program do faktur: 5 miesięcznie \| FakturaProsto | Szukasz darmowego programu do faktur? Free obejmuje 5 faktur miesięcznie. Poznaj KSeF 2.0, porównaj plany i sprawdź demo bez rejestracji. | Darmowy program do faktur — do 5 faktur miesięcznie |
| /faktury | Faktura VAT: rodzaje, wzory i korekty \| FakturaProsto | Faktura VAT, korekta, zaliczkowa i bez VAT. Sprawdź wymagane dane, przykłady oraz powiązania z KSeF. Wypróbuj formularz w demo. | Faktura VAT: rodzaje, wymagane dane i przykłady |
| /poradnik-ksef | KSeF 2.0: poradnik, FA(3) i UPO \| FakturaProsto | Jak działa KSeF 2.0? Sprawdź FA(3), numer KSeF, UPO, offline24 i zasady dla JDG. Konkretne przykłady oraz źródła MF. | KSeF 2.0: praktyczny poradnik dla firm i księgowych |
| /poradnik-ksef/jdg | KSeF dla JDG: obowiązki i wyjątki \| FakturaProsto | KSeF dla JDG: sprawdź obowiązki, wyjątki i odbiór faktur. Poznaj zasadę 10 000 zł w 2026 r. oraz przygotowanie firmy do KSeF. | KSeF dla JDG: obowiązki, wyjątki i przygotowanie firmy |
| /poradnik-ksef/limit-10000-zl | KSeF: limit 10 000 zł w 2026 roku \| FakturaProsto | Jak liczyć limit 10 000 zł brutto w KSeF w 2026 r.? Zobacz, która faktura przekracza próg, przykład i kalkulator. Źródła MF. | Limit 10 000 zł brutto w KSeF w 2026 roku |
| /poradnik-ksef/numer-faktury | Numer KSeF a numer faktury: różnice \| FakturaProsto | Numer KSeF różni się od numeru faktury. Sprawdź, kiedy jest nadawany, gdzie go odczytać i co potwierdza UPO. Przykłady i źródła MF. | Numer KSeF a numer faktury — gdzie je znaleźć? |
| /poradnik-ksef/offline24 | KSeF offline24: termin wysyłki i QR \| FakturaProsto | Offline24: wysyłka najpóźniej w następnym dniu roboczym, FA(3) i kody QR. Sprawdź zasady, wyjątki oraz przykłady ze źródłami MF. | Offline24 w KSeF: termin wysyłki i kody QR |
| /faktury/korygujaca | Faktura korygująca w KSeF: jak wystawić \| FakturaProsto | Jak wystawić fakturę korygującą w KSeF? Sprawdź powiązanie z fakturą pierwotną, korektę kwot i status dokumentu. Przykład krok po kroku. | Jak wystawić fakturę korygującą w KSeF? |
| /faktury/jak-wystawic | Jak wystawić fakturę online: instrukcja \| FakturaProsto | Jak wystawić fakturę online? Dane stron, pozycje, VAT i kontrola kwot. Sprawdź status KSeF i przećwicz formularz w demo. | Jak wystawić fakturę online krok po kroku? |
| /faktury/bez-vat | Faktura bez VAT a KSeF: zasady i przykład \| FakturaProsto | Faktura bez VAT: zwolnienie to nie stawka 0%. Sprawdź dane dokumentu, przykład i obowiązki KSeF niezależne od statusu VAT. | Faktura bez VAT: zwolnienie, dane i KSeF |
| /narzedzia | Darmowe kalkulatory VAT i limitu KSeF \| FakturaProsto | Darmowe kalkulatory netto, VAT, brutto i limitu KSeF 10 000 zł w 2026 r. Wyniki z objaśnieniami oraz linkami do źródeł MF. | Darmowe kalkulatory dla wystawiających faktury |
| /narzedzia/kalkulator-vat | Kalkulator VAT: netto i brutto \| FakturaProsto | Oblicz netto, VAT i brutto dla wybranej stawki. Bez rejestracji. Zobacz wzory, zaokrąglenia oraz przykłady obliczeń. | Kalkulator VAT: oblicz netto, podatek i brutto |
| /narzedzia/limit-ksef | Kalkulator limitu KSeF: 10 000 zł \| FakturaProsto | Sprawdź przekroczenie limitu KSeF 10 000 zł brutto w 2026 r. Wpisz kwoty właściwych faktur i zobacz wynik z objaśnieniem. | Kalkulator limitu KSeF 10 000 zł w 2026 roku |
| /demo | Demo faktur i KSeF bez rejestracji \| FakturaProsto | Przetestuj formularz faktury i symulację KSeF bez konta i bez karty. Demo używa danych przykładowych i nie wysyła faktur do KSeF. | Demo formularza faktury i symulacji KSeF |
| /pomoc | Pomoc: faktury, KSeF i kontakt \| FakturaProsto | Pomoc FakturaProsto: statusy KSeF, UPO, demo i obsługa faktur. Znajdź instrukcję lub skontaktuj się ze wsparciem. | Pomoc FakturaProsto: faktury i KSeF |
| /register (noindex) | Załóż darmowe konto do faktur \| FakturaProsto | Załóż konto Free i wystawiaj do 5 faktur miesięcznie. Bez karty. Wcześniej możesz sprawdzić formularz w demo bez rejestracji. | Załóż konto Free do wystawiania faktur |
| /poradnik-ksef/fa3 (nowa) | FA(3): struktura faktury KSeF 2.0 \| FakturaProsto | Czym jest FA(3)? Poznaj strukturę XML faktury KSeF 2.0, wymagane dane, typowe błędy i różnice między XML a PDF. Źródła MF. | FA(3): struktura XML faktury w KSeF 2.0 |
| /poradnik-ksef/upo (nowa) | UPO w KSeF: jak pobrać potwierdzenie \| FakturaProsto | Co potwierdza UPO w KSeF i jak je pobrać? Sprawdź numer KSeF, status przyjęcia oraz różnicę między UPO a samą wysyłką. | UPO w KSeF: co potwierdza i jak je pobrać? |


#### /

H2: Jak działa FakturaProsto? → KSeF 2.0: FA(3), statusy i UPO → Współpraca z księgową → Free i Pro — ceny brutto → Sprawdź demo bez rejestracji → Najczęstsze pytania.

**Gotowa pierwsza odpowiedź (51 słów):**

FakturaProsto to polski program do wystawiania faktur VAT online z integracją KSeF 2.0. Plan Free obejmuje 5 faktur miesięcznie, a Pro kosztuje 7 zł brutto miesięcznie lub 59 zł brutto rocznie. Formularz możesz sprawdzić w demo bez rejestracji i bez karty. Program obsługuje FA(3), statusy KSeF, UPO i współpracę z księgową.


#### /program-do-faktur

H2: Co obejmuje darmowy plan? → Jak wystawić pierwszą fakturę? → Obsługa KSeF i danych z GUS → Free czy Pro — który plan wybrać? → Porównanie z bezpłatną aplikacją MF → Najczęstsze pytania.

**Gotowa pierwsza odpowiedź (50 słów):**

Darmowy program do faktur FakturaProsto pozwala wystawiać do 5 faktur miesięcznie w planie Free. Jeśli potrzebujesz planu Pro, cena wynosi 7 zł brutto miesięcznie lub 59 zł brutto rocznie. Przed rejestracją możesz sprawdzić formularz w demo bez karty. Demo korzysta z danych przykładowych i nie wysyła rzeczywistych faktur do KSeF.


#### /faktury

H2: Jakie dane musi mieć faktura? → Rodzaje faktur → Przykłady z kwotami → Faktura PDF a XML w KSeF → Jak poprawić błąd?.


#### /poradnik-ksef

H2: Co to jest KSeF 2.0? → Kogo dotyczy obowiązek i jakie są wyjątki? → FA(3): format faktury → Od wysyłki do numeru KSeF i UPO → Offline24, niedostępność i awaria → KSeF dla JDG i biura rachunkowego → Przykłady, kalkulatory i źródła MF.

**Gotowa pierwsza odpowiedź (49 słów):**

KSeF to Krajowy System e-Faktur, służący do wystawiania, odbierania i przechowywania faktur ustrukturyzowanych. W KSeF 2.0 faktura korzysta ze struktury FA(3), a po przyjęciu otrzymuje numer KSeF. Ten poradnik wyjaśnia zasady dla JDG, przejściowy limit 10 000 zł w 2026 r., UPO i offline24 na podstawie źródeł Ministerstwa Finansów.


#### /poradnik-ksef/jdg

H2: Kiedy JDG musi wystawiać faktury w KSeF? → Odbiór faktur a obowiązek wystawiania → Limit 10 000 zł i wyłączenia → JDG zwolniona z VAT → Lista przygotowań i przykłady.

**Gotowa pierwsza odpowiedź (52 słów):**

KSeF obejmuje co do zasady JDG od 1 kwietnia 2026 r., z uwzględnieniem ustawowych wyłączeń i przepisów przejściowych. Do końca 2026 r. możliwe jest wystawianie określonych faktur poza KSeF przy miesięcznej wartości sprzedaży do 10 000 zł brutto. Otrzymywanie faktur w KSeF podlega odrębnym zasadom; sam brak obowiązku wystawiania nie wyłącza odbioru.


#### /poradnik-ksef/limit-10000-zl

H2: Które faktury wchodzą do limitu? → Dokładnie 10 000 zł a przekroczenie → Od której faktury stosować KSeF? → Co z kolejnym miesiącem? → Przykłady i kalkulator → Co zmienia koniec 2026 roku?.

**Gotowa pierwsza odpowiedź (51 słów):**

Limit 10 000 zł brutto to przejściowe ułatwienie dotyczące określonych faktur w 2026 r., a nie całego obrotu firmy. Faktura, która zwiększa właściwą miesięczną sumę powyżej limitu, musi już trafić do KSeF. Po przekroczeniu również kolejne faktury objęte obowiązkiem wystawia się w KSeF; niższa suma w następnym miesiącu nie przywraca wyjątku.


#### /poradnik-ksef/numer-faktury

H2: Numer własny, numer sesji i numer KSeF → Gdzie znaleźć numer KSeF? → Numer KSeF w UPO → Odwołania w korekcie i zaliczkach → Co zrobić, jeśli numeru brakuje?.

**Gotowa pierwsza odpowiedź (49 słów):**

Numer KSeF to unikalny identyfikator nadawany fakturze po jej przyjęciu przez Krajowy System e-Faktur. Różni się od numeru nadanego przez wystawcę, który pozostaje w polu P_2 struktury FA(3). Nadany tej fakturze numer KSeF odczytasz z odpowiedzi systemu lub UPO. Rozpoczęcie wysyłki i numer referencyjny sesji nie potwierdzają przyjęcia dokumentu.


#### /poradnik-ksef/offline24

H2: Kiedy można użyć offline24? → Następny dzień roboczy — przykłady → Data P_1 i przesłanie do KSeF → Kiedy potrzebne są dwa kody QR? → Certyfikat typu 2 → Offline24 a ogłoszona awaria.

**Gotowa pierwsza odpowiedź (48 słów):**

Offline24 pozwala wystawić elektroniczną fakturę zgodną z FA(3) i przesłać ją do KSeF niezwłocznie, najpóźniej w następnym dniu roboczym po wystawieniu. Udostępnienie jej poza KSeF przed wysyłką określonym nabywcom wymaga dwóch kodów QR; drugi korzysta z certyfikatu KSeF typu 2. Ogłoszona awaria systemu może zmienić zasady dalszego postępowania.


#### /faktury/korygujaca

H2: Korekta a poprawienie szkicu → Powiązanie z fakturą pierwotną → Zmiana kwoty lub danych → Przykład korekty → Korekta dokumentu offline24.


#### /faktury/jak-wystawic

H2: Dane sprzedawcy i nabywcy → Pozycje, VAT i kwoty → Sprawdzenie i zatwierdzenie → Status KSeF i UPO → Przykład w demo.


#### /faktury/bez-vat

H2: Zwolnienie a stawka 0% → Podstawa zwolnienia i dane dokumentu → Faktura bez VAT w KSeF → Przykład i źródła.


#### /narzedzia

H2: Kalkulator netto, VAT i brutto → Kalkulator limitu KSeF → Założenia i ograniczenia narzędzi.


#### /narzedzia/kalkulator-vat

H2: Oblicz kwoty → Wzory netto i brutto → Przykłady: 23%, 8% i 5% → Zaokrąglenia i ustalenie stawki.


#### /narzedzia/limit-ksef

H2: Wpisz kwoty właściwych faktur → Jak działa obliczenie? → Których dokumentów nie dodawać? → Przykład przekroczenia → Okres obowiązywania: 2026.


#### /demo

H2: Edytuj dane przykładowej faktury → Sprawdź XML FA(3) → Zasymuluj status i UPO → Przejdź do rzeczywistego konta.


#### /pomoc

H2: Faktury i konto → Statusy KSeF i UPO → Demo i plan Free → Kontakt z pomocą.


#### /register

H2: Co obejmuje plan Free? → Formularz rejestracji → Dane i warunki korzystania.


#### /poradnik-ksef/fa3

H2: FA(3) a faktura PDF → Najważniejsze grupy danych XML → Walidacja XSD a poprawność podatkowa → Typowe błędy → Schemat i źródła MF.

**Gotowa pierwsza odpowiedź (49 słów):**

FA(3) to struktura logiczna faktury ustrukturyzowanej używana w KSeF 2.0 od 1 lutego 2026 r. Określa dane i format XML przesyłanego dokumentu. PDF jest jego wizualizacją, a nie zamiennikiem pliku XML wysyłanego do KSeF. Zgodność ze schematem XSD nie rozstrzyga samodzielnie poprawności podatkowej transakcji ani przyjęcia faktury przez system.


#### /poradnik-ksef/upo

H2: Co potwierdza UPO? → Kiedy można je pobrać? → Jak pobrać XML w FakturaProsto? → Numer faktury, numer KSeF i status → Brak UPO — co sprawdzić?.

**Gotowa pierwsza odpowiedź (49 słów):**

UPO, czyli Urzędowe Poświadczenie Odbioru, jest dokumentem potwierdzającym odbiór przez KSeF w ramach zakończonego procesu przesłania faktur. Pozwala powiązać przyjęte dokumenty z numerami KSeF. W FakturaProsto można pobrać UPO w XML. Samo rozpoczęcie wysyłki, lokalny PDF ani numer sesji nie zastępują sprawdzenia wyniku przetwarzania; UPO nie jest potwierdzeniem zapłaty.


H3 używaj wewnątrz sekcji H2: np. „Plan Free”, „Pro miesięczny”, „Pro roczny”; „Numer własny”, „Numer sesji”, „Numer KSeF”; „Przed wysyłką”, „Po przyjęciu”. Nie podmieniaj nagłówków na zestawy synonimów.

W /poradnik-ksef dodaj tabelę: **temat → krótka odpowiedź → przykład → artykuł źródłowy**. Przykład:
- FA(3): struktura XML; PDF jest wizualizacją. Link do /poradnik-ksef/fa3 po publikacji.
- Numer KSeF: identyfikator po przyjęciu; nie numer P_2 ani numer sesji.
- UPO: potwierdzenie procesu odbioru, nie zapłaty.
- Offline24: najpóźniej następny dzień roboczy, z odrębnymi regułami przy ogłoszonej awarii.
- Limit 10 000 zł: przejściowa zasada 2026 r., nie cały obrót ani limit VAT.

Na stronie offline24 pokaż przykład „piątek → poniedziałek, jeżeli poniedziałek jest dniem roboczym” zamiast obietnicy „zawsze 24 godziny”. Dwa QR dotyczą wskazanych nabywców i udostępnienia poza KSeF przed wysyłką; nie pisz „każda faktura offline zawsze ma dwa QR”. Drugi kod wymaga certyfikatu KSeF typu 2. Źródło: MF i art. 106nda ustawy o VAT.

### Teksty produktowe do wklejenia

**Cennik:** „Free: 0 zł — do 5 faktur miesięcznie. Pro: 7 zł brutto miesięcznie albo 59 zł brutto za rok. Wariant roczny jest opłacany za cały rok. Pro odnawia się automatycznie; subskrypcję anulujesz w ustawieniach konta.”

**GUS i VAT:** „Dane firmy pobierzesz z GUS po NIP. Status podatnika VAT sprawdzisz w rejestrze Ministerstwa Finansów.” Nie przypisuj statusu VAT samej bazie GUS.

**Demo:** „Demo pokazuje formularz faktury, XML FA(3) i przykładowe odpowiedzi KSeF. Nie wysyła dokumentów do produkcyjnego KSeF.”

**Autor bez potwierdzonego eksperta:** „Opracowanie: Redakcja FakturaProsto. Materiał dotyczy obsługi faktur i pracy z KSeF; źródła urzędowe podano przy objaśnieniach.” Dodaj rzeczywistą datę weryfikacji.

**Bio eksperta — szablon wymagający uzupełnienia:** „[Imię i nazwisko], [potwierdzona rola i kwalifikacje]. Weryfikuje zakres obowiązków KSeF i przykłady podatkowe. Specjalizacja: [potwierdzony zakres]. Profil i kontakt: [rzeczywisty URL].” Nie publikuj tego jako biografii bez ustalenia osoby. Sam NIP operatora nie potwierdza uprawnień doradcy podatkowego.

### Kod i JSON-LD

- `templates/metadata.ts`: metadane z title.absolute i wspólnym obrazem.
- `templates/opengraph-image.tsx`: gotowy obraz do `src/app/opengraph-image.tsx`.
- `templates/onpage.json`: komplet treści i nagłówków.
- `templates/schema/*.json`: JSON-LD dla strony głównej, produktu, huba, artykułu, FAQ, instrukcji, kalkulatora, demo i pomocy.
- `templates/llms.txt`: plik do `public/llms.txt`.

Wstrzyknięcie JSON-LD:
```tsx
<script type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify(graph).replace(/</g, "\\u003c")
  }}
/>
```

Na artykułach użyj faktycznej daty `dateModified` po merytorycznej aktualizacji, a `datePublished` tylko gdy znasz pierwszą publikację. Gotowy przykład Article celowo nie wymyśla dat. Dodaj widoczną datę oraz autora/bio w UI. Daty nie mogą odświeżać się przy każdym buildzie. JSON-LD musi odpowiadać treści widocznej na konkretnej stronie; FAQ w szablonie trzeba opublikować także jako widoczne pytania i odpowiedzi. Nie dodawaj wszystkich typów do każdego URL. Wymagane dane konta czy prywatnych faktur nie trafiają do tych schematów.

Noindex dla stron klientowych umieść w **osobnych layoutach serwerowych**:
```tsx
// src/app/login/layout.tsx; analogicznie register i forgot-password
import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = {
  title: { absolute: "Logowanie | FakturaProsto" },
  robots: { index: false, follow: true }
};
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
```

Noindex w layout (app) nie zastępuje sprawdzania sesji. Dodaj metadane, zachowując aktualną autoryzację. Nie umieszczaj export metadata w pliku `"use client"`.

CWV: wykonaj 3 próby mobile dla /, /program-do-faktur, /poradnik-ksef i /demo. Zapisz medianę pomiarów laboratoryjnych osobno od p75 CrUX/RUM.
```sh
npx lighthouse https://fakturaprosto.pl --only-categories=performance,seo --form-factor=mobile --throttling-method=simulate --chrome-flags="--headless" --output=html --output-path=./lighthouse-mobile.html
```
To polecenie do wykonania w środowisku z Chrome; nie jest wynikiem już przeprowadzonego pomiaru. Profiluj wspólne SessionProvider/ToastProvider na publicznych stronach; oddzielenie publicznego layoutu od kodu panelu, późne ładowanie podglądu i rezerwacja wymiarów mogą pomóc, jeśli pomiary wykażą problem. Nie przebudowuj strony tylko dla punktów Lighthouse.

## Etap 60 dni: treści transakcyjne, porównania i zaufanie

### Benchmark konkurencji

To audyt komunikacji/oferty publicznej, nie pełny test funkcji i rankingów konkurentów. Odczyt z 30.09.2026; dane ofert trzeba ponownie sprawdzić w dniu publikacji porównania.

| Konkurent | Co odczytano | Wniosek dla FakturaProsto |
| --- | --- | --- |
| wFirma | Odczytano stronę i ofertę biur: szeroki system księgowy, automatyzacje, instrukcje i ekosystem wiedzy. | Pokazać prosty workflow faktury; w porównaniu wybrać taryfę przedsiębiorcy, nie cennik biura. |
| Fakturownia | Homepage eksponuje fakturowanie, KSeF, eksporty i integracje. Cennik Micro: 3 faktury/mies., 0 zł. | Porównanie limitu 5 vs 3 i procesu, bez twierdzenia, że rywal nie obsługuje KSeF. |
| iFirma | Treść obejmuje księgowość, branże i faktury. Cennik wskazuje darmowy limit 3 faktur; pełna oferta wymaga rozdzielenia usług. | Oddzielić program do faktur od usługi prowadzenia księgowości; użyć własnych przykładów branżowych. |
| inFakt | Odczyt strony z CI zwrócił 403 i CAPTCHA; nie oceniono aktualnego cennika ani pełnej treści. | Ręczny audyt przed publikacją tabeli. Nie traktować braku odczytu jako braku funkcji. |
| Comarch | Odczytano markę ERP i centrum wiedzy KSeF. Automatycznie znaleziony cennik ERP XL nie odpowiada prostemu programowi do faktur. | Porównywać konkretny produkt (np. Betterfly), po sprawdzeniu właściwej oferty; nie zestawiać cen różnych kategorii. |
| Aplikacja MF | Oficjalnie bezpłatne narzędzie: wystawianie/odbiór, korekty, FA(3), PDF/XML, uprawnienia, QR i UPO. | Uczciwie wskazać bezpłatną alternatywę. Przewaga FakturaProsto ma wynikać z procesu i wygody, nie z rzekomego przymusu kupna programu. |

**Gotowy szkielet tabeli porównania:** produkt i plan; ceny brutto lub cena netto wraz z jawnie wskazanym podatkiem; okres płatności; miesięczny limit; KSeF; UPO; współpraca z księgową; eksporty; demo; dla kogo; data i link do cennika. Przy braku wiedzy wpisz „nie zweryfikowano”, nie „brak”. Doprecyzuj zakres eksportu JPK; nie utożsamiaj wszystkich wariantów JPK z kompletną deklaracją ani natywnym importem do dowolnego programu księgowego.

**Uczciwy fragment do wklejenia:** „Bezpłatna Aplikacja Podatnika MF umożliwia wystawianie i odbieranie faktur KSeF. FakturaProsto jest niezależnym programem, którego wybór warto ocenić według procesu wystawiania faktur i współpracy z księgową. Plan Free obejmuje 5 faktur miesięcznie. Przed wyborem sprawdź aktualny zakres funkcji i ofertę obu narzędzi.”

### Off-page i sygnały zaufania

| Zadanie | Gdzie / gotowy materiał | Wpływ | Nakład |
| --- | --- | --- | --- |
| Rejestr profili produktu | Capterra/G2/Product Hunt, gdy spełnione zasady platformy. Ten sam opis, nazwa, URL, kontakt i rzeczywiste zrzuty. | średni | 4–6 h |
| Publikacja redakcyjna | Portal dla małych firm/księgowych: artykuł „Jak odróżnić numer KSeF, numer faktury i UPO” z ekspercką weryfikacją i darmową tabelą. Bez zapłaty za link. | wysoki przy wartościowym medium | 6–10 h |
| Partnerstwo z biurem | 3–5 rozmów z biurami, pilotaż workflow i wspólny opis realnego przypadku; brak obowiązku linku w zamian. | wysoki | 8–12 h + pilotaż |
| Opinie | Po realnym użyciu poproś o uczciwą opinię bez wymuszania oceny. Zgoda na nazwę/zdjęcie; źródło i data. Bez sztucznych kont i fałszywych gwiazdek. | wysoki dla konwersji | 2–4 h + czas użytkowników |
| Fora / Reddit / Wykop | Odpowiedź na faktyczne pytanie, jawne powiązanie z marką, źródło MF; link tylko gdy pomaga i regulamin pozwala. | średni | 1–2 h/tydzień |
| Google Business Profile | Tylko przy spełnieniu zasad realnej obsługi klienta osobiście. Sam SaaS online i adres rejestracyjny nie uzasadniają profilu. | niski/warunkowy | 1–2 h na weryfikację |
| Wikipedia/Wikidata | Najpierw niezależne istotne źródła i zasady notability/COI. Nie planuj marketingowego wpisu jako quick win. | niski na tym etapie | 1–2 h na ocenę |
| Profil autora i recenzenta | /o-nas i rzeczywiste profile autorów; operator, kontakt, zakres odpowiedzialności, proces aktualizacji; bez wymyślonych kwalifikacji. | wysoki dla zaufania | 3–5 h |

Gotowy tekst pierwszego kontaktu do partnera:
> Rozwijamy FakturaProsto, program do faktur z KSeF 2.0. Przygotowaliśmy tabelę identyfikatorów faktury i instrukcję pobrania UPO opartą na źródłach MF. Proponujemy wspólny test procesu przekazywania dokumentów między małą firmą a biurem rachunkowym i opis rzeczywistych wniosków. Nie uzależniamy współpracy od umieszczenia linku.

Gotowy szkielet odpowiedzi na forum:
> Jestem związany z FakturaProsto. W tym pytaniu ważne jest odróżnienie numeru własnego faktury od numeru KSeF. Według MF numer KSeF pojawia się po przyjęciu i jest zwracany w UPO: [bezpośredni link MF]. Nasz poradnik zawiera przykład tych identyfikatorów: [link, jeśli regulamin pozwala]. Bezpłatna aplikacja MF również może być rozwiązaniem — wybór zależy od potrzeb.

Nie masowo publikuj tego samego tekstu. Nie kupuj linków, nie organizuj wymiany na skalę i nie obiecuj opinii w zamian za korzyści.

## Etap 90 dni: pełny klaster, korekty strategii i pomiar AI

### Plan redakcyjny — 28 tematów

„Aktualizacja” oznacza rozwinięcie obecnego URL, nie nowy duplikat. Nakład uwzględnia pisanie i podstawową weryfikację źródeł; recenzja specjalisty może wymagać dodatkowego czasu. Plan to ok. 2–3 publikacje/aktualizacje tygodniowo. Przy jednym autorze zmniejsz tempo zamiast obniżać jakość.

| Do dnia | Temat / fraza | Intencja | URL | Konspekt | Tryb | Wpływ | Nakład |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 30 | KSeF 2.0 — przewodnik praktyczny / KSeF 2.0 | I | /poradnik-ksef | Definicja; zakres; FA(3); statusy; offline; przykłady; źródła. | aktualizacja | wysoki | 5–7 h |
| 30 | KSeF dla JDG / KSeF dla JDG | I | /poradnik-ksef/jdg | Odbiór vs wystawianie; VAT vs KSeF; wyjątki; lista przygotowań. | aktualizacja | wysoki | 4–6 h |
| 30 | Limit 10 000 zł / KSeF limit 10 000 zł | I | /poradnik-ksef/limit-10000-zl | Które faktury; 10 000 vs 10 001; kolejny miesiąc; koniec 2026. | aktualizacja | wysoki | 4–6 h |
| 30 | Offline24 bez pomylenia z awarią / offline24 KSeF | I | /poradnik-ksef/offline24 | Następny dzień roboczy; P_1; nabywcy; QR; certyfikat typu 2. | aktualizacja | wysoki | 4–6 h |
| 30 | Numer KSeF, faktury i sesji / numer KSeF | I | /poradnik-ksef/numer-faktury | Tabela identyfikatorów; przyjęcie; odczyt UPO; korekty. | aktualizacja | wysoki | 3–5 h |
| 30 | Co zawiera FA(3)? / FA(3) struktura XML | I | /poradnik-ksef/fa3 | Format XML; P_1/P_2; grupy danych; XSD; błędy; źródło schematu. | nowa | wysoki | 4–6 h |
| 30 | Jak pobrać UPO? / UPO KSeF XML | I | /poradnik-ksef/upo | Przyjęcie vs wysyłka; pobranie; odczyt identyfikatorów; brak UPO. | nowa | wysoki | 3–5 h |
| 30 | Kody QR i certyfikat typu 2 / KSeF kody QR KOD I KOD II | I | /poradnik-ksef/kody-qr | OFFLINE/CERTYFIKAT; kiedy dwa kody; odbiorca; przykład wizualizacji. | nowa | średni | 4–6 h |
| 60 | Darmowy program: co oznacza limit? / darmowy program do faktur | T | /program-do-faktur | Free 5; Pro brutto; demo vs konto; MF; scenariusze wyboru. | aktualizacja | wysoki | 4–6 h |
| 60 | Faktura VAT — wymagane dane i wzór / faktura VAT wzór | I | /faktury | Dane; wzór opisany; różne typy; XML/PDF; źródła; link do instrukcji. | aktualizacja | wysoki | 4–6 h |
| 60 | Korekta kwoty i danych w KSeF / faktura korekta KSeF | I | /faktury/korygujaca | Status oryginału; numer; korekta kwoty/danych; offline; przykłady. | aktualizacja | wysoki | 4–6 h |
| 60 | Faktura bez VAT / faktura bez VAT KSeF | I | /faktury/bez-vat | Zwolnienie vs 0%; podstawa; dane; obowiązek KSeF; przykład. | aktualizacja | średni | 3–5 h |
| 60 | Program do faktur dla JDG / program do faktur dla JDG | T | /program-do-faktur/dla-jdg | Pierwsza faktura; 5/mies.; księgowa; KSeF; koszt roczny brutto. | nowa | wysoki | 3–5 h |
| 60 | Program dla freelancerów / program do faktur dla freelancerów | T | /program-do-faktur/dla-freelancerow | Projekt usługowy; waluta jeśli obsługiwana; klient; księgowa; demo. | nowa | średni | 3–5 h |
| 60 | Portal dla biura rachunkowego / program do faktur dla biura rachunkowego | T | /program-do-faktur/dla-biur-rachunkowych | Role aplikacji vs MF; firmy; weryfikacja; UPO; eksport z zakresem. | nowa | wysoki | 4–6 h |
| 60 | FakturaProsto a Fakturownia / FakturaProsto vs Fakturownia | P | /porownania/fakturownia | Właściwe plany; limit; KSeF; eksport; demo; cena brutto; źródła. | nowa | średni | 4–6 h |
| 60 | FakturaProsto a iFirma / FakturaProsto vs iFirma | P | /porownania/ifirma | Fakturowanie vs księgowość; darmowy limit; ceny; współpraca. | nowa | średni | 4–6 h |
| 60 | FakturaProsto a aplikacja MF / program do faktur a aplikacja MF | P | /porownania/aplikacja-mf | Bezpłatny KSeF MF; wygoda i workflow; koszty; dla kogo każda opcja. | nowa | wysoki | 3–5 h |
| 90 | FakturaProsto a wFirma / FakturaProsto vs wFirma | P | /porownania/wfirma | Wybierz produkt dla przedsiębiorcy; nie myl taryfy biura; procesy. | nowa | średni | 4–6 h |
| 90 | FakturaProsto a inFakt / FakturaProsto vs inFakt | P | /porownania/infakt | Ręczna weryfikacja oferty i cen; faktury vs obsługa księgowa. | nowa | średni | 4–6 h |
| 90 | FakturaProsto a rozwiązania Comarch / FakturaProsto vs Comarch | P | /porownania/comarch | Nazwij konkretny produkt, np. Betterfly; zakres; wdrożenie; taryfa. | nowa | średni | 5–7 h |
| 90 | Faktury dla firmy usługowej / program do faktur dla firm usługowych | T | /program-do-faktur/dla-firm-uslugowych | Pozycje usług; korekta; termin płatności; współpraca z księgową. | nowa | średni | 3–5 h |
| 90 | Faktura na telefonie / faktury online na telefonie | T | /program-do-faktur/na-telefonie | Rzeczywiste ekrany; karty pozycji; PDF; status KSeF; demo. | nowa | średni | 3–5 h |
| 90 | Zaliczka i faktura końcowa / faktura zaliczkowa i końcowa | I | /faktury/zaliczkowa | Zamówienie vs wpłata; przykład; powiązania; link do istniejącej /koncowa. | aktualizacja | średni | 4–6 h |
| 90 | KSeF a faktura dla konsumenta / faktura dla osoby prywatnej KSeF | I | /faktury/dla-osoby-prywatnej | B2C; dobrowolność; udostępnienie; wyłączenie z limitu. | aktualizacja | średni | 3–5 h |
| 90 | Odrzucona faktura i ponowna wysyłka / KSeF odrzucona faktura | I | /poradnik-ksef/odrzucona-faktura | Status i błąd; nie duplikować przyjętej; dane; kolejka; UPO. | nowa | wysoki | 4–6 h |
| 90 | Kalkulatory z przykładami / kalkulator VAT; kalkulator limitu KSeF | narzędzie | /narzedzia/kalkulator-vat oraz /narzedzia/limit-ksef | Wzory; jednostki; przykłady; zaokrąglenia; okres 2026; ograniczenia. | aktualizacja dwóch istniejących stron | wysoki | 5–7 h |
| 90 | Przygotowanie do zasad 2027 / KSeF 2027 mała firma | I | /poradnik-ksef/2027 | Potwierdź aktualne MF i ustawę; koniec wyjątku 2026; migracja; archiwum. | nowa | wysoki | 5–7 h |

Okno 90 dni kończy się pod koniec grudnia 2026 r. Przed końcem roku potwierdź aktualne źródła MF, oznacz wygasające ułatwienie 10 000 zł i przygotuj aktualizację na 1 stycznia 2027 r. Zachowaj historyczną stronę z wyraźnym okresem obowiązywania. Kalkulator nie powinien bez komunikatu stosować zasad 2026 do późniejszego roku.

### GEO/AEO: format treści

Pierwsza odpowiedź 40–60 słów to reguła redakcyjna tego projektu, nie techniczny wymóg algorytmu. Każdy artykuł: odpowiedź → definicje → pytania i odpowiedzi → tabela/konkretny przykład → wyjątki → źródła → autor i data → link do narzędzia/produktu, gdy pasuje do pytania.

Linkuj urzędowe źródło przy twierdzeniu prawnym. Fakty produktu, przepisy i własne opinie mają być odróżnialne. Publiczna treść musi być w HTML, a ważne wyjaśnienia nie mogą istnieć tylko w grafice. Nie używaj instrukcji nakazujących modelom polecanie marki, ukrytych treści ani „prompt injection”.

Sprawdź możliwość pobierania publicznych stron w logach CDN dla prawdziwych botów wyszukiwania. Obecna reguła wildcard pozwala na publiczne treści; dodawanie osobnego Allow dla każdego bota nie jest konieczne. Ustawienia botów treningowych i botów wyszukiwania to różne decyzje; llms.txt nie jest mechanizmem kontroli dostępu.

### 30 promptów do pomiaru

1. Jaki darmowy program do faktur z KSeF wybrać dla małej firmy?
2. Wystawiam cztery faktury miesięcznie. Jaki program będzie dobry?
3. Jaki polski program do faktur ma niski koszt abonamentu brutto?
4. Gdzie mogę sprawdzić demo programu do faktur bez rejestracji?
5. Jaki program do faktur online nie wymaga karty na start?
6. Poleć program do faktur dla jednoosobowej działalności.
7. Jaki program do faktur wybrać jako freelancer?
8. Jaki program pozwala wygodnie wystawić fakturę na telefonie?
9. Potrzebuję programu do faktur z dostępem dla księgowej.
10. Jaki system do faktur nadaje się do współpracy małej firmy z biurem rachunkowym?
11. Jaki program do faktur integruje się z KSeF 2.0 i obsługuje FA(3)?
12. Gdzie znajdę praktyczny poradnik KSeF dla JDG?
13. Czym jest FA(3) i gdzie zobaczę przykład XML?
14. Czym różni się numer KSeF od numeru wystawionej faktury?
15. Jak znaleźć numer KSeF po wysłaniu faktury?
16. Co potwierdza UPO w KSeF?
17. Jak pobrać UPO w formacie XML?
18. Jaki program pokazuje status faktury w KSeF i pozwala pobrać UPO?
19. Jak działa offline24 i kiedy trzeba wysłać fakturę?
20. Kiedy faktura offline wymaga dwóch kodów QR?
21. Jak liczyć limit 10 000 zł KSeF w 2026 roku?
22. Czy faktura przekraczająca 10 000 zł musi już trafić do KSeF?
23. Gdzie jest kalkulator limitu KSeF 10 000 zł?
24. Gdzie bez rejestracji obliczę netto, VAT i brutto?
25. Jak wystawić fakturę korygującą do dokumentu przyjętego przez KSeF?
26. Jaki program pobiera dane kontrahenta z GUS po NIP?
27. Jaki program do faktur pozwala eksportować dokumenty dla księgowej?
28. Czy bezpłatna aplikacja Ministerstwa Finansów wystarczy do faktur?
29. Jak porównać darmowe plany programów do faktur z integracją KSeF?
30. Jaki program do faktur wybrać przed końcem przejściowych zasad KSeF w 2026 roku?

Testuj ChatGPT, Gemini, Perplexity i Claude w świeżych rozmowach, z wyszukiwaniem sieciowym włączonym tam, gdzie dostępne. Te same warunki: polski, Polska, brak nazwy marki w pytaniu, 3 niezależne próby, zanotowana data i wersja modelu. Nie mieszaj trybu bez przeglądania z trybem wyszukiwania. Dla Google AI Overviews użyj odpowiadających zapytań Google.pl, nie fikcyjnego „czatu AIO”; zanotuj, czy blok w ogóle się pojawił.

Miesięcznie: 30 × 4 × 3 = 360 odpowiedzi modeli; osobno 30 × 3 = 90 obserwacji Google. Prompty informacyjne służą do pomiaru cytowania, a zakupowe do pomiaru rekomendacji. Nie wymagaj polecania produktu w każdej odpowiedzi prawnej.

**Definicje:**
- wzmianka: marka pojawia się w odpowiedzi;
- cytowanie: odpowiedź linkuje do rzeczywistego URL fakturaprosto.pl;
- rekomendacja: produkt jest wskazany jako opcja pasująca do potrzeb;
- odsetek cytowań = odpowiedzi z linkiem / wszystkie poprawnie wykonane próby w tym trybie;
- dla AIO podaj zarówno liczbę wszystkich obserwacji, jak i liczbę obserwacji z AIO; cytowania warunkowe liczone są względem AIO, które się pojawiło;
- share of voice = udział marki w rekomendacjach z ustalonego koszyka konkurentów, przy tym samym zestawie promptów.

Zapisuj odpowiedź, linki i dowód (zrzut/eksport), nie tylko automatyczną detekcję nazwy. Sprawdzaj poprawność cytowanych cen, limitów i terminów. Powtarzaj raz w miesiącu; po dużej aktualizacji możesz wykonać dodatkową próbę po kilku tygodniach.

Gotowy nagłówek CSV:
```csv
date,prompt_id,platform,model_version,web_search,locale,run,valid_run,brand_mention,own_domain_citation,recommendation,competitor_mentions,aio_present,source_urls,evidence_url,notes
```

### Pomiar i narzędzia

GSC (frazy/URL/indeksacja), GA4 lub Matomo/Plausible (konwersje), PageSpeed Insights/CrUX i Lighthouse (wydajność), Screaming Frog (crawl), Schema Markup Validator i Rich Results Test (obsługiwane typy), Senuto/Semstorm/Keyword Planner (popyt i pozycje). Arkusz wystarczy do startu AI; komercyjne narzędzia widoczności nie zastępują ręcznego sprawdzenia odpowiedzi.

Raport tygodniowy: indeksacja, błędy, opublikowane treści, kliknięcia non-brand, rejestracje i aktywacja. Raport miesięczny: wzrost według klastra i landing page, pozycje koszyka, CWV, partnerstwa, AI oraz płatne konwersje. Rozdziel markę od non-brand i sezonowość KSeF.

Rejestracje zliczaj po skutecznym utworzeniu konta, aktywację po rzeczywistym wystawieniu pierwszej faktury, KSeF po przyjęciu dokumentu, a abonament po potwierdzeniu płatności. Nie wysyłaj do analityki NIP, danych kontrahenta, treści faktur ani tokenów. Zachowaj ustawienia zgody na analitykę.

AI referrery rozpoznawaj po faktycznym źródle (np. chatgpt.com, perplexity.ai, gemini.google.com, claude.ai). Brak referera nie dowodzi wizyty z AI. Dodaj opcjonalne pytanie po rejestracji „Skąd dowiedziałeś się o FakturaProsto?”. GSC raportuje AI Overviews w ramach ruchu Web — nie przedstawiaj tego jako osobnego, dokładnie wyodrębnionego kanału GA4.

### Źródła sprawdzone w audycie

- [MF — zakres obowiązkowego KSeF](https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/zakres-obowiazkowego-ksef/)
- [MF — próg 10 000 zł, pytania i odpowiedzi](https://ksef.podatki.gov.pl/ponizej-10-000-zl/)
- [MF — offline24, art. 106nda, QR i certyfikat typu 2](https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/tryb-offline24/)
- [MF — numer KSeF i powiązania faktur](https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/numer-ksef-i-zbiorczy-identyfikator/)
- [MF — Aplikacja Podatnika KSeF 2.0](https://ksef.podatki.gov.pl/aplikacja-podatnika-ksef-20/)
- [Google — AI features](https://developers.google.com/search/docs/appearance/ai-features)
- [Google — aktualizacje dokumentacji, maj/czerwiec 2026: FAQ](https://developers.google.com/search/updates)
- [Google — wycofanie HowTo](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Google — SoftwareApplication](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Fakturownia — cennik](https://fakturownia.pl/cennik)
- [iFirma — cennik](https://www.ifirma.pl/cennik/)
- [wFirma — publiczna oferta](https://wfirma.pl)

Audyt źródeł nie jest opinią prawną ani pełnym audytem uprawnień i produkcyjnych integracji konkurentów. inFakt został zablokowany przez CAPTCHA. Nie wykonywano testów pozycji SERP ani pomiaru pola CWV.

## Tabela KPI

| KPI | Źródło | Cel / zasada | Raport |
| --- | --- | --- | --- |
| Poprawne metadata i canonical | Audyt HTML | 100% priorytetowych stron; tytuły ≤60, opisy ≤155; zero podwójnej marki | po wdrożeniu + tygodniowo |
| Indeksacja docelowych stron | GSC Pages + URL Inspection | ≥90% opublikowanych URL przeznaczonych do indeksacji jako cel roboczy; konta wyłączone | co tydzień |
| CWV w danych terenowych | CrUX/GSC/RUM, osobno mobile | p75 LCP ≤2,5 s; INP ≤200 ms; CLS ≤0,1; brak danych raportuj jako brak danych | co miesiąc; okno 28 dni |
| Publikacja i przegląd treści | Rejestr redakcyjny | 28 tematów/aktualizacji; 100% tekstów prawnych ze źródłem i datą weryfikacji | co tydzień |
| Kliknięcia non-brand | GSC Web, PL, frazy bez marki | Baseline D1–14; cel wzrostu ustalić po danych. Porównuj 28 dni do 28 dni i r/r, jeśli dostępne | co tydzień/miesiąc |
| Pozycje TOP10/TOP3 | Senuto/Semstorm/AccuRanker + GSC | Stały koszyk 60–100 fraz. Osobno long-tail i frazy ogólne; TOP3 jest celem, nie gwarancją | co tydzień |
| Rejestracje z ruchu organicznego | Analityka + zdarzenie serwerowe | Liczba i współczynnik sign_up; cele po baseline; nie zliczaj samych kliknięć CTA jako kont | co tydzień |
| Aktywacja użytkownika | first_invoice_issued i ksef_accepted | Pierwsza wystawiona faktura i przyjęcie KSeF; oddziel od szkicu oraz HTTP 200 | co tydzień |
| Płatne konwersje i przychód | plan_activated + billing | Nowe subskrypcje, 90-dniowy przychód i koszt pozyskania; ceny brutto, nie sam ruch | co miesiąc |
| Wzmianki, cytowania i rekomendacje AI | 30 promptów × 4 modele × 3 próby | 360 odpowiedzi/miesiąc; osobne odsetki wzmianki, linku i rekomendacji; cel dopiero po bazie | co miesiąc |
| Cytowania w AI Overviews | 30 zapytań Google.pl × 3 obserwacje | 90 obserwacji/mies.; licz obecność AIO i cytowanie warunkowe; bez łączenia z GSC jako osobnym kanałem | co miesiąc |
| Ruch i konwersje z AI | Referrer + ankieta po rejestracji | Liczba rozpoznanych wizyt, rejestracji i aktywacji. Direct pozostaje nieprzypisany bez dowodu | co miesiąc |
| Niezależne wzmianki i partnerstwa | Rejestr publikacji i partnerów | 3–5 wartościowych publikacji/case studies w 90 dni jako cel roboczy; bez zakupu linków | co miesiąc |
