/**
 * src/lib/legal/content.ts
 * 
 * Oficjalne treści dokumentów prawnych serwisu FakturaProsto (https://fakturaprosto.pl).
 * Opracowane w oparciu o aktualne przepisy:
 * - RODO (Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2016/679)
 * - Prawo komunikacji elektronicznej (ustawa z 12 lipca 2024 r., Dz.U. 2024 poz. 1221)
 * - Ustawa o świadczeniu usług drogą elektroniczną (Dz.U. z 2020 r. poz. 344)
 * - Ustawa o prawach konsumenta (Dz.U. z 2023 r. poz. 2759) i Kodeks cywilny
 * - Ustawa o podatku od towarów i usług (art. 106a-106q, art. 112a, art. 31a)
 */

import { OPERATOR_CONFIG, EFFECTIVE_DATE, LEGAL_VERSIONS } from "./config";

export interface LegalDocument {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  version: string;
  effectiveDate: string;
  description: string;
  sections: Array<{
    title: string;
    content: string;
  }>;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 1. REGULAMIN ŚWIADCZENIA USŁUG DROGĄ ELEKTRONICZNĄ
 * ───────────────────────────────────────────────────────────────────────────── */
export const TERMS_OF_SERVICE: LegalDocument = {
  id: "terms-of-service",
  slug: "regulamin",
  title: "Regulamin Świadczenia Usług Drogą Elektroniczną",
  shortTitle: "Regulamin",
  version: LEGAL_VERSIONS.terms,
  effectiveDate: EFFECTIVE_DATE,
  description: "Warunki korzystania z platformy FakturaProsto, rejestracji kont, wystawiania faktur, integracji KSeF oraz praw i obowiązków stron.",
  sections: [
    {
      title: "§ 1. Postanowienia ogólne i dane Operatora",
      content: `1. Niniejszy Regulamin określa zasady i warunki techniczne świadczenia usług drogą elektroniczną za pośrednictwem serwisu internetowego FakturaProsto, dostępnego pod adresem internetowym ${OPERATOR_CONFIG.serviceUrl}.
2. Operatorem Serwisu i Usługodawcą jest:
   ${OPERATOR_CONFIG.companyName}
   Forma prawna: ${OPERATOR_CONFIG.legalForm}
   Adres: ${OPERATOR_CONFIG.addressStreet}, ${OPERATOR_CONFIG.addressPostal} ${OPERATOR_CONFIG.addressCity}, ${OPERATOR_CONFIG.addressCountry}
   NIP: ${OPERATOR_CONFIG.nip}${OPERATOR_CONFIG.regon ? ` | REGON: ${OPERATOR_CONFIG.regon}` : ""}${OPERATOR_CONFIG.krs ? ` | Rejestr: ${OPERATOR_CONFIG.krs}` : ""}
   Adres poczty elektronicznej do kontaktu: ${OPERATOR_CONFIG.emailContact}
   Adres poczty elektronicznej ds. wsparcia i reklamacji: ${OPERATOR_CONFIG.emailComplaints}
3. Regulamin jest udostępniany nieodpłatnie każdemu Użytkownikowi przed zawarciem umowy pod adresem ${OPERATOR_CONFIG.serviceUrl}/regulamin w formie umożliwiającej jego pozyskanie, odtworzenie, utrwalenie oraz wydrukowanie.
4. Korzystanie z Serwisu wymaga zapoznania się z treścią Regulaminu i jego akceptacji w procesie rejestracji konta lub składania oświadczenia woli.`,
    },
    {
      title: "§ 2. Definicje",
      content: `Ilekroć w niniejszym Regulaminie użyto poniższych określeń, należy je rozumieć następująco:
1. **Operator / Usługodawca** — podmiot wskazany w § 1 ust. 2 Regulaminu.
2. **Serwis / Aplikacja** — platforma oprogramowania jako usługa (SaaS) działająca pod domeną ${OPERATOR_CONFIG.serviceUrl}.
3. **Użytkownik** — osoba fizyczna posiadająca pełną zdolność do czynności prawnych, osoba prawna lub jednostka organizacyjna nieposiadająca osobowości prawnej, która korzysta z Serwisu.
4. **Klient** — Użytkownik prowadzący działalność gospodarczą, który utworzył Profil Firmy w Serwisie.
5. **Konto** — przypisany do adresu e-mail Użytkownika zbiór zasobów i uprawnień w systemie teleinformatycznym Operatora.
6. **Właściciel Konta** — Użytkownik, który założył konto firmowe i posiada pełne uprawnienia administracyjne.
7. **Członek Zespołu** — Użytkownik zaproszony przez Właściciela Konta (np. pracownik, księgowa, audytor) o określonym zakresie uprawnień.
8. **Konsument** — osoba fizyczna dokonująca z przedsiębiorcą czynności prawnej niezwiązanej bezpośrednio z jej działalnością gospodarczą lub zawodową.
9. **Przedsiębiorca na prawach konsumenta (PNPK)** — osoba fizyczna zawierająca umowę bezpośrednio związaną z jej działalnością gospodarczą, gdy z treści tej umowy wynika, że nie posiada ona dla niej charakteru zawodowego (art. 385[5] KC oraz art. 38a ustawy o prawach konsumenta).
10. **KSeF** — Krajowy System e-Faktur prowadzony przez Ministerstwo Finansów na podstawie ustawy o podatku od towarów i usług.`,
    },
    {
      title: "§ 3. Wymagania techniczne",
      content: `1. Prawidłowe korzystanie z Serwisu wymaga:
   a) urządzenia końcowego z dostępem do sieci Internet (komputer, tablet, smartfon),
   b) aktualnej wersji przeglądarki internetowej (np. Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Edge, Opera) z włączoną obsługą JavaScript oraz technologii Web Crypto API,
   c) aktywnego konta poczty elektronicznej (e-mail),
   d) włączonej obsługi niezbędnych plików cookies (szczegółowo opisanych w Polityce Cookies).
2. Transmisja danych pomiędzy przeglądarką Użytkownika a serwerami Serwisu jest zabezpieczona protokołem szyfrującym TLS (HTTPS).
3. Operator nie ponosi odpowiedzialności za nieprawidłowości wynikające z niespełnienia wymagań technicznych przez urządzenie Użytkownika lub korzystania z nieaktualnego oprogramowania.`,
    },
    {
      title: "§ 4. Zawarcie umowy i rejestracja konta",
      content: `1. Zawarcie umowy o świadczenie usług drogą elektroniczną (prowadzenie Konta) następuje z chwilą ukończenia procedury rejestracji w Serwisie i akceptacji niniejszego Regulaminu.
2. W procesie rejestracji Użytkownik zobowiązany jest do:
   a) podania prawdziwego i aktualnego adresu e-mail,
   b) ustalenia silnego hasła spełniającego kryteria bezpieczeństwa (min. 8 znaków),
   c) złożenia dobrowolnego oświadczenia o akceptacji Regulaminu poprzez zaznaczenie niezaznaczonego domyślnie pola wyboru (checkbox).
3. Podanie danych jest dobrowolne, jednak niezbędne do założenia Konta i świadczenia Usługi.
4. Z chwilą utworzenia Konta firmowego i wprowadzenia danych kontrahentów dochodzi do zawarcia Umowy Powierzenia Przetwarzania Danych Osobowych (DPA), której treść stanowi odrębny dokument dostępny na stronie ${OPERATOR_CONFIG.serviceUrl}/powierzenie-danych.`,
    },
    {
      title: "§ 5. Zakres Usług i model korzystania",
      content: `1. Operator udostępnia Użytkownikom za pośrednictwem Serwisu następujące narzędzia:
   a) wystawianie, ewidencjonowanie i edycja faktur sprzedaży (VAT, bez VAT, proforma, zaliczkowe, korygujące),
   b) wystawianie faktur w walutach obcych z automatycznym przeliczaniem kursów średnich NBP zgodnie z art. 31a ustawy o VAT,
   c) rejestrowanie kontrahentów krajowych (weryfikacja w rejestrze GUS BIR 1.1) oraz zagranicznych (sprawdzenie formatu VAT UE, bez potwierdzenia w VIES, oraz TIN spoza UE),
   d) generowanie plików dokumentów w formacie PDF, ustrukturyzowanych XML FA(3) oraz zestawień księgowych (CSV, ZIP),
   e) moduł pracy wieloużytkownikowej w ramach jednej firmy (zapraszanie członków zespołu, nadawanie ról: Właściciel, Księgowa, Pracownik, Podgląd),
   f) integracja z Krajowym Systemem e-Faktur (KSeF) — generowanie struktur FA(3), odbiór UPO i podgląd statusów (w trybie testowym lub produkcyjnym zgodnie z konfiguracją Użytkownika),
   g) rejestracja wpłat oraz trwały dziennik audytu operacji (Audit Log).
2. **Model bezpłatny / płatny**:
   a) W bieżącej fazie działania Serwis udostępniany jest w wersji bezpłatnej (brak konieczności podawania danych karty płatniczej ani uiszczania opłat za rejestrację).
   b) W przypadku wprowadzenia w przyszłości planów płatnych lub pakietów rozszerzonych, Operator przedstawi jasny cennik i warunki subskrypcji. Zamówienie usługi płatnej będzie wymagało wyraźnego potwierdzenia przez Użytkownika z informacją o obowiązku zapłaty. Operator nie wprowadzi opłat za dotychczasowe bezpłatne korzystanie z mocą wsteczną.`,
    },
    {
      title: "§ 6. Prawa i obowiązki stron oraz odpowiedzialność",
      content: `1. **Obowiązki Użytkownika**:
   a) Użytkownik zobowiązuje się do korzystania z Serwisu zgodnie z przepisami prawa, dobrymi obyczajami oraz niniejszym Regulaminem.
   b) Użytkownik ponosi wyłączną odpowiedzialność za prawidłowość merytoryczną, podatkową i rachunkową danych wprowadzanych do faktur, dobór stawek podatku VAT, weryfikację kontrahentów oraz terminowość rozliczeń z organami skarbowymi.
   c) Zakazane jest dostarczanie przez Użytkownika treści o charakterze bezprawnym, naruszających prawa osób trzecich, złośliwego oprogramowania lub podejmowanie prób nieautoryzowanego dostępu do infrastruktury Serwisu.
2. **Obowiązki i odpowiedzialność Operatora**:
   a) Operator dokłada należytej staranności zawodowej w celu zapewnienia ciągłego, bezpiecznego i stabilnego działania Serwisu.
   b) **Zastrzeżenie rzetelności (brak fałszywych obietnic)**: Operator nie gwarantuje 100% bezawaryjności działania systemów teleinformatycznych ani bezbłędności działania zewnętrznych rejestrów publicznych.
   c) Operator nie ponosi odpowiedzialności za przerwy lub ograniczenia w działaniu Serwisu spowodowane:
      - działaniem siły wyższej (np. klęski żywiołowe, pożary, działania wojenne),
      - awariami lub opóźnieniami leżącymi po stronie zewnętrznych dostawców usług telekomunikacyjnych lub sieci energetycznych,
      - awariami, przerwami technicznymi lub zmianami w API zewnętrznych organów państwowych (w szczególności bramek Krajowego Systemu e-Faktur Ministerstwa Finansów, bazy REGON Głównego Urzędu Statystycznego czy Narodowego Banku Polskiego),
      - nieprawidłowym korzystaniem z Serwisu przez Użytkownika lub ujawnieniem hasła osobom trzecim z winy Użytkownika.
   d) W relacjach z Klientami niebędącymi Konsumentami ani Przedsiębiorcami na prawach konsumenta (czyste B2B):
      - odpowiedzialność Operatora z tytułu niewykonania lub nienależytego wykonania umowy jest ograniczona do rzeczywistej szkody (z wyłączeniem utraconych korzyści — *lucrum cessans*),
      - łączna odpowiedzialność Operatora wobec Klienta B2B ograniczona jest do kwoty opłat uiszczonych przez Klienta w okresie ostatnich 12 miesięcy (a w przypadku usług bezpłatnych — do kwoty 500 PLN).
   e) Powyższe ograniczenia odpowiedzialności nie mają zastosowania do szkód wyrządzonych umyślnie oraz do roszczeń Konsumentów i Przedsiębiorców na prawach konsumenta w zakresie, w jakim bezwzględnie obowiązujące przepisy prawa nie zezwalają na ograniczenie odpowiedzialności.`,
    },
    {
      title: "§ 7. Prace konserwacyjne i wsparcie techniczne",
      content: `1. Operator ma prawo do przeprowadzania planowanych prac konserwacyjnych, modernizacyjnych i aktualizacji Serwisu.
2. Operator dokłada starań, aby planowane prace konserwacyjne skutkujące niedostępnością Serwisu były przeprowadzane w godzinach najmniejszego natężenia ruchu (w godzinach nocnych lub w dni ustawowo wolne od pracy).
3. O planowanych przerwach trwających dłużej niż 2 godziny Operator informuje Użytkowników z wyprzedzeniem za pośrednictwem komunikatu w Serwisie lub drogą e-mail.
4. Wsparcie techniczne świadczone jest drogą elektroniczną pod adresem ${OPERATOR_CONFIG.emailSupport} w dni robocze.`,
    },
    {
      title: "§ 8. Reklamacje",
      content: `1. Użytkownik ma prawo do złożenia reklamacji dotyczącej działania Serwisu.
2. Reklamację można złożyć drogą elektroniczną na adres e-mail: ${OPERATOR_CONFIG.emailComplaints}.
3. Zgłoszenie reklamacyjne powinno zawierać:
   a) adres e-mail przypisany do Konta Użytkownika,
   b) szczegółowy opis nieprawidłowości oraz datę jej wystąpienia,
   c) oczekiwany sposób rozstrzygnięcia.
4. Operator rozpatruje reklamację bez zbędnej zwłoki, nie później niż w terminie 14 dni od dnia jej otrzymania.
5. W przypadku Konsumentów oraz Przedsiębiorców na prawach konsumenta, brak odpowiedzi na reklamację w terminie 14 dni oznacza jej uznanie.
6. Odpowiedź na reklamację wysyłana jest na adres e-mail, z którego nadesłano zgłoszenie.`,
    },
    {
      title: "§ 9. Konsumenci i Przedsiębiorcy na prawach konsumenta (Odstąpienie od umowy)",
      content: `1. Postanowienia niniejszego paragrafu stosuje się wyłącznie do Użytkowników będących Konsumentami lub Przedsiębiorcami na prawach konsumenta (PNPK).
2. Zgodnie z art. 27 ustawy o prawach konsumenta, Użytkownikowi przysługuje prawo do odstąpienia od umowy zawartej na odległość bez podawania przyczyny w terminie 14 dni od dnia jej zawarcia.
3. W celu skorzystania z prawa do odstąpienia, Użytkownik składa Operatorowi jednoznaczne oświadczenie (np. wysyłając e-mail na adres ${OPERATOR_CONFIG.emailContact}). Użytkownik może skorzystać z ustawowego wzoru formularza odstąpienia od umowy, jednak nie jest to obowiązkowe.
4. Do zachowania terminu wystarczy wysłanie oświadczenia przed jego upływem.
5. W przypadku usług bezpłatnych odstąpienie od umowy jest tożsame z żądaniem usunięcia Konta.
6. Jeżeli w przypadku usług płatnych Użytkownik zażądał rozpoczęcia świadczenia usługi przed upływem 14-dniowego terminu do odstąpienia od umowy i przyjął do wiadomości utratę prawa odstąpienia z chwilą pełnego wykonania usługi (art. 38 pkt 1 lub pkt 13 ustawy o prawach konsumenta), prawo odstąpienia wygasa z tą chwilą. Operator nie stosuje klauzul automatycznego zrzeczenia się praw bez wyraźnej, uprzedniej zgody Użytkownika.`,
    },
    {
      title: "§ 10. Zawieszenie i usunięcie Konta",
      content: `1. Użytkownik może w dowolnym momencie, bez podania przyczyn i bez ponoszenia kosztów, rozwiązać umowę i usunąć swoje Konto z poziomu panelu Ustawień Konta (\`Ustawienia → Bezpieczeństwo i Sesje → Usuń konto\`).
2. Przed usunięciem Konta Użytkownik ma możliwość pobrania archiwum wszystkich wystawionych dokumentów (paczka ZIP, pliki XML, zestawienia CSV).
3. Operator ma prawo zawiesić dostęp do Konta lub rozwiązać umowę z Użytkownikiem z zachowaniem 14-dniowego okresu wypowiedzenia z ważnych przyczyn, takich jak:
   a) rażące naruszenie postanowień Regulaminu lub powszechnie obowiązujących przepisów prawa,
   b) wykorzystywanie Serwisu do dystrybucji złośliwego oprogramowania, spamu lub prowadzenia działalności przestępczej,
   c) podejmowanie działań zagrażających bezpieczeństwu infrastruktury teleinformatycznej lub integralności danych innych Użytkowników.
4. W przypadkach niecierpiących zwłoki (np. aktywny atak na Serwis) Operator ma prawo natychmiast zablokować dostęp do Konta, powiadamiając Użytkownika drogą e-mail wraz z uzasadnieniem i informacją o procedurze odwoławczej.
5. Użytkownik ma prawo złożyć odwołanie od decyzji o zawieszeniu na adres ${OPERATOR_CONFIG.emailComplaints}. Odwołanie jest rozpatrywane w terminie 7 dni roboczych.`,
    },
    {
      title: "§ 11. Zmiany Regulaminu",
      content: `1. Operator może zmienić niniejszy Regulamin wyłącznie z ważnych przyczyn prawnych lub technicznych, takich jak:
   a) zmiana przepisów prawa mających bezpośredni wpływ na treść Regulaminu lub świadczone Usługi,
   b) wydanie orzeczenia sądu lub decyzji organu administracji państwowej nakazującej modyfikację określonych postanowień,
   c) wdrożenie nowych funkcji technicznych, integracji lub modyfikacja istniejących funkcjonalności,
   d) zmiana warunków technicznych lub organizacyjnych świadczenia Usług (np. zmiana dostawców infrastruktury chmurowej).
2. O każdej planowanej zmianie Regulaminu Użytkownicy posiadający Konto zostaną powiadomieni z co najmniej 14-dniowym wyprzedzeniem za pośrednictwem poczty elektronicznej oraz komunikatu wewnątrz Aplikacji.
3. Użytkownik, który nie akceptuje proponowanych zmian, ma prawo wypowiedzieć umowę i usunąć Konto przed wejściem w życie nowego Regulaminu.
4. Korzystanie z Serwisu po wejściu w życie zmian i ich formalnym zatwierdzeniu oznacza kontynuację korzystania na nowych warunkach.`,
    },
    {
      title: "§ 12. Postanowienia końcowe",
      content: `1. Prawem właściwym dla umów zawieranych na podstawie niniejszego Regulaminu jest prawo Rzeczypospolitej Polskiej.
2. W sprawach nieuregulowanych w Regulaminie zastosowanie mają przepisy Kodeksu cywilnego, ustawy o świadczeniu usług drogą elektroniczną, ustawy o prawach konsumenta, ustawy o podatku od towarów i usług oraz RODO.
3. Spory powstałe pomiędzy Operatorem a Klientem niebędącym Konsumentem ani Przedsiębiorcą na prawach konsumenta podlegają rozstrzygnięciu przez sąd powszechny właściwy miejscowo dla siedziby Operatora.
4. W przypadku Konsumentów i Przedsiębiorców na prawach konsumenta spory rozstrzygane są przez właściwy sąd powszechny zgodnie z przepisami Kodeksu postępowania cywilnego. Konsument ma także możliwość skorzystania z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia roszczeń (np. za pośrednictwem platformy ODR pod adresem http://ec.europa.eu/consumers/odr).
5. Regulamin wchodzi w życie z dniem ${EFFECTIVE_DATE}.`,
    },
  ],
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 2. POLITYKA PRYWATNOŚCI I OCHRONY DANYCH OSOBOWYCH
 * ───────────────────────────────────────────────────────────────────────────── */
export const PRIVACY_POLICY: LegalDocument = {
  id: "privacy-policy",
  slug: "polityka-prywatnosci",
  title: "Polityka Prywatności i Ochrony Danych Osobowych",
  shortTitle: "Polityka Prywatności",
  version: LEGAL_VERSIONS.privacy,
  effectiveDate: EFFECTIVE_DATE,
  description: "Zasady przetwarzania danych osobowych w serwisie FakturaProsto, prawa przysługujące osobom, których dane dotyczą, okresy retencji, transfery danych i środki bezpieczeństwa.",
  sections: [
    {
      title: "1. Kto jest kim? Role Administratora i Podmiotu Przetwarzającego",
      content: `Dla pełnej przejrzystości wskazujemy, w jakich rolach występujemy w odniesieniu do poszczególnych kategorii danych:

1. **Operator jako Administrator Danych Osobowych (ADO)**:
   Jesteśmy Administratorem w odniesieniu do danych osób rejestrujących Konto w Serwisie, danych Użytkowników, osób kontaktujących się z nami, danych rozliczeniowych i podatkowych związanych z prowadzeniem Konta oraz danych telemetrycznych/bezpieczeństwa (logi serwera, stemplowanie zgód).
   Dane Administratora:
   ${OPERATOR_CONFIG.companyName}, ${OPERATOR_CONFIG.addressStreet}, ${OPERATOR_CONFIG.addressPostal} ${OPERATOR_CONFIG.addressCity}, NIP: ${OPERATOR_CONFIG.nip}.
   Kontakt w sprawach prywatności: ${OPERATOR_CONFIG.emailPrivacy}.

2. **Operator jako Podmiot Przetwarzający (Procesor)**:
   W odniesieniu do danych osobowych kontrahentów, nabywców, dostawców i innych osób trzecich wprowadzanych przez Klienta do wystawianych faktur, dokumentów i bazy kontrahentów w Serwisie — **to Klient jest Administratorem Danych**, a my przetwarzamy te dane wyłącznie na zlecenie Klienta na podstawie **Umowy Powierzenia Przetwarzania Danych Osobowych (DPA)** zgodnie z art. 28 RODO. Warunki powierzenia są publicznie dostępne pod adresem ${OPERATOR_CONFIG.serviceUrl}/powierzenie-danych.`,
    },
    {
      title: "2. Cele i podstawy prawne przetwarzania danych przez Administratora",
      content: `Przetwarzamy dane osobowe Użytkowników wyłącznie w uzasadnionych celach i w oparciu o właściwe podstawy prawne z art. 6 ust. 1 RODO:

| Cel przetwarzania | Zakres danych | Podstawa prawna z RODO |
|---|---|---|
| **Rejestracja i obsługa Konta** | E-mail, imię i nazwisko, hash hasła, nazwa firmy, NIP, adres siedziby, rola w zespole | Art. 6 ust. 1 lit. b RODO (niezbędność do wykonania umowy) |
| **Świadczenie Usług fakturowania i integracji** | Dane wprowadzone do profilu, historia wystawionych faktur, identyfikatory KSeF | Art. 6 ust. 1 lit. b RODO (realizacja umowy) |
| **Obsługa zgłoszeń, reklamacji i kontaktu** | Adres e-mail, treść korespondencji, dane identyfikacyjne zgłaszającego | Art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes Administratora) lub lit. c (obowiązek rozpatrzenia reklamacji) |
| **Wypełnienie obowiązków prawnych i podatkowych** | Dane rozliczeniowe, ewidencja księgowa, faktury za usługi (w razie płatności) | Art. 6 ust. 1 lit. c RODO w zw. z ustawą o VAT i ustawą o rachunkowości |
| **Zapewnienie bezpieczeństwa teleinformatycznego i audyt** | Zanonimizowany adres IP, identyfikator sesji, znaczniki czasu operacji (Audit Log) | Art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes — ochrona przed atakami i rozliczalność) |
| **Utrwalenie akceptacji regulaminu i zgód** | Wersja dokumentu, czas serwera, identyfikator użytkownika, status zgody | Art. 6 ust. 1 lit. c RODO w zw. z art. 5 ust. 2 RODO (zasada rozliczalności) |
| **Komunikacja marketingowa (newsletter / nowości)** | Adres e-mail | Art. 6 ust. 1 lit. a RODO (dobrowolna zgoda — wyłącznie po zaznaczeniu opcjonalnego pola) |`,
    },
    {
      title: "3. Zróżnicowane okresy przechowywania danych (Retencja)",
      content: `Nie stosujemy jednego, ogólnego okresu retencji dla wszystkich danych. Okresy przechowywania wynikają z charakteru danych i wymogów prawnych:

1. **Dane Konta Użytkownika**: Przechowywane przez czas trwania umowy (posiadania aktywnego Konta), a po jej rozwiązaniu — przez okres przedawnienia ewentualnych roszczeń cywilnoprawnych (zgodnie z art. 118 Kodeksu cywilnego — standardowo 3 lata dla roszczeń związanych z prowadzeniem działalności gospodarczej).
2. **Faktury i dokumentacja księgowa**: Zgodnie z art. 112a ustawy o podatku od towarów i usług oraz przepisami Ordynacji podatkowej, dokumenty księgowe przechowywane są przez okres 5 lat, licząc od końca roku kalendarzowego, w którym upłynął termin płatności podatku.
3. **Dziennik audytu dokumentów (Audit Log) i logi bezpieczeństwa**: Przechowywane przez okres od 12 do 24 miesięcy od daty zdarzenia na potrzeby zapewnienia integralności i bezpieczeństwa systemu.
4. **Rejestr zgód prawnych i akceptacji regulaminu**: Przechowywany przez czas posiadania Konta oraz do 5 lat po jego usunięciu na potrzeby wykazania spełnienia obowiązków prawnych (rozliczalność wg art. 5 ust. 2 RODO).
5. **Kopie zapasowe (backupy bazy danych)**: Tworzone w cyklu automatycznym i nadpisywane cyklicznie w horyzoncie czasowym do 30-60 dni w zależności od procedury klastra chmurowego.
6. **Wycofanie zgody marketingowej**: Dane przetwarzane na podstawie zgody są usuwane lub zaprzestajemy ich przetwarzania w tym celu niezwłocznie po wycofaniu zgody.`,
    },
    {
      title: "4. Odbiorcy danych i podwykonawcy (Podprocesorzy)",
      content: `1. Dane osobowe mogą być przekazywane podmiotom trzecim współpracującym z nami wyłącznie w zakresie niezbędnym do realizacji Usługi:
   a) **Dostawca bazy danych w chmurze**: MongoDB Inc. (usługa MongoDB Atlas) — przechowywanie zaszyfrowanych danych w chmurze.
   b) **Dostawcy hostingu i infrastruktury serwerowej**: cyber_Folks S.A. (serwery w Polsce) oraz Netlify Inc. (serwery aplikacyjne i routing sieciowy).
   c) **Dostawca wysyłki poczty elektronicznej**: Resend Inc. lub operator własnego serwera pocztowego SMTP — doręczanie powiadomień i faktur PDF.
2. Pełny, stale aktualizowany wykaz podwykonawców wraz z lokalizacją danych i mechanizmami prawnymi dostępny jest pod adresem ${OPERATOR_CONFIG.serviceUrl}/podwykonawcy.
3. Ponadto dane mogą być przekazywane uprawnionym organom państwowym (np. Urzędy Skarbowe, sądy, organy ścigania) wyłącznie na podstawie wyraźnego i wiążącego żądania opartego o właściwe przepisy prawa.
4. Integracje z systemami publicznymi:
   - W przypadku wysyłki faktury do **Krajowego Systemu e-Faktur (KSeF)**, dane faktury przekazywane są do serwerów Ministerstwa Finansów, które staje się odrębnym publicznym administratorem danych.
   - W przypadku wyszukiwania kontrahenta po numerze NIP, zapytanie kierowane jest do bazy **GUS REGON (Główny Urząd Statystyczny)**.`,
    },
    {
      title: "5. Transfery danych poza Europejski Obszar Gospodarczy (EOG)",
      content: `1. Część naszych dostawców technologicznych posiada siedzibę lub infrastrukturę poza terytorium EOG (w szczególności w Stanach Zjednoczonych Ameryki):
   - **MongoDB Inc.** (USA),
   - **Netlify Inc.** (USA),
   - **Resend Inc.** (USA).
2. **Rzetelność informacji**: Nie twierdzimy fałszywie, że dane nigdy nie opuszczają terytorium EOG. Zapewniamy jednak, że transfer danych do tych podmiotów odbywa się wyłącznie w oparciu o prawnie wiążące i zatwierdzone mechanizmy ochronne zgodne z Rozdziałem V RODO:
   a) **Decyzja wykonawcza Komisji Europejskiej z dnia 10 lipca 2023 r.** stwierdzająca odpowiedni stopień ochrony danych w ramach ram ochrony danych UE-USA (*EU-US Data Privacy Framework* — DPF), do których certyfikowani są nasi partnerzy technologiczni,
   b) **Standardowe Klauzule Umowne (SCC)** przyjęte przez Komisję Europejską na mocy decyzji wykonawczej (UE) 2021/914, zawarte w umowach powierzenia z dostawcami.
3. Transmisja danych jest szyfrowana w tranzycie (TLS 1.2 / TLS 1.3) oraz w spoczynku (*encryption at rest* - AES-256 w MongoDB Atlas).`,
    },
    {
      title: "6. Prawa osób, których dane dotyczą",
      content: `Każdej osobie, której dane przetwarzamy jako Administrator, przysługują następujące prawa wynikające z art. 15–22 RODO:
1. **Prawo dostępu do danych (art. 15 RODO)** — prawo do uzyskania potwierdzenia, czy przetwarzamy dane, oraz otrzymania ich kopii.
2. **Prawo do sprostowania danych (art. 16 RODO)** — prawo do żądania poprawienia nieprawidłowych lub uzupełnienia niekompletnych danych (Użytkownik może samodzielnie edytować większość danych w Ustawieniach Konta).
3. **Prawo do usunięcia danych („prawo do bycia zapomnianym”, art. 17 RODO)** — prawo do żądania usunięcia danych w przypadkach określonych w RODO. *Zastrzeżenie prawne*: Prawo to nie przysługuje w zakresie, w jakim przetwarzanie jest niezbędne do wywiązania się z prawnego obowiązku podatkowo-rachunkowego (np. obowiązkowe przechowywanie wystawionych faktur przez 5 lat na mocy ustawy o VAT) lub do ustalenia, dochodzenia lub obrony roszczeń.
4. **Prawo do ograniczenia przetwarzania (art. 18 RODO)**.
5. **Prawo do przenoszenia danych (art. 20 RODO)** — prawo do otrzymania swoich danych w ustrukturyzowanym, powszechnie używanym formacie nadającym się do odczytu maszynowego (JSON) lub żądania ich przesłania innemu administratorowi. Udostępniamy narzędzie bezpośredniego pobrania kopii danych w zakładce \`Ustawienia → Prywatność i zgody\`.
6. **Prawo do sprzeciwu (art. 21 RODO)** — wobec przetwarzania opartego na prawnie uzasadnionym interesie Administratora.
7. **Prawo do wycofania zgody w dowolnym momencie** — w odniesieniu do przetwarzania opartego na zgodzie (np. marketing e-mail, opcjonalne pliki cookies), bez wpływu na zgodność z prawem przetwarzania dokonanego przed jej wycofaniem.
8. **Prawo do wniesienia skargi do organu nadzorczego**:
   Każda osoba ma prawo wnieść skargę do organu nadzorczego zajmującego się ochroną danych osobowych w Polsce:
   **Prezes Urzędu Ochrony Danych Osobowych (PUODO)**
   ul. Stawki 2, 00-193 Warszawa
   www.uodo.gov.pl

W celu realizacji swoich praw prosimy o kontakt pod adresem: ${OPERATOR_CONFIG.emailPrivacy}. Wnioski rozpatrywane są bez zbędnej zwłoki, nie później niż w terminie miesiąca.`,
    },
    {
      title: "7. Profilowanie, AI i zautomatyzowane podejmowanie decyzji",
      content: `1. W Serwisie **nie podejmujemy decyzji wywołujących skutki prawne wobec osób w sposób w 100% zautomatyzowany** w rozumieniu art. 22 RODO.
2. **Kategoryczna zasada dotycząca Sztucznej Inteligencji (AI)**:
   Serwis nie wykorzystuje danych wprowadzanych przez Użytkowników na faktury do trenowania zewnętrznych ani wewnętrznych modeli sztucznej inteligencji (LLM), ani nie przekazuje ich dostawcom technologii AI bez uprzedniej, odrębnej zgody i oceny prawnej.
3. Dane Użytkowników nie są wykorzystywane do budowania profili behawioralnych na potrzeby zewnętrznych sieci reklamowych.`,
    },
    {
      title: "8. Środki bezpieczeństwa danych",
      content: `Wdrażamy adekwatne środki techniczne i organizacyjne zgodnie z art. 32 RODO:
- haszowanie haseł algorytmem bcrypt (12 rund soli) z zabezpieczeniem przed atakami typu brute-force,
- szyfrowanie całej komunikacji sieciowej protokołem TLS z certyfikatem SSL,
- izolacja danych na poziomie zapytań bazodanowych (każde zapytanie filtruje po identyfikatorze firmy i użytkownika),
- weryfikacja uprawnień i ról (RBAC) po stronie serwera przy każdym wywołaniu API,
- trwały dziennik audytu rejestrujący tożsamość autora modyfikacji oraz porównanie starych i nowych wartości (Field Diff),
- maskowanie sekretów (hasła, tokeny KSeF, klucze sesji) w logach systemowych,
- zabezpieczenie przed współbieżnym nadpisaniem danych (Optimistic Concurrency Control — OCC).`,
    },
  ],
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 3. POLITYKA PLIKÓW COOKIES I PAMIĘCI PRZEGLĄDARKI
 * ───────────────────────────────────────────────────────────────────────────── */
export const COOKIE_POLICY: LegalDocument = {
  id: "cookie-policy",
  slug: "polityka-cookies",
  title: "Polityka Plików Cookies i Pamięci Przeglądarki",
  shortTitle: "Polityka Cookies",
  version: LEGAL_VERSIONS.cookies,
  effectiveDate: EFFECTIVE_DATE,
  description: "Zasady wykorzystywania plików cookies, pamięci LocalStorage, kategorie technologii, podstawa prawna z art. 399 Prawa komunikacji elektronicznej oraz instrukcja zarządzania preferencjami.",
  sections: [
    {
      title: "1. Czym są pliki cookies i technologie pamięci lokalnej?",
      content: `1. Pliki cookies (tzw. „ciasteczka”) to małe pliki tekstowe zapisywane i przechowywane w telekomunikacyjnym urządzeniu końcowym Użytkownika (komputerze, telefonie, tablecie) podczas odwiedzania Serwisu.
2. Oprócz plików cookies Serwis może wykorzystywać technologię **LocalStorage** (pamięć lokalną przeglądarki), która umożliwia przechowywanie danych bezpośrednio w przeglądarce bez ich automatycznego przesyłania w nagłówkach każdego żądania HTTP.
3. Pliki cookies dzielą się na:
   - **sesyjne**: pliki tymczasowe, usuwane po zakończeniu sesji przeglądarki lub wylogowaniu,
   - **trwałe**: przechowywane w urządzeniu przez określony czas wskazany w ich parametrach lub do momentu ich usunięcia przez Użytkownika.`,
    },
    {
      title: "2. Podstawa prawna i zasady uzyskiwania zgody (Prawo komunikacji elektronicznej)",
      content: `1. Zgodnie z **art. 399 ustawy z dnia 12 lipca 2024 r. — Prawo komunikacji elektronicznej** (Dz.U. 2024 poz. 1221) oraz przepisami RODO:
   a) **Technologie niezbędne (techniczne)**: Instalowanie i odczytywanie plików cookies technicznie niezbędnych do świadczenia usługi drogą elektroniczną wyraźnie zażądanej przez Użytkownika (np. utrzymanie zalogowania, bezpieczeństwo, zapamiętanie wyboru zgód) **nie wymaga uprzedniej zgody** Użytkownika (art. 399 ust. 3 PKE).
   b) **Technologie opcjonalne (funkcjonalne, analityczne, marketingowe)**: Wszelkie inne technologie wymagają uzyskania **dobrowolnej, świadomej i jednoznacznej zgody** Użytkownika przed ich zainstalowaniem w urządzeniu końcowym.
2. Serwis stosuje platformę zarządzania zgodami (Consent Management Platform — CMP) w formie banera wyświetlanego przy pierwszej wizycie, który:
   - prezentuje 3 równorzędne opcje: **„Akceptuj wszystkie”**, **„Odrzuć opcjonalne”** oraz **„Ustawienia”**,
   - domyślnie odznacza kategorie opcjonalne,
   - **nie traktuje przewijania strony, kliknięcia w tło ani zamknięcia banera jako wyrażenia zgody**.
3. Brak zgody na technologie opcjonalne nie uniemożliwia korzystania z podstawowych funkcji Serwisu.`,
    },
    {
      title: "3. Tabela stosowanych technologii w Serwisie",
      content: `Poniższa tabela przedstawia szczegółowy inwentarz technologii stosowanych w domenie ${OPERATOR_CONFIG.serviceUrl}:

| Nazwa pliku / klucza | Typ | Kategoria | Cel i funkcja | Czas życia |
|---|---|---|---|---|
| **auth_session** / **fakturaprosto_session** / **fakturo_session** | Cookie (HttpOnly, Secure) | Niezbędne | Utrzymanie aktywnej sesji zalogowanego Użytkownika, zabezpieczenie przed atakami CSRF. | 30 dni lub do wylogowania |
| **__Secure-next-auth.session-token** | Cookie (HttpOnly, Secure) | Niezbędne | Bezpieczny token sesyjny frameworka NextAuth. | 30 dni |
| **fakturaprosto_consent** / **fakturo_consent** | Cookie | Niezbędne | Zapamiętanie decyzji Użytkownika w przedmiocie zgód na pliki cookies (CMP). | 12 miesięcy |
| **fakturaprosto-theme** / **fakturo-theme** | LocalStorage | Niezbędne | Zapamiętanie wybranego trybu graficznego (ciemny / jasny) w celu uniknięcia migotania ekranu. | Trwałe (do wyczyszczenia) |
| **pref_currency / pref_payment_terms** | LocalStorage | Funkcjonalne (opcjonalne) | Zapamiętanie preferowanych domyślnych ustawień wystawiania faktur (np. waluta EUR, termin 14 dni). | Trwałe |

*Aktualny stan*: W Serwisie nie są wdrożone żadne zewnętrzne piksele śledzące (np. Meta Pixel) ani skrypty analityczne stron trzecich przesyłające dane poza infrastrukturę Operatora.`,
    },
    {
      title: "4. Zarządzanie zgodami i wycofanie zgody",
      content: `1. Użytkownik ma prawo w dowolnym momencie zmienić swoje preferencje lub wycofać uprzednio wyrażoną zgodę na opcjonalne pliki cookies.
2. Wycofanie zgody jest równie łatwe jak jej udzielenie — w stopce każdej strony Serwisu oraz w Ustawieniach Konta znajduje się stały link **„Ustawienia prywatności / Cookies”**, który otwiera panel CMP.
3. W przypadku wycofania zgody Serwis natychmiast zaprzestaje korzystania z danej kategorii technologii i podejmuje próbę usunięcia odpowiednich identyfikatorów z przeglądarki.
4. Użytkownik może także zarządzać plikami cookies bezpośrednio w ustawieniach swojej przeglądarki internetowej:
   - **Google Chrome**: Ustawienia → Prywatność i bezpieczeństwo → Pliki cookie i inne dane witryn.
   - **Mozilla Firefox**: Opcje → Prywatność i bezpieczeństwo → Ciasteczka i dane witryn.
   - **Apple Safari**: Preferencje → Prywatność → Zarządzaj danymi witryn.
   - **Microsoft Edge**: Ustawienia → Pliki cookie i uprawnienia witryny.
5. Całkowite zablokowanie plików cookies niezbędnych w ustawieniach przeglądarki uniemożliwi zalogowanie się do Konta w Serwisie.`,
    },
  ],
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 4. UMOWA POWIERZENIA PRZETWARZANIA DANYCH OSOBOWYCH (DPA)
 * ───────────────────────────────────────────────────────────────────────────── */
export const DPA_AGREEMENT: LegalDocument = {
  id: "dpa-agreement",
  slug: "powierzenie-danych",
  title: "Umowa Powierzenia Przetwarzania Danych Osobowych (DPA)",
  shortTitle: "Umowa Powierzenia (DPA)",
  version: LEGAL_VERSIONS.dpa,
  effectiveDate: EFFECTIVE_DATE,
  description: "Warunki powierzenia przetwarzania danych osobowych zgodnie z art. 28 RODO pomiędzy Klientem (Administratorem Danych) a Operatorem (Podmiotem Przetwarzającym).",
  sections: [
    {
      title: "§ 1. Przedmiot i charakter umowy",
      content: `1. Niniejsza Umowa Powierzenia Przetwarzania Danych Osobowych (dalej: „Umowa DPA”) zostaje zawarta na podstawie art. 28 Rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO) pomiędzy:
   a) **Klientem** korzystającym z konta firmowego w Serwisie FakturaProsto — występującym w roli **Administratora Danych Osobowych** (dalej: „Administrator”), a
   b) **Operatorem**: ${OPERATOR_CONFIG.companyName}, NIP: ${OPERATOR_CONFIG.nip} — występującym w roli **Podmiotu Przetwarzającego** (dalej: „Podmiot Przetwarzający”).
2. Zawarcie Umowy DPA następuje z chwilą akceptacji Regulaminu Serwisu przez osobę upoważnioną do reprezentacji Klienta i utworzenia Konta firmowego. Umowa DPA stanowi integralną część umowy o świadczenie usług.
3. Przedmiotem niniejszej Umowy jest powierzenie Podmiotowi Przetwarzającemu przetwarzania danych osobowych wprowadzanych przez Administratora do Serwisu w celu i w zakresie niezbędnym do świadczenia Usług fakturowania, ewidencji, integracji z KSeF i obsługi dokumentów.`,
    },
    {
      title: "§ 2. Charakter, cel i zakres przetwarzania danych",
      content: `1. **Charakter przetwarzania**: Zautomatyzowane przetwarzanie danych osobowych w systemach teleinformatycznych SaaS (przechowywanie, rejestrowanie, modyfikowanie, generowanie plików PDF i XML, przesyłanie do KSeF, usuwanie).
2. **Cel przetwarzania**: Świadczenie usługi oprogramowania do wystawiania i ewidencjonowania faktur, zarządzania bazą kontrahentów, rozliczania transakcji walutowych, transmisji danych do KSeF oraz archiwizacji dokumentacji na zlecenie Administratora.
3. **Kategorie osób, których dane dotyczą**:
   a) kontrahenci Administratora będący osobami fizycznymi (w tym prowadzący jednoosobową działalność gospodarczą),
   b) przedstawiciele, pracownicy, pełnomocnicy oraz osoby kontaktowe kontrahentów Administratora,
   c) pracownicy i współpracownicy Administratora upoważnieni do korzystania z Konta.
4. **Rodzaje powierzanych danych osobowych**:
   - dane identyfikacyjne: imię i nazwisko, firma/nazwa działalności, numer NIP, REGON, PESEL (jeśli występuje), zagraniczny numer identyfikacji podatkowej (VAT UE, TIN),
   - dane adresowe: adres siedziby, adres korespondencyjny, adres miejsca dostawy towaru/usługi,
   - dane kontaktowe: adres e-mail, numer telefonu,
   - dane finansowe: numer rachunku bankowego (IBAN, SWIFT), kwoty transakcji, pozycje na fakturze, historia płatności.
5. **Czas trwania przetwarzania**: Przez czas obowiązywania umowy o świadczenie usług w Serwisie, z zastrzeżeniem § 7 niniejszej Umowy.`,
    },
    {
      title: "§ 3. Obowiązki i oświadczenia Administratora",
      content: `1. Administrator oświadcza, że:
   a) jest administratorem powierzanych danych osobowych lub posiada inną skuteczną podstawę prawną do ich powierzenia Podmiotowi Przetwarzającemu,
   b) pozyskał dane zgodnie z prawem i spełnił wobec osób, których dane dotyczą, wymagane obowiązki informacyjne z art. 13 lub 14 RODO.
2. Administrator ponosi wyłączną odpowiedzialność za treść, legalność oraz merytoryczną poprawność danych wprowadzanych do Serwisu.
3. Za udokumentowane polecenie Administratora uznaje się wszelkie dyspozycje składane za pośrednictwem interfejsu Aplikacji (w tym zapisanie faktury, wysyłka e-mailem, przekazanie do KSeF, pobranie eksportu lub usunięcie rekordu).`,
    },
    {
      title: "§ 4. Obowiązki Podmiotu Przetwarzającego",
      content: `Podmiot Przetwarzający zobowiązuje się do:
1. Przetwarzania danych osobowych wyłącznie na udokumentowane polecenie Administratora, chyba że obowiązek taki nakłada na niego prawo Unii Europejskiej lub prawo Rzeczypospolitej Polskiej.
2. Zapewnienia, by osoby upoważnione do przetwarzania danych osobowych (pracownicy, współpracownicy) zobowiązały się do zachowania tajemnicy lub podlegały odpowiedniemu ustawowemu obowiązkowi zachowania tajemnicy.
3. Wdrożenia odpowiednich środków technicznych i organizacyjnych zapewniających stopień bezpieczeństwa odpowiadający ryzyku naruszenia praw lub wolności osób fizycznych, zgodnie z art. 32 RODO (w tym szyfrowanie TLS, separacja danych firm, kontrola dostępu, dziennik audytu).
4. Pomagania Administratorowi poprzez odpowiednie środki techniczne i organizacyjne w wywiązywaniu się z obowiązku odpowiadania na żądania osób wykonujących swoje prawa określone w Rozdziale III RODO (dostęp, sprostowanie, usunięcie, przenoszenie). Serwis zapewnia narzędzia umożliwiające Administratorowi samodzielną realizację większości tych praw bezpośrednio w Aplikacji.
5. Pomagania Administratorowi w wywiązywaniu się z obowiązków określonych w art. 32–36 RODO (bezpieczeństwo, zgłaszanie naruszeń, ocena skutków dla ochrony danych).
6. **Zgłaszania naruszeń ochrony danych**: W przypadku stwierdzenia incydentu bezpieczeństwa skutkującego przypadkowym lub niezgodnym z prawem zniszczeniem, utratą, zmodyfikowaniem, nieuprawnionym ujawnieniem lub dostępem do powierzonych danych osobowych, Podmiot Przetwarzający zgłasza ten fakt Administratorowi bez zbędnej zwłoki, **nie później niż w ciągu 48 godzin od powzięcia wiedzy o naruszeniu**.
7. Udostępnienia Administratorowi wszelkich informacji niezbędnych do wykazania spełnienia obowiązków określonych w art. 28 RODO oraz umożliwienia Administratorowi lub audytorowi upoważnionemu przez Administratora przeprowadzania audytów lub inspekcji, na zasadach uzgodnionych przez Strony z co najmniej 14-dniowym wyprzedzeniem.`,
    },
    {
      title: "§ 5. Dalsze powierzenie przetwarzania (Podprocesorzy)",
      content: `1. Administrator wyraża ogólną pisemną zgodę na korzystanie przez Podmiot Przetwarzający z usług innych podmiotów przetwarzających (podwykonawców / podprocesorów).
2. Aktualna lista zaakceptowanych podprocesorów jest stale publicznie dostępna pod adresem ${OPERATOR_CONFIG.serviceUrl}/podwykonawcy i obejmuje:
   - MongoDB Inc. (baza danych),
   - cyber_Folks S.A. oraz Netlify Inc. (hosting i infrastruktura),
   - Resend Inc. (wysyłka poczty elektronicznej).
3. Podmiot Przetwarzający informuje Administratora o wszelkich zamierzonych zmianach dotyczących dodania lub zastąpienia innych podmiotów przetwarzających z co najmniej 14-dniowym wyprzedzeniem (poprzez powiadomienie e-mail lub publikację w Serwisie), dając tym samym Administratorowi możliwość wyrażenia sprzeciwu.
4. Podmiot Przetwarzający nakłada na każdego dalszego podprocesora te same obowiązki ochrony danych, jakie zostały nałożone na niego w niniejszej Umowie DPA. W przypadku niewywiązania się dalszego podprocesora z obowiązków ochrony danych, Podmiot Przetwarzający ponosi pełną odpowiedzialność wobec Administratora za wypełnienie obowiązków przez tego podprocesora w granicach określonych w Regulaminie.`,
    },
    {
      title: "§ 6. Zakaz wykorzystywania danych do celów własnych i AI",
      content: `1. Podmiot Przetwarzający zobowiązuje się, że powierzone dane osobowe:
   a) nie będą wykorzystywane do celów własnych Podmiotu Przetwarzającego (w szczególności marketingowych, reklamowych czy profilowania),
   b) **nie będą wykorzystywane do trenowania modeli sztucznej inteligencji (AI/LLM)**,
   c) nie będą sprzedawane, wypożyczane ani udostępniane podmiotom nieuprawnionym.`,
    },
    {
      title: "§ 7. Zakończenie przetwarzania, usunięcie i zwrot danych",
      content: `1. Z chwilą rozwiązania umowy o świadczenie usług w Serwisie i usunięcia Konta przez Administratora, Podmiot Przetwarzający — zależnie od decyzji Administratora:
   a) umożliwia Administratorowi uprzednie pobranie pełnej kopii wszystkich danych w formacie zdatnym do odczytu maszynowego (ZIP, XML, CSV),
   b) trwale usuwa wszelkie powierzone dane osobowe ze środowiska produkcyjnego, chyba że prawo Unii Europejskiej lub prawo Rzeczypospolitej Polskiej nakazuje ich dalsze przechowywanie.
2. Z uwagi na specyfikę kopii zapasowych (backupów) dane usuwane są z kopii archiwalnych w miarę ich planowej cyklicznej rotacji i nadpisywania (do 60 dni).`,
    },
  ],
};

/* ─────────────────────────────────────────────────────────────────────────────
 * 5. WYKAZ PODWYKONAWCÓW (PODPROCESORÓW)
 * ───────────────────────────────────────────────────────────────────────────── */
export const SUBPROCESSORS_DOCUMENT: LegalDocument = {
  id: "subprocessors-list",
  slug: "podwykonawcy",
  title: "Wykaz Podwykonawców (Podprocesorów) i Dostawców Usług",
  shortTitle: "Podwykonawcy",
  version: LEGAL_VERSIONS.subprocessors,
  effectiveDate: EFFECTIVE_DATE,
  description: "Zestawienie podmiotów trzecich biorących udział w przetwarzaniu danych w infrastrukturze FakturaProsto, ich lokalizacja, rola i zabezpieczenia transferu.",
  sections: [
    {
      title: "1. Zasady doboru i nadzoru nad podwykonawcami",
      content: `Zgodnie z art. 28 ust. 2 i ust. 4 RODO oraz § 5 Umowy Powierzenia Przetwarzania Danych (DPA), publikujemy aktualny, pełny wykaz podmiotów trzecich, z których usług korzystamy w celu zapewnienia sprawnego i bezpiecznego działania platformy FakturaProsto (${OPERATOR_CONFIG.serviceUrl}).

Każdy z wymienionych podwykonawców został zweryfikowany pod kątem stosowania odpowiednich środków technicznych i organizacyjnych, a współpraca opiera się na wiążących umowach powierzenia danych (Data Processing Agreements — DPA) lub standardowych klauzulach umownych zatwierdzonych przez Komisję Europejską.`,
    },
    {
      title: "2. Rejestr zatwierdzonych podprocesorów",
      content: `Poniższa tabela zawiera podmioty przetwarzające powierzone dane osobowe na nasze udokumentowane zlecenie:

### 1. Baza danych w chmurze
- **Podmiot**: MongoDB Inc. (usługa MongoDB Atlas)
- **Siedziba**: Nowy Jork, Stany Zjednoczone (oddział w Irlandii: MongoDB Limited, Dublin)
- **Zakres powierzonych danych**: Wszystkie dane wprowadzane do bazy danych Serwisu (użytkownicy, firmy, kontrahenci, faktury, logi operacji).
- **Lokalizacja danych**: Region Unii Europejskiej (domyślnie klaster frankfurcki eu-central-1) / serwery w infrastrukturze AWS/GCP.
- **Podstawa transferu poza EOG**: Certyfikacja w ramach EU-US Data Privacy Framework (DPF) oraz Standardowe Klauzule Umowne (SCC).
- **Zabezpieczenia**: Szyfrowanie w spoczynku (AES-256), szyfrowanie w tranzycie (TLS), izolacja sieciowa VPC Peering.

---

### 2. Hosting aplikacji i serwery brzegowe
- **Podmiot A**: cyber_Folks S.A.
  - **Siedziba**: ul. Roosevelta 22, 60-829 Poznań, Polska
  - **Zakres**: Hosting aplikacji, środowisko uruchomieniowe Node.js, obsługa ruchu sieciowego w Polsce.
  - **Lokalizacja danych**: Centra danych na terytorium Rzeczypospolitej Polskiej (Poznań/Warszawa).
  - **Transfer poza EOG**: Nie występuje (dane przetwarzane w 100% w Polsce).
- **Podmiot B**: Netlify Inc.
  - **Siedziba**: San Francisco, Stany Zjednoczone
  - **Zakres**: Dostarczanie zasobów statycznych (CDN), serwery brzegowe (Edge routing), buforowanie.
  - **Lokalizacja danych**: Unia Europejska oraz globalna sieć CDN.
  - **Podstawa transferu poza EOG**: Standardowe Klauzule Umowne (SCC) oraz EU-US Data Privacy Framework (DPF).

---

### 3. Poczta transakcyjna (wysyłka faktur i powiadomień)
- **Podmiot**: Resend Inc. (lub dedykowana infrastruktura SMTP Operatora)
- **Siedziba**: San Francisco, Stany Zjednoczone
- **Zakres**: Przekazywanie wiadomości e-mail z fakturami w załączniku PDF, linków resetowania haseł i powiadomień.
- **Lokalizacja danych**: Region UE / USA.
- **Podstawa transferu poza EOG**: Standardowe Klauzule Umowne (SCC) oraz Data Privacy Framework.`,
    },
    {
      title: "3. Organy publiczne i rejestry państwowe (odrębni administratorzy)",
      content: `Wskazujemy, że poniższe instytucje i systemy **nie są naszymi podprocesorami**, lecz niezależnymi organami publicznymi działającymi na podstawie przepisów prawa, z którymi Aplikacja komunikuje się na polecenie Użytkownika:

1. **Ministerstwo Finansów — Krajowy System e-Faktur (KSeF)**:
   - System teleinformatyczny prowadzony przez Szefa Krajowej Administracji Skarbowej.
   - W przypadku wysyłki faktury do KSeF, plik XML FA(3) przekazywany jest bezpośrednio do infrastruktury Ministerstwa Finansów, która staje się odrębnym administratorem danych w rozumieniu przepisów podatkowych.
2. **Główny Urząd Statystyczny (GUS — Baza Internetowa REGON BIR 1.1)**:
   - Rejestr publiczny prowadzony przez Prezesa GUS. Zapytania po numerze NIP służą wyłącznie pobraniu jawnych danych rejestrowych podmiotu gospodarczego.
3. **Narodowy Bank Polski (NBP)**:
   - Publiczne API tabel kursów średnich walut NBP. W ramach integracji Serwis pobiera wyłącznie ogólnodostępne tabele kursowe (do NBP nie są przesyłane żadne dane osobowe ani dane o transakcjach).`,
    },
    {
      title: "4. Procedura informowania o zmianach i prawo sprzeciwu",
      content: `1. O zamiarze zaangażowania nowego podwykonawcy lub zastąpienia dotychczasowego Operator informuje Klientów z wyprzedzeniem co najmniej 14 dni kalendarzowych.
2. Informacja przekazywana jest drogą elektroniczną (e-mail) lub poprzez publikację powiadomienia w Aplikacji.
3. Klient ma prawo wnieść umotywowany sprzeciw wobec zaangażowania nowego podwykonawcy ze względów związanych z ochroną danych osobowych przed upływem terminu 14 dni.
4. W razie wniesienia uzasadnionego sprzeciwu Strony podejmują próbę polubownego rozwiązania problemu, a w braku porozumienia Klient ma prawo rozwiązać umowę ze skutkiem natychmiastowym i bez ponoszenia dodatkowych kosztów.`,
    },
  ],
};

export const ALL_LEGAL_DOCUMENTS: LegalDocument[] = [
  TERMS_OF_SERVICE,
  PRIVACY_POLICY,
  COOKIE_POLICY,
  DPA_AGREEMENT,
  SUBPROCESSORS_DOCUMENT,
];
