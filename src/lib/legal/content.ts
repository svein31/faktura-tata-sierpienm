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

import { OPERATOR_CONFIG, EFFECTIVE_DATE, LEGAL_VERSIONS, LEGAL_EFFECTIVE_DATES } from "./config";

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
  effectiveDate: LEGAL_EFFECTIVE_DATES.terms,
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
   c) rejestrowanie kontrahentów krajowych (weryfikacja w rejestrze GUS BIR 1.1) oraz zagranicznych (sprawdzenie formatu VAT UE, opcjonalne zapytanie do VIES na żądanie Użytkownika, TIN spoza UE),
   d) generowanie plików dokumentów w formacie PDF, ustrukturyzowanych XML FA(3) oraz eksportów zestawień faktur (CSV, JSON, XLSX),
   e) moduł pracy wieloużytkownikowej w ramach jednej firmy (zapraszanie członków zespołu, nadawanie ról: Właściciel, Księgowa, Pracownik, Podgląd),
   f) integracja z Krajowym Systemem e-Faktur (KSeF) — generowanie struktur FA(3), odbiór UPO i podgląd statusów (w trybie testowym lub produkcyjnym zgodnie z konfiguracją Użytkownika),
   g) rejestracja wpłat oraz trwały dziennik audytu operacji (Audit Log).
2. **Plany taryfowe i zasady odpłatności**:
   a) **Plan Free (Darmowy)**:
      - Umożliwia bezpłatne wystawienie do 5 faktur sprzedaży w każdym miesiącu kalendarzowym.
      - Limit jest wspólny dla firm należących do właściciela Konta i dotyczy wystawionych faktur sprzedaży; szkice i proformy nie wykorzystują tego limitu.
      - Korzystanie z Planu Free nie wymaga podawania danych karty płatniczej ani ponoszenia opłat.
      - KSeF po konfiguracji, dane GUS, PDF/XML, eksporty i współpraca z zespołem są dostępne również w Planie Free, zgodnie z uprawnieniami Użytkownika i możliwościami danego modułu.
   b) **Plan Pro (Subskrypcyjny - nielimitowany)**:
      - Znosi miesięczny limit 5 wystawionych faktur sprzedaży. KSeF, PDF/XML, eksporty i zespół działają na tych samych zasadach jak w Planie Free; integracje wymagają konfiguracji i odpowiednich uprawnień.
      - **Cennik**:
        * **Subskrypcja miesięczna**: 7,00 zł brutto za każdy miesiąc rozliczeniowy.
        * **Subskrypcja roczna**: 59,00 zł brutto za każdy rok rozliczeniowy (stanowiąca równowartość ok. 4,92 zł brutto miesięcznie).
      - Wszystkie podane ceny są cenami brutto (zawierają należny podatek od towarów i usług).
3. **Zasady subskrypcji i automatycznego odnawiania (zgodność z UOKiK)**:
   a) Płatności subskrypcyjne obsługiwane są bezgotówkowo przez certyfikowanego dostawcę usług płatniczych Stripe Inc.
   b) Subskrypcja Planu Pro odnawia się w sposób automatyczny na kolejny tożsamy okres rozliczeniowy (odpowiednio miesiąc lub rok) w dniu przypadającym na koniec bieżącego okresu, z zachowaniem tej samej ceny, chyba że Użytkownik zrezygnuje z subskrypcji przed upływem okresu rozliczeniowego.
   c) **1-Click Cancel (Łatwa rezygnacja)**: Użytkownik może w dowolnej chwili i bez podawania jakichkolwiek przyczyn wyłączyć automatyczne odnawianie subskrypcji bezpośrednio w Serwisie (\`Ustawienia → Subskrypcja → Zarządzaj subskrypcją / Anuluj\`) lub z poziomu dedykowanego portalu klienta Stripe.
   d) Po wyłączeniu odnowienia subskrypcji Użytkownik zachowuje dostęp do Planu Pro do końca opłaconego okresu. Po tym czasie Konto przechodzi do Planu Free. Usunięcie Konta jest odrębną operacją: najpierw anuluje subskrypcje, a po potwierdzeniu usuwa Konto i dostęp do danych. Przed usunięciem należy pobrać potrzebne dokumenty.
   e) Wszelkie zmiany cennika wymagają powiadomienia Użytkownika drogą e-mail z co najmniej 30-dniowym wyprzedzeniem. Zmiana cen nie dotyczy okresu już opłaconego.
   f) Konsument oraz Przedsiębiorca na prawach konsumenta (PNPK) ma prawo odstąpić od umowy zawartej na odległość w terminie 14 dni od jej zawarcia bez podania przyczyny, składając oświadczenie na adres ${OPERATOR_CONFIG.emailComplaints}, chyba że przed upływem tego terminu zażądał rozpoczęcia świadczenia usługi i przyjął do wiadomości utratę prawa do odstąpienia po jej całkowitym wykonaniu.`,
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
2. Przed usunięciem Konta Użytkownik powinien pobrać potrzebne dokumenty PDF, dostępne pliki XML i UPO oraz eksporty zestawień faktur (CSV, JSON, XLSX). Eksport danych w Ustawieniach obejmuje profil, firmy i historię zgód; nie jest kompletnym archiwum dokumentów. Dostępne eksporty i pliki pobiera się z odpowiednich modułów Serwisu.
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
  effectiveDate: LEGAL_EFFECTIVE_DATES.privacy,
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
| **Obsługa zgłoszeń, reklamacji i kontaktu** | Adres e-mail, treść korespondencji, dane identyfikacyjne zgłaszającego; w formularzu aplikacji również kategoria sekcji, wersja aplikacji i opcjonalny numer błędu, bez automatycznych załączników i treści dokumentów | Art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes Administratora) lub lit. c (obowiązek rozpatrzenia reklamacji) |
| **Wypełnienie obowiązków prawnych i podatkowych** | Dane rozliczeniowe, ewidencja księgowa, faktury za usługi (w razie płatności) | Art. 6 ust. 1 lit. c RODO w zw. z ustawą o VAT i ustawą o rachunkowości |
| **Zapewnienie bezpieczeństwa teleinformatycznego i audyt** | Zanonimizowany adres IP, identyfikator sesji, znaczniki czasu operacji (Audit Log) | Art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes — ochrona przed atakami i rozliczalność) |
| **Diagnostyka niezawodności aplikacji** | Techniczna kategoria i skrót błędu, ogólna nazwa sekcji bez URL i identyfikatorów dokumentów, wersja aplikacji, klasa urządzenia i rodzina przeglądarki; bez surowej treści błędu, stosu wywołań, IP, cookie diagnostycznego i identyfikatora konta w zapisie zdarzenia | Art. 6 ust. 1 lit. f RODO — wykrywanie usterek i zapewnienie niezawodności usługi; nie jest to pomiar marketingowy |
| **Utrwalenie akceptacji regulaminu i zgód** | Wersja dokumentu, czas serwera, identyfikator użytkownika, status zgody | Art. 6 ust. 1 lit. c RODO w zw. z art. 5 ust. 2 RODO (zasada rozliczalności) |
| **Komunikacja marketingowa (newsletter / nowości)** | Adres e-mail | Art. 6 ust. 1 lit. a RODO (dobrowolna zgoda — wyłącznie po zaznaczeniu opcjonalnego pola) |
| **Dobrowolny własny pomiar korzystania i wydajności** | Pseudonim przeglądarki (HMAC), daty etapów korzystania, w tym otwarcia kreatora i zapisania szkicu, numeryczne TTFB/LCP/INP/CLS, ogólna klasa publiczne/aplikacja i telefon/desktop; bez URL, IP, User-Agent, e-maila, NIP-u, danych faktur i kwot | Art. 6 ust. 1 lit. a RODO i art. 399 PKE — wyłącznie aktualna zgoda analityczna; dane pseudonimowe, nie anonimowe |
| **Statystyki publicznych stron — Google Analytics 4** | Pseudonimowy identyfikator przeglądarki i sesji, odsłony dozwolonych publicznych stron bez parametrów adresu i fragmentów, kliknięcia prowadzące do rejestracji lub demo, źródło odesłania ograniczone do domeny z protokołem, dane techniczne urządzenia i przeglądarki przetwarzane przez Google | Art. 6 ust. 1 lit. a RODO i art. 399 PKE — wyłącznie aktualna zgoda analityczna |

Tag Google jest pobierany dopiero po udzieleniu zgody analitycznej. Integracja GA4 obejmuje wyłącznie dozwolone strony publiczne, np. stronę główną, ofertę i materiały informacyjne. Mierzy także kliknięcia prowadzące z tych stron do rejestracji (registration_click) lub demo (demo_click). Oznaczają one zainteresowanie, a nie ukończenie rejestracji, utworzenie konta ani zakup. Nie wysyła odsłon panelu, stron logowania, ekranu rejestracji, konta ani innych stron prywatnych. Nie przekazujemy do GA4 treści formularzy, faktur, danych kontrahentów, adresów e-mail, NIP-ów, kwot ani identyfikatorów kont. Adres publicznej strony jest wysyłany bez części po znaku „?” i „#”, a adres odsyłający wyłącznie jako protokół i domena, bez ścieżki, parametrów i fragmentu. Połączenie z Google ujawnia dostawcy dane sieciowe niezbędne do jego obsługi; nie określamy tego pomiaru jako anonimowego. Google Signals, personalizacja reklam i zgody reklamowe są wyłączone.`,
    },
    {
      title: "3. Zróżnicowane okresy przechowywania danych (Retencja)",
      content: `Poniżej opisujemy faktyczny cykl danych w aplikacji oraz odrębne systemy rozliczeń i kopii zapasowych:

1. **Dane Konta Użytkownika**: Przechowywane w aktywnej bazie przez czas posiadania Konta. Potwierdzone usunięcie Konta usuwa jego dane oraz powiązane sesje z aktywnej bazy. Nie tworzymy przy tej operacji osobnego archiwum Konta.
2. **Faktury i dokumentacja księgowa Klienta**: Dokumenty przypisane do usuwanego Konta są usuwane z aktywnej bazy wraz z Kontem. Przed usunięciem wyeksportuj faktury i pozostałe potrzebne dokumenty. To Klient zapewnia zachowanie dokumentacji wymaganej dla własnych rozliczeń; Konto nie jest usługą gwarantującą archiwizację po jego zamknięciu. Usunięcie Konta nie usuwa dokumentów już przyjętych przez KSeF.
3. **Dziennik audytu dokumentów (Audit Log)**: Wpisy przypisane do Konta są usuwane razem z nim. Logi infrastruktury hostingowej są odrębne od tego dziennika, a ich rotacja zależy od konfiguracji dostawcy.
4. **Rejestr zgód prawnych i akceptacji regulaminu**: Przechowywany w aktywnej bazie podczas posiadania Konta i usuwany wraz z Kontem. Aplikacja nie utrzymuje osobnego rejestru zgód po usunięciu Konta.
5. **Kopie zapasowe (backupy bazy danych)**: Usunięcie z aktywnej bazy nie modyfikuje wcześniej wykonanych kopii. Dane mogą w nich pozostać do wygaśnięcia skonfigurowanej retencji. Okres i wykonywanie kopii zależą od wdrożonej konfiguracji Operatora i dostawcy; aplikacja nie narzuca automatycznego terminu 30 ani 60 dni. Kopie służą odzyskiwaniu po awarii, a nie dalszemu korzystaniu z usuniętego Konta.
6. **Rozliczenia z Operatorem**: Historia płatności i wymagane dokumenty dotyczące zakupu usługi mogą pozostawać w systemie płatniczym Stripe lub w dokumentacji Operatora niezależnie od usunięcia Konta. Usunięcie Konta zatrzymuje jego subskrypcje; nie oznacza usunięcia historycznych rozliczeń u dostawcy płatności.
7. **Wycofanie zgody marketingowej**: Dane przetwarzane na podstawie zgody są usuwane lub zaprzestajemy ich przetwarzania w tym celu niezwłocznie po wycofaniu zgody.
8. **Opcjonalny własny pomiar pilota i wydajności**: Identyfikator przeglądarki, etapy i próbki wydajności wygasają najpóźniej 30 dni po utworzeniu identyfikatora. Wycofanie zgody usuwa etapy, próbki i cookie tej przeglądarki. Do końca pierwotnego terminu pozostaje wyłącznie HMAC oraz znacznik wycofania i data wygaśnięcia, aby zatrzymać zapisy już będące w trakcie przetwarzania. Dane nie są powiązane z Kontem; użycie innego urządzenia lub samodzielne usunięcie cookie uniemożliwia powiązanie poprzednich pomiarów, które wygasną automatycznie. Pomiar nie obejmuje wszystkich użytkowników i może pozostawać wyłączony przez Operatora.
10. **Diagnostyka i zgłoszenia w aplikacji**: Zdarzenia diagnostyczne są przechowywane przez 30 dni, a zgłoszenia użytkowników przez 90 dni od zapisu, również gdy w tym czasie zamkną Konto. Zgłoszenie można wskazać numerem w kontakcie z Operatorem. Wygaśnięcie jest egzekwowane przy odczycie; fizyczne usuwanie wykonuje mechanizm TTL bazy danych. Ustawienia kolorów i rodzaju wykresu są zapisywane lokalnie w przeglądarce jako preferencje interfejsu.
9. **Google Analytics 4**: Pliki cookies GA4 w przeglądarce mają czas życia do 30 dni, bez automatycznego odnawiania terminu przy kolejnych odsłonach. Jest to czas życia identyfikatorów w urządzeniu, a nie termin usunięcia danych na serwerach Google. Retencja danych na poziomie użytkownika i zdarzenia jest odrębnym ustawieniem usługi GA4 zarządzanym w panelu Google Analytics; zalecamy Operatorowi ustawienie 2 miesięcy i wyłączenie resetowania przy nowej aktywności. Kod strony nie ustawia ani nie potwierdza tej konfiguracji. Ustawienie to nie określa czasu przechowywania wszystkich zbiorczych raportów. Wycofanie zgody blokuje kolejne zdarzenia GA4 i usuwa cookies GA4 z tej przeglądarki, lecz nie usuwa automatycznie historycznych danych już przesłanych do Google. W sprawie realizacji praw dotyczących tych danych skontaktuj się z Operatorem pod adresem ${OPERATOR_CONFIG.emailPrivacy}.`,
    },
    {
      title: "4. Odbiorcy danych i podwykonawcy (Podprocesorzy)",
      content: `1. Dane osobowe mogą być przekazywane podmiotom trzecim współpracującym z nami wyłącznie w zakresie niezbędnym do realizacji Usługi:
   a) **Dostawca bazy danych w chmurze**: MongoDB Inc. (usługa MongoDB Atlas) — przechowywanie zaszyfrowanych danych w chmurze.
   b) **Dostawcy hostingu i infrastruktury serwerowej**: cyber_Folks S.A. (serwery w Polsce) oraz Netlify Inc. (serwery aplikacyjne i routing sieciowy).
   c) **Dostawca wysyłki poczty elektronicznej**: Resend Inc. lub operator własnego serwera pocztowego SMTP — doręczanie powiadomień i faktur PDF.
   d) **Dostawca obsługi płatności i subskrypcji**: Stripe Inc. / Stripe Payments Europe, Ltd. — bezpieczne przetwarzanie płatności bezgotówkowych i transakcji subskrypcyjnych.
   e) **Dostawca opcjonalnych statystyk stron publicznych**: Google Ireland Limited / Google LLC — Google Analytics 4, wyłącznie po zgodzie analitycznej, w zakresie opisanym powyżej. Google nie otrzymuje w tej integracji powierzonych danych księgowych Klienta.
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
   - **Resend Inc.** (USA),
   - **Stripe Inc.** (USA / Irlandia),
   - **Google Ireland Limited / Google LLC** (Irlandia / USA) — opcjonalne statystyki publicznych stron.
2. Transfery poza EOG wymagają podstawy zgodnej z Rozdziałem V RODO. Mechanizmy wskazywane w warunkach naszych dostawców obejmują, zależnie od podmiotu odbierającego i zakresu usługi:
   a) **Decyzję wykonawczą Komisji Europejskiej z dnia 10 lipca 2023 r.** dotyczącą ram ochrony danych UE-USA (*EU-US Data Privacy Framework* — DPF), w zakresie objętym ważną certyfikacją odbiorcy,
   b) **Standardowe Klauzule Umowne (SCC)** przyjęte przez Komisję Europejską na mocy decyzji wykonawczej (UE) 2021/914 i przewidziane w warunkach przetwarzania danych dostawcy.
3. W przypadku Google Analytics zakres i warunki transferów opisują warunki przetwarzania danych Google (https://business.safety.google/adsprocessorterms/) oraz informacje Google o mechanizmach transferu (https://policies.google.com/privacy/frameworks?hl=pl). Mogą one obejmować DPF lub SCC, zależnie od podmiotu odbierającego i zakresu usługi.
4. Transmisja danych jest szyfrowana w tranzycie (TLS 1.2 / TLS 1.3) oraz w spoczynku (*encryption at rest* - AES-256 w MongoDB Atlas).`,
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
  effectiveDate: LEGAL_EFFECTIVE_DATES.cookies,
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
| **fakturo_pilot** | Cookie (HttpOnly, Secure, SameSite=Lax) | Analityczne (opcjonalne) | Pseudonim do dobrowolnego pomiaru etapów korzystania i TTFB/LCP/INP/CLS; bez danych faktur i adresów URL. | Maksymalnie 30 dni; usuwane przy wycofaniu zgody |
| **_ga** / **_ga_4P218PFSBX** | Cookie własnej domeny (Google Analytics 4) | Analityczne (opcjonalne) | Pseudonimowy identyfikator przeglądarki i stan sesji do statystyk wyłącznie publicznych stron i kliknięć prowadzących do rejestracji lub demo. | Do 30 dni, bez automatycznego odnawiania; usuwane z przeglądarki po wycofaniu zgody |
| **fakturaprosto-theme** / **fakturo-theme** | LocalStorage | Niezbędne | Zapamiętanie wybranego trybu graficznego (ciemny / jasny) w celu uniknięcia migotania ekranu. | Trwałe (do wyczyszczenia) |
| **pref_currency / pref_payment_terms** | LocalStorage | Funkcjonalne (opcjonalne) | Zapamiętanie preferowanych domyślnych ustawień wystawiania faktur (np. waluta EUR, termin 14 dni). | Trwałe |

**Własny pomiar pilota i wydajności** uruchamia się wyłącznie po aktualnej zgodzie analitycznej i konfiguracji Operatora. Zapisujemy pseudonim HMAC, pięć etapów korzystania oraz numeryczne próbki wydajności z ogólną klasą strony i urządzenia. Identyfikator próbki jest hashowany. To dane pseudonimowe, nie anonimowe; nie zawierają danych faktur, e-maili, NIP-ów, IP, User-Agent ani odwiedzanych URL. Retencja tego własnego pomiaru wynosi do 30 dni.

**Google Analytics 4** jest odrębnym, zewnętrznym pomiarem uruchamianym dopiero po zgodzie analitycznej. Tag nie jest pobierany przed zgodą. Mierzy odsłony dozwolonych stron publicznych, źródła odwiedzin i kliknięcia prowadzące do rejestracji (registration_click) lub demo (demo_click). Kliknięcia nie potwierdzają ukończenia rejestracji, utworzenia konta ani zakupu. Nie wysyła odsłon panelu, logowania, ekranu rejestracji, konta ani stron prywatnych. Adres strony nie zawiera parametrów ani fragmentu, a adres odsyłający ograniczamy do protokołu i domeny. Nie przekazujemy danych formularzy, faktur, kontrahentów, kont, e-maili, NIP-ów i kwot. Google przetwarza także dane techniczne połączenia i urządzenia zgodnie ze swoją polityką prywatności: https://policies.google.com/privacy?hl=pl.

Cookies GA4 są ustawiane dla bieżącej domeny na okres do 30 dni, z wyłączonym automatycznym odnawianiem terminu (cookie_update: false). Ten okres nie oznacza 30-dniowej retencji danych w Google Analytics. Retencję danych użytkowników i zdarzeń ustawia Operator w panelu GA4; zalecana konfiguracja to 2 miesiące bez resetowania przy nowej aktywności. Kod strony nie zmienia tej konfiguracji, a ustawienie nie obejmuje wszystkich raportów zbiorczych. Google Signals oraz funkcje personalizacji i przechowywania danych reklamowych pozostają wyłączone, także po wyborze „Akceptuj wszystkie”. Nie stosujemy Meta Pixel.`,
    },
    {
      title: "4. Zarządzanie zgodami i wycofanie zgody",
      content: `1. Użytkownik ma prawo w dowolnym momencie zmienić swoje preferencje lub wycofać uprzednio wyrażoną zgodę na opcjonalne pliki cookies.
2. Wycofanie zgody jest równie łatwe jak jej udzielenie — w stopce każdej strony Serwisu oraz w Ustawieniach Konta znajduje się stały link **„Ustawienia prywatności / Cookies”**, który otwiera panel CMP.
3. W przypadku wycofania zgody Serwis natychmiast zaprzestaje korzystania z danej kategorii technologii i podejmuje próbę usunięcia odpowiednich identyfikatorów z przeglądarki:
   - **Własny pomiar pilota**: usuwane są cookie pilota oraz etapy i próbki tej przeglądarki. W razie awarii połączenia usunięcie jest ponawiane po odzyskaniu kontaktu z serwisem. Sam HMAC ze znacznikiem wycofania i datą wygaśnięcia pozostaje do końca pierwotnych 30 dni wyłącznie po to, aby zablokować trwające zapisy.
   - **Google Analytics 4**: blokowane są kolejne zdarzenia, a cookies _ga i _ga_4P218PFSBX usuwane z przeglądarki. Wycofanie zgody nie cofa zdarzeń już wysłanych i nie usuwa automatycznie ich historii na serwerach Google. W sprawie usunięcia takich danych skontaktuj się z Operatorem pod adresem ${OPERATOR_CONFIG.emailPrivacy}.
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
  effectiveDate: LEGAL_EFFECTIVE_DATES.dpa,
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
   a) umożliwia Administratorowi uprzednie pobranie danych za pomocą eksportów dostępnych w poszczególnych modułach Serwisu (m.in. JSON, CSV, XLSX oraz dostępne pliki XML). Eksport profilu w Ustawieniach nie obejmuje pełnej dokumentacji. W sprawie zwrotu powierzonych danych wykraczających poza dostępne eksporty Administrator kontaktuje się z Operatorem pod adresem ${OPERATOR_CONFIG.emailPrivacy} przed usunięciem Konta,
   b) trwale usuwa wszelkie powierzone dane osobowe ze środowiska produkcyjnego, chyba że prawo Unii Europejskiej lub prawo Rzeczypospolitej Polskiej nakazuje ich dalsze przechowywanie.
2. Usunięcie danych z aktywnej bazy nie zmienia kopii zapasowych już wykonanych przed usunięciem. W kopiach dane pozostają do wygaśnięcia retencji skonfigurowanej przez Operatora lub dostawcę infrastruktury. Aplikacja nie narzuca automatycznego terminu 30 ani 60 dni. Kopie są przeznaczone do odzyskiwania po awarii; przy odtworzeniu należy ponownie zastosować wcześniej wykonane żądania usunięcia.`,
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
  effectiveDate: LEGAL_EFFECTIVE_DATES.subprocessors,
  description: "Zestawienie podmiotów trzecich biorących udział w przetwarzaniu danych w infrastrukturze FakturaProsto, ich lokalizacja, rola i zabezpieczenia transferu.",
  sections: [
    {
      title: "1. Zasady doboru i nadzoru nad podwykonawcami",
      content: `Zgodnie z art. 28 ust. 2 i ust. 4 RODO oraz § 5 Umowy Powierzenia Przetwarzania Danych (DPA), publikujemy aktualny, pełny wykaz podmiotów trzecich, z których usług korzystamy w celu zapewnienia sprawnego i bezpiecznego działania platformy FakturaProsto (${OPERATOR_CONFIG.serviceUrl}).

Rozróżniamy dostawców uczestniczących w świadczeniu usług na danych powierzonych przez Klienta od dostawcy dobrowolnych statystyk publicznych stron. Google Analytics 4 służy wyłącznie statystykom Operatora po zgodzie odwiedzającego; nie jest odbiorcą danych księgowych powierzonych na podstawie DPA. Zakres usług i warunki przetwarzania każdego dostawcy wskazujemy poniżej.`,
    },
    {
      title: "2. Rejestr dostawców i zakres przetwarzania",
      content: `Poniżej wskazujemy dostawców infrastruktury oraz odrębnie dostawcę opcjonalnych statystyk publicznych stron:

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
- **Podstawa transferu poza EOG**: Standardowe Klauzule Umowne (SCC) oraz Data Privacy Framework.

---

### 4. Opcjonalne statystyki publicznych stron — Google Analytics 4
- **Podmiot**: Google Ireland Limited / Google LLC.
- **Cel**: Statystyki odsłon publicznych stron, źródeł odwiedzin i kliknięć prowadzących do rejestracji lub demo, wyłącznie po zgodzie analitycznej. Kliknięcia nie potwierdzają utworzenia konta ani zakupu. Operator jest administratorem tego pomiaru.
- **Zakres**: Pseudonimowe identyfikatory przeglądarki i sesji, publiczny adres bez parametrów i fragmentu, rodzaj kliknięcia, źródło odesłania ograniczone do protokołu i domeny oraz dane techniczne przetwarzane przez Google. Bez danych formularzy, faktur, kontrahentów, kont i płatności; bez odsłon panelu, logowania, ekranu rejestracji i stron prywatnych.
- **Lokalizacja**: Irlandia (UE) oraz infrastruktura Google, w tym USA.
- **Warunki i transfery**: Warunki przetwarzania danych: https://business.safety.google/adsprocessorterms/; mechanizmy transferu: https://policies.google.com/privacy/frameworks?hl=pl; polityka prywatności: https://policies.google.com/privacy?hl=pl. Google opisuje stosowanie DPF lub SCC, zależnie od podmiotu odbierającego i zakresu usługi.
- **Relacja do DPA Klienta**: Google w tej integracji nie przetwarza powierzonych danych księgowych Klienta. Rezygnacja z analityki nie ogranicza usług fakturowania.`,
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
