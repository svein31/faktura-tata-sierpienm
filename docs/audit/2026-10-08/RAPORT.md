# Audyt QA, naprawy i SEO FakturaProsto — 8–9 października 2026

**Status: lokalna regresja i pomiary final7 ukończone w opisanym zakresie.** W chwili zamrożenia raportu nie zweryfikowano jeszcze nowego zdalnego CI; dokładny SHA publikacji w historii main i odpowiedzi końcowej. [Addendum final7](dependency-followup-final7.md) oddziela nowe kontrole od historycznych dowodów final6. Nie przenosi się wyniku final6 na zależności po aktualizacji.

**Historyczna regresja final6 jest ukończona w opisanym zakresie.** Build, TypeScript, lint, 282 testy, pełny HTTP, axe oraz celowane kontrole kompilacji final6 przeszły. Zakres trzech silników ukończono w dwóch zgodnych przebiegach: Chromium/WebKit z pierwszego oraz pełny świeży Firefox z drugiego; zatrzymanego Firefox nie zaliczono. Testy zapisujące wykonywano wyłącznie na izolowanych, syntetycznych kontach i replice MongoDB. Produkcję badano odczytowo; jej wdrożenie pozostaje zablokowane limitem Netlify i nie odpowiada temu kodowi.

Naprawiono błędy obliczeń i korekt, księgi wpłat, uprawnień, kont, importów, wspólnych kontrolek i wykrywalności publicznych treści. Pętla kontroli ujawniła później także cookies w wydruku, utratę fokusu oraz nadmierny prefetch prywatnych tras; te problemy naprawiono i ponownie sprawdzono na final6. Ten raport **nie stwierdza przeklikania każdego mikroelementu, braku wszystkich możliwych błędów ani spełnienia TOP 5**.

## Aktualne wydanie final7 i ponowna regresja

Aktualizacja po publikacji `87fb9afb170e5c04921aa22f1f8e674d0edf0645` naprawia zależności produkcyjne i indeksy nullable Stripe ID oraz izoluje finansowe fixture CI. Nie zmieniono plików aplikacji po kompilacji final7. Skrypty migracji i testów mają osobne hashe, ponieważ fingerprint aplikacji ich nie obejmuje.

| Dowód aktualnego zakresu | Stan |
| --- | --- |
| Kompilacja / źródła | BUILD_ID `EtIKJoZ6X52nNorRlxheE`; SHA-256 `202ad9a2ba265177355cbaf5318a9a91837744b89727ebc42f8fdaa49588a716` |
| Build, TypeScript, lint i testy | PASS: każdy proces exit 0; 275 nazwanych + 7 test:fixes = 282, zero błędów i pominięć |
| HTTP po migracji 022 | PASS: 135 wzorców / 193 metody / 442 kontrole, zero failures; 42 kontrole produktu/bezpieczeństwa oraz 46 publicznych HTML SEO. [Dowód](http-audit-final7-postmigration.json) |
| Przeglądarki | Jedna rzeczywista inwokacja Chromium/WebKit/Firefox, exit 0: 1010 kontroli układu, 33863 obserwowane kontrolki i 246 nazwanych scenariuszy. To obserwacje i konkretne scenariusze, nie każdy stan wszystkich mikroelementów. [Dowód](browser-coverage-summary-final7.json) |
| Axe | 90 tras / 180 ekranów, zero automatycznych naruszeń; 86 ekranów nadal wymaga oceny ręcznej. [Dowód](accessibility-routes-final7.json) |
| Migracja Stripe 022 | PASS 12 natywnych grup oraz ponownie w rozszerzonym HTTP: prawdziwe ID nadal unikalne, dwa pending checkout i rzeczywiste nadanie subskrypcji współistnieją; checkpoint/kolacje/idempotencja/bezpieczny rollback. [Dowód i hashe](subscription-indexes-final7.json) |
| Audyt zależności | Produkcyjny podzbiór 3 → 0. W narzędziach dev pozostaje 7 zgłoszonych węzłów: 5 high i 2 moderate; nie wykonano migracji Tailwind 4 |
| Aktualna wydajność final7 | CDP LCP mediana **644 ms**, CLS 0; Lighthouse **95/100**, początkowy JS **116653 B / 113,92 KiB gzip**. Rampa **1317 żądań / 0 błędów**, maks. 20 wykonawców, p95 **538,5 ms**. [Pomiary](../../performance/WYNIKI-final7-2026-10-09.md) |
| Wspólna ścieżka CI / publikacja | Pierwotny zdalny verify i audyt zależności FAIL; lokalna reprodukcja fixture oraz poprawki przeszły. W chwili zamrożenia raportu nowego zdalnego CI nie zweryfikowano; dokładny SHA publikacji w historii main i odpowiedzi końcowej |

Final7 zachowuje 131 ujemnych odpowiedzi i 91 wpisów konsoli, w tym jeden WebKit anulowanego RSC; **nie jest to czysta konsola**. Odrębna macierz była przygotowana przed migracją 022 i miała wcześniej wczytany finansowy helper; nie dowodzi nowego układu indeksów ani wspólnego fixture HTTP. To naprawę ograniczeń bazy potwierdzają późniejsze natywne próby i rozszerzony HTTP. Cztery rzeczywiste wydruki A4, osobne 33 kontrole motywu/firm i agresywny pomiar prefetch pozostają dowodami final6; nie przeniesiono ich na final7. Szczegóły, pozostałe zgłoszenia i zakres: [dependency-followup-final7.md](dependency-followup-final7.md), [dependency-followup-final7.json](dependency-followup-final7.json).

## Historyczne wydanie i dowody final6

| Dowód | Stan |
| --- | --- |
| Commit bazowy | `0c4c726fb109ee209026e77541e8caf08a02c1fa` |
| Gałąź docelowa | `main`; dokładny SHA publikacji w historii commitów i odpowiedzi końcowej. Publikacja kodu nie oznacza wdrożenia Netlify |
| Historyczna kompilacja final6 | BUILD_ID `21f_lBaQA8Ww--YiYgN1t`; SHA-256 źródeł `14e1b8e0f3850b795ad5d8e7c183edb335b0f40f275e16ce710c6e456e62a3fc`; źródła pozostawały zgodne podczas pomiarów final6. Późniejsza aktualizacja zależności wymaga odrębnych dowodów final7 |
| Build, TypeScript, lint | PASS: `npm run build`, `npm run typecheck`, `npm run lint`; logi `faktura-qa-{build,type,lint}-final6.log` |
| Testy jednostkowe | PASS: 275 nazwanych i 7 `test:fixes`, łącznie 282, zero błędów i pominięć; `faktura-qa-tests-final6.log` |
| SEO renderowanego HTML | PASS: 46 tras, metadata/H1/canonical/JSON-LD/sitemap/llms i prywatne noindex; nie jest to potwierdzenie indeksacji wszystkich URL-i przez Google |
| Katalog API | PASS: 135 wzorców / 193 metody, 442 kontrole, failures=0 i 42 celowane kontrole bezpieczeństwa/produktu; smoke nie dowodzi poprawności wszystkich operacji |
| Konta, wpłaty i uprawnienia HTTP | `test:integration` PASS: account/proof/invitation/financial/approval, trwałe kolejki, magazyn, bank, izolacja firm/uprawnienia, migracje i rollback |
| Współbieżna wysyłka testowa | HTTP PASS: 8 żądań i jedno przyjęcie lokalnego SMTP, replay/conflict, odłączone potwierdzenie/nowy klucz, rozstrzygnięcie z audytem; claim Mongo i 4 sanitizer PASS |
| Wspólne komponenty UI | 17 nazwanych scenariuszy rzeczywistych komponentów w syntetycznym fixture × 3 silniki = 51 PASS; to odrębny zakres od wszystkich miejsc użycia |
| Pełne pokrycie przeglądarek z dwóch przebiegów | Chromium/WebKit/Firefox ukończone: 1010 kontroli układu, 33498 obserwowanych wystąpień kontrolek i 246 jawnych scenariuszy; zero błędów układu. Obserwacja kontrolki nie oznacza wykonania wszystkich jej stanów |
| Axe i kontrast zbadanych ekranów | Automatycznie PASS: 90 tras / 180 ekranów, zero ekranów z naruszeniami; 86 ekranów nadal wymaga oceny ręcznej. Znany niewidoczny filtr naprawiono i osobno sprawdzono 24 rzeczywiste stany |
| Prywatne układy, clipboard i filtry | PASS: 36 ekranów kosztów/zespołu, zero overflow i naruszeń axe; 9 scenariuszy clipboard bez pozornego sukcesu, 24 stany filtrów z rzeczywistym stylem/wierszami/klawiaturą |
| Motyw i lista firm — dodatkowy desktop | 33 aktualne kontrole myszą/klawiaturą w trzech silnikach: light/dark i reload, System/media, wybór dwóch firm i Escape/focus; zero submit/zapisów interakcji. [theme-company-final6.json](theme-company-final6.json). Test1280×900; inne warianty i próby produkcji nieweryfikowane |
| Cookies i rzeczywisty wydruk | PASS: 24 scenariusze print-media/fokusu w trzech silnikach; 4 krótkie dokumenty A4 Chromium, 92 asercje i 8 rzeczywiście obejrzanych renderów PDF. Inne warianty/drukarki pozostają nieweryfikowane |
| Historyczna wydajność final6 | 3 próby CDP i 3 Lighthouse: mediana LCP 616 ms / 2423,92 ms, Lighthouse 97, start JS 113,81 KiB gzip; próba 1419 żądań z maks. 20 wykonawcami, zero błędów. Niespełnione progi i konfiguracja w [raporcie pomiarów](../../performance/WYNIKI-2026-10-09.md) |
| Produkcja: odczyt publiczny | 62 adresy crawl, 79 ekranów Chromium/WebKit/Firefox i 58 interakcji; konkretne problemy starego wdrożenia, CSP i Escape nadal wymagają publikacji |

**Zachowane diagnostyki:** w połączonych ukończonych przebiegach występuje 130 zamierzonych odpowiedzi ujemnych: 52 anonimowe401, 63 celowo blokowane NBP502, 6 kontrolowanych reset400 i 9 testowych404. Konsola zachowuje 92 wpisy: 90 diagnostyk zasobów oraz po jednym szczególnym wpisie WebKit RSC i Firefox InvalidStateError. Wpis WebKit powiązano z intencjonalnym warmupem i zamykaniem starego dokumentu; dokładnej przyczyny pojedynczego Firefox nie udowodniono. **Nie jest to czysta konsola.** Zakres i powody: [browser-diagnostics-review-final6.json](browser-diagnostics-review-final6.json).

Dowody historycznej kompilacji final6: [http-audit-final6.json](http-audit-final6.json), [browser-coverage-summary-final6.json](browser-coverage-summary-final6.json), [accessibility-routes-final6.json](accessibility-routes-final6.json) i [runtime-release-evidence.json](runtime-release-evidence.json). Historyczny final4 K1 miał ukończone pierwotne bramki, lecz późniejszy rzeczywisty PDF i proces cookies ujawniły defekty. Final5 Zj potwierdził poprawki cookies/HTTP/axe/układów, lecz pełna macierz zatrzymała się w WebKit po 713 obserwacjach na pięciu diagnostykach WebKit pobrań RSC podczas zmiany dokumentu. Odrębny test przyczynowy odtworzył diagnostykę adaptera mimo obsłużonej obietnicy; nie potwierdził nieobsłużonego wyjątku aplikacji ani błędnego CORS. Oba przebiegi pozostają historyczne; nie przeniesiono ich wyniku na final6. Pierwsze final6 zatrzymało się na dostępie harnessu do localStorage dokumentu opaque-origin; następne final6 ukończyło Chr/WK i zatrzymało proces FF po 983 kontrolach. Nie wykazano przyczynowego OOM. Końcowe pokrycie pochodzi wyłącznie z ukończonych Chr/WK oraz nowego pełnego FF na świeżym fixture; skład, hashe i oba logi zachowuje browser.composition w surowym dowodzie.

## Inwentaryzacja i granice pokrycia

Aktualny fingerprint po aktualizacji zależności ma osobne [inventory-final7.json](inventory-final7.json) i [coverage-final7.md](coverage-final7.md). Dowody final7 oraz stan zdalnego CI w chwili zamrożenia raportu są w [addendum](dependency-followup-final7.md). Historyczne `inventory.json` i `coverage.md` poniżej zachowują final6; nie przeniesiono ich dopasowań na nowy kod.

Spis źródłowy final6 obejmuje **65 wzorców stron, 51 konkretnych publicznych ścieżek, 135 wzorców Next API, 193 metody, 75 plików komponentów i 1730 szablonów mikroelementów JSX**.

Osobna [mapa punktów wejścia platformy](platform-entrypoints.json) obejmuje pięć funkcji Netlify poza katalogiem Next API oraz start hosta Node w `app.js`. To dowód źródłowy konfiguracji i powiązań; rzeczywisty harmonogram, routing, cron/worker i autoryzacja na platformie pozostają nieweryfikowane. Lokalny przebieg Next nie potwierdza wykonania tych funkcji w hostingu.

[inventory.json](inventory.json) prowadzi osobny stan akcji, hover, focus, disabled, loading, error, empty, walidacji, odświeżenia i „wstecz” każdego odkrytego szablonu. `source-discovered` jest jedynie spisem. `unverified` oznacza brak dowodu, nie poprawne działanie. Warunkowe warianty, elementy generowane z danych i stanów nie stają się zaliczone przez odwiedzenie jednej strony.

Zgodność dowodów jest wiązana z hashem źródeł, schematu, stylów, zasobów i konfiguracji, buildem oraz katalogiem metod. Nie przyjęto starszych plików runtime jako sukcesu nowszego kodu. Dokładny zakres i sposób odtworzenia opisuje [coverage.md](coverage.md).

## Naprawy faktur, kwot i księgi wpłat

| Element | Problem | Przyczyna | Poprawka u źródła | Status / zakres |
| --- | --- | --- | --- | --- |
| Duże kwoty | `100000000000.01` traciło grosz | Stałe 12 cyfr znaczących | Normalizacja zachowuje cyfry całkowite i signed half-up | Regresja jednostkowa PASS |
| Waluty i korekty | `−0,005 PLN` zaokrąglało się do 0 | Osobne `Math.round` | Wspólne signed half-up, kontrola finite/kursu/overflow | Jednostkowo PASS |
| Podgląd versus zapis | 10 × 1,005 dawało 10,05 w podglądzie i 10,10 po zapisie | Różna kolejność normalizacji ceny i mnożenia | Wspólna normalizacja ceny do 2, ilości do 6 miejsc przed sumowaniem | Jednostkowo i rzeczywiste UI final6 w trzech silnikach PASS |
| Daty | Data ze spacjami przechodziła walidację, lecz zapisywano jej oryginał | Zwracano surowe pole | Zapis zwalidowanych i przyciętych dat | Parser i rzeczywisty izolowany HTTP PASS |
| Numer dokumentu bez firmy | Obcy użytkownik blokował numer; legacy brak pola firmy był pomijany | Globalne `sellerCompanyId:null` i semantyka null/brak | Firma albo właściciel z obsługą null/braku pola w jednym helperze POST/PUT | Rzeczywisty HTTP dwóch tożsamości oraz legacy brak pola PASS |
| Równoległe wpłaty | Niespójna kwota, wersja, saldo i audyt | Niezależne zapisy bez blokady dokumentu | Jedna transakcja i bounded retry: blokada, okres, księga, saldo, status, audyt | PASS: 6 równoległych wpłat, saldo 123, wersja +6, 6 wpisów księgi i audytu |
| Historyczne saldo / pełna zapłata | Stara częściowa wpłata znikała; dwie pełne wpłaty mogły dać dwukrotną należność | Sumowano tylko nowe rekordy, nie kontrolowano salda pod blokadą | Zachowane saldo otwarcia; drugi zapis pełnej zapłaty 409 | PASS: saldo 40+10=50; dwie pełne wpłaty → 200/409, jeden rekord; brak zapisu do opłaconej |
| Wpłata do szkicu | Szkic stawał się opłacony bez wystawienia | Brak kontroli cyklu życia | Wpłata wyłącznie do wystawionej dodatniej sprzedaży w otwartym okresie | PASS rzeczywistego HTTP szkicu i zamkniętego okresu; bez częściowego zapisu |
| Opłacenie i edycja należności | Akcja szczegółów oznaczała opłacenie bez rekordu wpłaty; edycja ufała statusowi i kwocie od klienta | Zapis ogólnej aktualizacji zamiast polecenia płatności | Szczegóły używają POST płatności; PUT odrzuca zmianę opłacenia, zachowuje saldo serwera i przelicza status względem nowej należności | PASS: PUT nie przyjmuje sfałszowanej wpłaty; wpłacone 123 przy 246 brutto daje częściową zapłatę, powrót do 123 brutto daje opłacenie |
| Korekta zmniejszająca | Ujemna ilość była odrzucana | Wspólna dodatnia reguła dla sprzedaży i korekty | Niezerowa ujemna ilość tylko w jawnej korekcie | Parser i oficjalne FA(3) XSD PASS |
| Akcja korekty | Sekcja formularza nie miała drogi uruchomienia | Brak akcji i wczytania oryginału | Szczegóły → `correctionFrom`; autoryzowany oryginał i jawne różnice | Rzeczywisty HTTP i UI final6 korekt w trzech silnikach PASS |
| Dane oryginału korekty | Dało się zapisać brak przyczyny, daty/numeru; XML wymyślał `FA/ORYG` | Walidacja głównie klientowska i wartości zastępcze | Wymagane rzeczywiste metadane, autoryzacja oryginału, brak fikcyjnego numeru | Jednostkowo/oficjalne FA(3) XSD i rzeczywisty HTTP ujemnych/mieszanych korekt oraz odmowa obcego oryginału PASS |
| Ujemny VAT / PDF | XML pomijał ujemne podsumowania; pozycja pokazywała kreskę | Warunki kwot `>0` | Uwzględnianie niezerowych kwot signed, prawdziwy PDF z polskimi znakami | XSD i odczyt wygenerowanego PDF PASS |
| Import pozycji arkusza | Błędna cena/ilość/VAT stawały się 0/1/23%; minus znikał | `parseFloat || default` i clamp | Pełne parsowanie, polski przecinek/cytaty, brak cichej korekty; minus tylko w korekcie | Jednostkowo PASS |
| Kurs NBP | Stary/spóźniony kurs nadpisywał właściwą walutę/datę; brak informacji o awarii | Brak anulowania i powiązania klucza | Abort, identyfikacja waluty/dat, loading/error, zachowanie ręcznego kursu | Final6 UI z kontrolowanym NBP w trzech silnikach PASS; realny dostawca pozostaje nieweryfikowany |
| Statusy i flagi | Nieznane enumy i nieskończone kwoty przechodziły zapis | Luźne parsowanie | Jawne enumy, finite/range, boolean i język | Parser PASS |

Szczegółowe przykłady, ograniczenia podatkowe i scenariusze reprodukcji: [financial-review.md](financial-review.md). Korekty zaliczek/rozliczeń końcowych wymagają odrębnego procesu i pozostają jawnie zablokowane; nie udaje się obsługi niezaimplementowanego przeliczenia. Dodatnie wpłaty nie obsługują refundowania ujemnej korekty.

## Naprawy kont, API i bezpieczeństwa

| Element | Problem | Przyczyna | Poprawka u źródła | Status / zakres |
| --- | --- | --- | --- | --- |
| Zmiana hasła | Pozostałe urządzenia nadal zalogowane | Zmieniano tylko hash | Transakcja zachowuje żywą bieżącą sesję i unieważnia inne | PASS jednostkowo, w rzeczywistej Mongo i przez HTTP; inne sesje unieważnione |
| Równoległa zmiana hasła | Stary hash nadpisywał późniejszą zmianę; cofnięta sesja mogła wykonać zapis | Brak CAS hasha i dowodu sesji w transakcji | CAS, fence żywej sesji i bounded retry | PASS: jeden zwycięzca CAS, żywa sesja, atomic rollback w rzeczywistej Mongo; cały HTTP PASS |
| Stare linki odzyskiwania / zmiany adresu | Dowód sprzed zmiany hasła pozostawał skuteczny | Brak atomowego unieważnienia | Reset/zmiana hasła unieważniają stare dowody w transakcji | PASS Mongo/HTTP: stare dowody unieważnione, jednorazowy reset i atomic rollback |
| Logowanie ze starym dowodem | Żądanie wstrzymane po sprawdzeniu starego hasła tworzyło sesję już po zmianie hasła/adresu i cofnięciu sesji | Zapis sesji nie był związany ze zweryfikowanym hashem, adresem i stanem 2FA | Transakcyjny CAS sprawdzonego hasha/adresu i kontrola 2FA przed utworzeniem sesji | PASS rzeczywistej Mongo: stary dowód 401 i zero sesji; aktualny dowód działa; pełna regresja ukończona |
| Zmiana adresu ze starym dowodem | Wstrzymane żądanie tworzyło nowy token i próbę wysyłki po zmianie hasła/wylogowaniu | Ponowny odczyt użytkownika nie sprawdzał wcześniejszego dowodu ani żywej sesji | Ten sam hash i żywa sesja zapisane w transakcji użytkownika/tokena | PASS rzeczywistej Mongo: 401, zero tokenów i prób dostawcy; aktualny dowód działa |
| Nowe hasła Unicode | Różne długie hasła miały ten sam bcrypt hash | Limit bcrypt 72 bajty kontra 128 znaków aplikacji | Wspólna walidacja 8 znaków i ≤72 bajtów UTF-8 przed haszowaniem | Granice ASCII/Unicode/emoji PASS |
| Login, 2FA, step-up | Limit zależał od procesu/IP, możliwe obejście przez inną instancję | Pamięć lokalna / granica według IP | Trwałe pseudonimizowane liczniki konta/logowania | Źródło poprawione; topologia Netlify nieweryfikowana |
| Reset hasła | Token/email trafiały do HTTP query, historii i referrera | Link query i brak no-referrer | Fragment, zgodność starych linków, czyszczenie adresu i no-referrer | Jednostkowo i 9 scenariuszy resetu final6 w trzech silnikach PASS |
| Rejestracja / profil | Niewalidowany NIP i nieograniczone pola | Brak sprawdzenia typu, długości, checksum | Ścisłe walidatory przed zapisem | PASS HTTP: limity UTF-8, NIP/pola profilu, błędne dane nie zapisują konta |
| Kontrahenci | Nieznany `taxIdType` był akceptowany | TypeScript nie zapewnia runtime validation | Dozwolona lista typów | Jednostkowo PASS |
| Polski VAT UE | Poprawny `PL5260301706` odrzucano lub usuwano prefiks VAT UE | Polski NIP sprawdzano przed wybranym typem VAT UE | Odrębne typy, zachowany PL i checksum NIP | PASS jednostkowo: typ/prefiks/checksum; oficjalne FA(3) XSD PASS |
| Cookie sesji zaproszenia | Secure nie uwzględniało rzeczywistego HTTPS żądania | Helper cookie wywołany bez Request | Takie same opcje Request/proxy jak login i rejestracja | PASS HTTPS/proxy/HTTP jednostkowo i rzeczywiste przyjęcie anonimowego odbiorcy przez HTTP |
| Przyjęcie prawidłowego zaproszenia | Odbiorca nie dołączał bez sesji przeglądarki osoby zapraszającej | Interaktywny teamActor wymagał step-up wystawcy w żądaniu odbiorcy | Rewalidacja bieżących praw wystawcy przez teamInvitationGrantor; zarządzanie zespołem nadal wymaga step-up | PASS handler/HTTP: anonimowy istniejący, nowy i zalogowany odbiorca; replay bez nowej sesji/członkostwa |
| Dowód odbiorcy zaproszenia | Odmowa sesji następowała po zużyciu tokena i nadaniu dostępu | Hash/adres/sesja/2FA poza transakcją claim/grant | CAS hasha/adresu, żywa sesja i generacja 2FA przed nadaniem; nowe konto wymaga weryfikacji adresu | PASS jednostkowo/HTTP: stary hash, cofnięta sesja, MFA i cofnięte prawa wystawcy; brak grant/zużycia odmówionego tokena |
| Nowe konto z zaproszenia — regulamin i rollback | Brak zgody albo string „true” pozwalał tworzyć konto; cofnięte prawa wystawcy mogły zostawić konto bez członkostwa | Brak ścisłego boolean i utworzenie użytkownika poza transakcją przyjęcia | [Handler zaproszenia](../../../src/app/api/invite/[token]/route.ts): wymagane acceptTerms===true; aktualna wersja/czas regulaminu i consent z kontekstem invite_accept, ograniczonym user-agent oraz zanonimizowanym IP; konto, zgoda, token, członkostwo i audyt w jednej transakcji | PASS jednostkowo/HTTP: undefined/false/string/liczba odmówione przed zapisem, jedna prawdziwa zgoda nowego konta, cofnięty wystawca wycofuje konto/zgodę/grant; istniejącemu nie dopisuje fikcyjnej zgody |
| Upload | Uszkodzony multipart powodował 500 | Nieobsłużony błąd parsera | 400 `INVALID_MULTIPART`, bez skanera i DB | PASS parser/HTTP: malformed multipart 400 przed skanerem/DB |
| CSV | Tekst po zamkniętym cytacie był przyjmowany | Brak stanu zamknięcia pola | Odmowa błędnego CSV przy zachowaniu BOM/CRLF/cytatów | Jednostkowo PASS |
| Zgody | Uszkodzony JSON dawał 500, string mógł cofnąć zgodę, zła wersja | Catch ignorował ApiError, luźny typ, wersja regulaminu | Wspólne błędy, boolean, wersja cookies; awaria zapisu 503 | PASS jednostkowo i HTTP: błędny JSON/boolean odrzucony, właściwa wersja; awaria zapisu 503 |
| Eksport danych | Unicode psuł filename, licznik kończył się na 1000, DB error dawał fałszywe 0 | Surowy email, pełne katalogi, tłumienie błędów | Bezpieczny filename, dokładne liczniki/projekcja bez sekretów, zgłoszenie awarii | PASS: 1250 dokumentów jednostkowo, Unicode przez HTTP, brak sekretów/projekcja i jawna awaria |
| Akceptacja kosztów | Pracownik tworzył już zatwierdzony koszt mimo403 akceptacji | POST ufał approvalStatus klienta | Nowy dokument pending, typ niezmienny, osobna uprawniona akceptacja | PASS handler/HTTP: pending nowego kosztu, odmowa pracownika 403, brak zmiany typu/akceptacji przez PUT |
| Początkowa płatność | Powstawała opłacona faktura bez księgi wpłat | Przyjmowano paidAmount/status od klienta | Odmowa fałszowanego opłacenia409; wpłata osobną operacją | PASS: 4 warianty fałszowania opłacenia odrzucone 409 bez zapisu w HTTP i handlerze |
| Edycja przyjętej KSeF | Luźne statusy akceptacji i nieograniczone notatki | Specjalna ścieżka omijała parser | Enum/status zachowany, notatki text≤4000 | PASS handler/HTTP: dozwolona notatka działa; enum/limit/type 400, zmiana akceptacji 409 |
| 8 równoległych żądań e-maila | Jedno rzeczywiste żądanie zwróciło P2034/500; replay i busy konkurowały z właścicielem wysyłki | Każda próba zapisywała wspólny wiersz użytkownika przed odczytem wysyłki; identyczny harmonogram ponowień | [Claim](../../../src/lib/email/manual-delivery.ts) zapisuje fence tylko przy zmianie stanu; replay/busy/verify_needed są odczytowe. Maksymalnie 8 prób z jitter; wyczerpanie claim przed dostawcą to 409 EMAIL_BUSY | PASS: 3 jednostkowe, rzeczywista Mongo 8 claim/readonly/deadline, HTTP 8 równoległych intencji i jedno przyjęcie SMTP; replay i awarie bez duplikatu |
| Szczegóły wyjątków dostawcy/bazy | P2034/500 ujawniał szczegóły Prisma w odpowiedzi; wyjątki PDF/XML mogły trafiać do logów, błąd do historii wysyłki | Catch publikował dowolne Error.message/code i logował pełny wyjątek | [Handler](../../../src/app/api/invoices/send-email/route.ts): nieznany błąd to EMAIL_SEND_FAILED/500 ze stałą wiadomością także w historii; log ograniczony do sprawdzonego code/name. Jawne ApiError i niepewny wynik409 zachowane | PASS: 4 scenariusze handlera; brak syntetycznego sekretu w HTTP/historii/logu, brak SMTP przed wysyłką; pełny integration PASS |
| CSP i konsola | Setki diagnostyk wymaganych inline scripts/JSON-LD | Report-Only bez nonce/hash i kolektora | Usunięto niedziałającą diagnostykę; zachowano wymuszane object/base/frame/form | Final6 browser PASS w opisanym zakresie; produkcja nadal starsza. Oczekiwane błędy sieci atrap i scenariuszy ujemnych zachowano |

Szczegóły i jawne ograniczenia: [security-review.md](security-review.md). Nie wdrożono ścisłej listy skryptów CSP przeciw XSS: wymaga sprawdzonego mechanizmu hashów SSG/nonce renderowania prywatnego. Pozostałe wymuszane zabezpieczenia CSP zachowano. Starego bcrypt nie można naprawić odtworzeniem utraconego sufiksu; nowe hasła muszą spełniać limit, stare zachowują zgodność logowania do zmiany hasła.

## Naprawy interfejsu i dostępności

| Element | Problem | Przyczyna | Poprawka u źródła | Status / zakres |
| --- | --- | --- | --- | --- |
| Wymagany Select | Pusta lista uruchamiała formularz, bez widocznego błędu | Własny submit i hidden input | Natywny select dla validation/FormData/reset, focus triggera i ARIA error | 3 silniki fixture PASS |
| Lista Select z klawiatury | Opcja zmieniała się na tę pod nieruchomym kursorem | MouseEnter przy montowaniu popup | MouseMove po rzeczywistym ruchu | 3 silniki PASS |
| Domyślna opcja Select | Wybierano disabled pierwszą opcję | Brak filtrowania defaultu | Pierwsza dostępna opcja, bezpieczny pusty zbiór | 3 silniki PASS |
| Tabs / wybór motywu | Enter/klik wysyłał otaczający formularz | Brak type button | Typ, Arrow/Home/End, roving tabindex i ARIA nazwy | Final6 Tabs fixture PASS; wygląd desktop1280: jasny myszą, ciemny klawiaturą, trwałość po reload, System i zmiany obu media PASS w trzech silnikach. Inne użycia i wybór kolorów nieweryfikowane |
| Animacja Tabs | Dwie grupy współdzieliły animację | Stały layoutId | Unikalny useId instancji | Źródło poprawione; osobna wizualna kolizja nieweryfikowana |
| Tooltip | Brak opisu czytnika, Escape i widocznego focus | Brak ARIA/id/handler | Powiązanie opisu, Escape i focus outline | 3 silniki PASS |
| Dialog / overlay | Tab/focus wychodził na tło, brak fokusu pustego dialogu | Niepełna lista elementów i brak focus containment | Wspólny manager, select/fallback/top modal | 3 silniki fixture PASS |
| Natychmiastowy Escape | Widoczny modal nie reagował przed effect; focus ginął po commit | Listener po paint i zbyt wczesny powrót fokusu | useLayoutEffect przed paint, queueMicrotask po commit | Fixture3 silniki PASS; WebKit produkcji nadal odtwarza błąd |
| Menu mobilne | Callback resetował focus/scroll lock przy renderze | Zależność effect od zmiennej funkcji | Ref callback i wspólny manager | Final6 rzeczywiste menu mobilne w trzech silnikach PASS |
| Wyszukiwarka poleceń | Tab omijał przyciski, wyniki były div, puste strzałki dawały NaN | Przechwycenie Tab i modulo0 | Natywne przyciski/Tab, nazwane kontrolki, obsługa pustego zbioru | 3 silniki fixture PASS |
| Kopiuj NIP | Pozorny sukces przy odmowie clipboard; klik trafiał w wiersz | Brak await, dekoracja przesuwała przycisk26px | Obsługa błędu i stała przestrzeń dekoracji | 30 rzeczywistych kliknięć i failure fixture PASS |
| Powiadomienia | Pozorny sukces „przeczytane” przy awarii; overlay bez spójnego focus | Tłumienie obietnic, brak semantyki | allSettled, disabled podczas zapisu, error; nazwany modal | Fixture PASS; pełny backend osobno |
| PageGuide | Klikalny div, brak nazwy, crash przy niedostępnym storage | Brak native button / catch | Named button, expanded/controls i odporność localStorage | 3 silniki fixture PASS |
| Button loading | Czytnik nie otrzymywał busy | Tylko ukryty spinner | aria-busy i disabled | Fixture PASS |
| Przełącznik firmy | Escape tracił focus, brak controls | Usunięcie aktywnej opcji | Focus triggera i identyfikator panelu | Final6 desktop1280: rzeczywista zmiana obu firm myszą/klawiaturą i Escape z przywróceniem fokusu PASS w trzech silnikach; inne warianty pozostają nieweryfikowane |
| Etykiety formularzy konta / faktury | Ikony i pola bez powiązania/nazwy | Brak id/htmlFor/aria-label | Powiązane pola, autocomplete, stan przycisków, komunikaty | Final6 automatyczny axe obserwowanych formularzy PASS; pozostałe warianty/stany i odsłuch czytnika nieweryfikowane |
| Kontrast / nazwa dostępności | Poprzedni axe wskazał naruszenia na publicznych i prywatnych ekranach | Kolory i ARIA nie spełniały kontraktu czytelności/nazwy | Bieżące poprawki tokenów i kontrolek | Final6 axe: 90 tras / 180 ekranów, zero automatycznych naruszeń; 86 ekranów z grupami do ręcznej oceny pozostaje ograniczeniem |
| Portal prawidłowej faktury/oferty przy 320 px | Faktura miała 401 px, oferta 332 px i nabywca wychodził poza ekran; odrębny wariant z długim numerem 357 px | Sztywne dwie kolumny z minimalną szerokością treści, padding 40 px, podsumowanie 280 px i niezawijane akcje | [Renderer portalu](../../../src/app/portal/[token]/page.tsx): jedna kolumna i padding 20 px na telefonie; minmax(0,1fr)/min-width0, podsumowanie w granicach rodzica, zawijanie akcji i długich danych. Wydruk zachowuje dwie kolumny i 40 px | Final6 portal faktury/oferty w trzech silnikach bez błędów układu; rzeczywisty A4: 4 krótkie dokumenty, 92 kontrole, 8 faktycznie obejrzanych renderów PDF PASS |
| Portal — banner cookies w wydruku | Pierwsza wizyta drukuje banner i trzy przyciski zgody we wszystkich czterech PDF-ach A4 | Banner oraz overlay ustawień prywatności nie miały reguły ukrycia przy drukowaniu | No-print bannera i opcjonalne hideOnPrint wyłącznie dla dialogu ustawień cookies; po powrocie z print kontrolki są widoczne na ekranie | Final6 PASS: 24 scenariusze print-media/fokusu cookies w trzech silnikach; 4 rzeczywiste przypadki PDF A4 Chromium bez bannera, 92 kontrole i 8 obejrzanych renderów. Inne warianty wydruku nieweryfikowane |
| Banner cookies — ustawienia i powrót fokusu | Po otwarciu ustawień z bannera i Escape fokus wracał do BODY zamiast przycisku „Ustawienia” | Otwarcie dialogu odmontowuje banner. Dialog zapamiętuje trigger, który jest już odłączony; po zamknięciu pojawia się nowy węzeł przycisku | Ref przycisku bannera oraz jego odrębny powrót fokusu po layout/commit; ustawienia otwarte ze stopki zachowują zwykły powrót Dialog | Final6 PASS: Escape i Zamknij przywracają fokus nowemu triggerowi, oba motywy i trzy silniki; 12 powrotów fokusu w grupie 24 scenariuszy cookies |
| Księgowość — ostrzeżenie szkiców | „Do sprawdzenia · Szkice faktur: 1” miało kontrast 3,18:1 zamiast 4,5:1 | PeriodPanel: jasny amber-600 (#d97706) na białym tle, tekst 14 px | Jasny amber-700; ciemny amber-400 zachowany | Final6 axe rzeczywistego `/accountant` w obu motywach PASS; zachowane grupy ręcznej oceny innych elementów |
| Klient przyjęcia zaproszenia | Prawidłowy link nie renderował odbiorcy/firmy; sam test POST nie wykrywał błędu klienta | Klient oczekiwał zagnieżdżonych invitation/company/currentUser, API zwraca płaskie DTO; publiczny provider pomijał odczyt sesji | [Strona zaproszenia](../../../src/app/invite/[token]/page.tsx) waliduje płaskie DTO, odświeża aktora tego procesu, używa boolean acceptTerms i companyId odpowiedzi; abort przy zmianie tokena, bez zagnieżdżonego przycisku w linku | Final6 PASS: 4 rzeczywiste scenariusze istniejącego/nowego/zalogowanego/obcego odbiorcy na każdy silnik, 12 łącznie; HTTP i axe osobno PASS |
| Portal — niebieskie akcje i tekst tabeli | Niebieski tekst/przycisk miał kontrast 4,09:1; w ciemnym motywie jasny tekst tabeli na białej karcie 1,07:1 | Kolor #0284c7 za jasny dla bieli; biały renderer dziedziczył globalny foreground ciemnego motywu | [Portal](../../../src/app/portal/[token]/page.tsx): #0369a1 dla niebieskiego tekstu/tła, własny #0f172a na białej karcie i sekcji oferty | Final6 axe prawidłowej faktury i oferty w obu motywach PASS |
| Link prywatności w zaproszeniu | Axe zgłosił link-in-text-block w prawidłowym formularzu | Link odróżniał się od akapitu tylko kolorem | Stałe underline/underline-offset-2; zachowana treść i adres | Final6 axe prawidłowego formularza w obu motywach PASS |
| Koszty — tabela i ukryty Select na telefonie | Dokument 683 px przy ekranie 320 px mimo przewijanej tabeli w kontenerze 286 px | Ukryty absolutny native select 1 px miał statyczną pozycję x=681,5 poza klipem; nie miał lokalnego containing block | [Select](../../../src/components/ui/select.tsx) ma left/top0; [tabela kosztów](../../../src/app/(app)/expenses/page.tsx) ma position:relative, nazwany region i tabIndex0. Szeroka tabela nadal dostępna przewijaniem | Final6 PASS: 36 ekranów kosztów i zespołu, trzy silniki, oba motywy i szerokości 320/768/1280; zero overflow i naruszeń axe |
| Zespół — oczekujące zaproszenie na 320 px | Strona 333 px, status kończył się na 332,73 px; długi email wychodził poza kartę | Niezawijany flex adresu, roli i statusu | [Zespół](../../../src/app/(app)/settings/team/page.tsx): flex-wrap, min-w-0 i break-all adresu | K1 PASS w 36-ekranowej regresji kosztów i zespołu, zero overflow |
| Zespół — oczekiwanie na akceptację | Status 10 px miał kontrast 2,14:1 zamiast 4,5:1 | Amber-500 na białym tle | Amber-700 jasny / amber-400 ciemny | Final6 PASS: axe rzeczywistego oczekującego zaproszenia w obu motywach i trzech silnikach |
| Zespół — kopiowanie zaproszenia | Odmowa lub brak clipboard dawały fałszywy sukces i nieobsłużone odrzucenie | writeText bez await/catch | Await, wyczyszczenie starego potwierdzenia, toast błędu dla odmowy/braku API; sukces dopiero po rozwiązaniu obietnicy | Final6 PASS: 9/9 rzeczywistych scenariuszy trzech silników: sukces, odmowa i brak Clipboard API |
| Oferty — termin ważności | Mały tekst terminu nie miał wystarczającego kontrastu | Dodatkowa opacity75 na semantycznym kolorze muted | Pełny kolor tekstu; usunięto tylko dodatkową przezroczystość | Final6 axe zapisanej oferty i jej portalu w obu motywach PASS |
| Koszty — aktywny filtr | „Wszystkie statusy” było białe na białym bez aktywnego tła; automatyczne axe nie zgłosiło naruszenia | background:var(--primary) używał samych kanałów HSL jako pełnego koloru i był nieważnym CSS; stały biały tekst | Poprawne hsl(var(--primary)) i hsl(var(--primary-foreground)), nieaktywny muted-foreground; aria-pressed | Final6 PASS: trzy silniki × dwa motywy × cztery filtry = 24 stany; rzeczywiste computed-style, kontrast, listy danych i klawiatura. Pierwszy poprawiony helper miał nazwę logu final5, lecz działał na final4; końcowy wynik pochodzi z nowej pełnej macierzy final6 |
| Prywatna nawigacja — automatyczny prefetch i RSC | W tle pobierano wiele tras; final5 zatrzymał WebKit na pięciu pageerror RSC do reminders/ksef/help/settings/account/invoices/recurring | Domyślny prefetch NextLink pobiera trasy przed wyborem użytkownika. Odczyt rzeczywistego buildu final5: po 13 początkowych prefetchy RSC w trzech silnikach; przy trzech cyklach nawigacji WebKit odtworzył cztery pageerror związane z anulowaniem pobrań. Niezależny minimalny serwer odtworzył diagnostykę adaptera WebKit przy pagehide/unload nawet przy obsłużonym TypeError; brak window.error/unhandledrejection. Nie uznano tego za nieobsłużoną obietnicę aplikacji ani dowód błędnego CORS | Wyłączono domyślny automatyczny prefetch 99 linków w 39 plikach, dodając prefetch=false tylko tam, gdzie nie było jawnej polityki; account topbara także nie prefetcheuje. Świadomy warmup formularza faktury po focus/pointer pozostaje z pominięciem SaveData/2G | Final6 pełna regresja trzech silników PASS; pomiar ruchu/intencji/SaveData/2G ma własny dowód. Nie wyciszono obserwatora błędów |

Osobna [diagnoza WebKit](webkit-navigation-causal-final6.md) zachowuje pojedynczą diagnostykę z testu ruchu final6 zamiast nadpisywać ją zerem. Dwanaście cykli aplikacji odtworzyło siedem takich komunikatów bez zaobserwowanego DOM error/unhandledrejection; sentinele potwierdziły rejestrator. Minimalny serwer tego samego pochodzenia odtworzył dokładny komunikat mimo obsłużonej obietnicy, a adapter promuje wpis konsoli JavaScript do pageerror. Nie instrumentowano wewnętrznego catch aplikacji; same znikające zdarzenia DOM nie wystarczają do klasyfikacji. Dowód dotyczy tej konkretnej diagnostyki przy zamykaniu dokumentu, bez globalnego filtra i bez złagodzenia sprawdzania żywej strony. Historyczny STOPPED final5 pozostaje STOPPED.

Dokładne scenariusze, reprodukcja przesunięcia przycisku i zakres syntetycznych store: [ui-accessibility.md](ui-accessibility.md). Pomiary overflow przed naprawą, kontrastu ostrzeżenia i granice testu wydruku: [portal-responsive.md](portal-responsive.md). Publiczne nazwy, kontrast i osobny pomiar pikseli gradientu: [public-accessibility.md](public-accessibility.md). Rzeczywiste koszty/zaproszenia, schowek i ręczny odczyt niewidocznego filtru: [private-responsive.md](private-responsive.md); pozytywny klient zaproszeń: [invitation-review.md](invitation-review.md).

## SEO, GEO/AEO i eksporty Search Console

Dołączone `Problemy krytyczne.csv` i `Problemy niekrytyczne.csv` zawierają **wyłącznie nagłówki**. Wykres dla **4 października** pokazuje **2 zaindeksowane strony, 0 niezaindeksowanych i 0 wyświetleń**. Wcześniejsze pola indeksacji są puste — pozostają nieznane. Eksport nie zawiera URL-i, zapytań, kliknięć ani pozycji. Nie ustanawia ani przyczyny problemu konkretnej strony, ani obecności w TOP 5.

| Element | Problem | Przyczyna | Poprawka u źródła | Status / zakres |
| --- | --- | --- | --- | --- |
| 5 stron prawnych | Brak canonical i podwójna marka tytułu | Oddzielne niepełne metadata | Wspólny absolutny tytuł/canonical/OG/Twitter | Test metadanych PASS; produkcja nadal starsza |
| Daty sitemap | Katalog porównań miał starszą datę niż renderowane artykuły | Stała data katalogu | Najnowsza rzeczywista data katalogu/artykułów, bez dat wymyślonych | Jednostkowo PASS |
| llms | Surowe slugi, niezależna ręczna lista cen i treści | Zduplikowany plik | Generowana przy buildzie lista 29 artykułów z opisami, canonical, cenami i ograniczeniami | Kompletność PASS; brak gwarancji cytowań AI |
| Źródło Comarch Betterfly | Link prowadził do ogólnej firmy | Nieprecyzyjny URL | Zweryfikowana oficjalna strona produktu i realna data sprawdzenia | GET200 + tytuł zapisane |
| Publiczny prefetch | Pobierano kolejne poradniki podczas czytania jednej strony | Domyślny NextLink prefetch | prefetch=false w wspólnych linkach/kartach/CTA | Kod poprawiony; KB/ms po tej zmianie niewymierzone |
| VAT dużych wartości | Podatek/brutto wyższe o grosz dla konkretnej dużej kwoty | Number tracił precyzję mnożenia i formatowania | Dziesiętne parsowanie, BigInt, signed rounding, bezpieczny zakres | Konkretny przypadek /4 stawki /2 kierunki PASS |
| Kalkulator overflow / a11y | Wynik przekraczał zakres, brak aria-invalid/opisu | Sprawdzano tylko wejście | Kontrola wszystkich wyników i powiązany błąd/limit długości | Jednostkowo i final6 DOM PASS: 18 scenariuszy każdego z trzech silników, 54 łącznie |
| Audyt indeksowanych stron | Lista pomijała prawne i kompletność llms | Ręczny niepełny katalog testów | Wszystkie 46 indeksowanych stron, canonical/H1/sitemap/discoverability | PASS końcowego renderowanego HTML: 46 publicznych URL-i; sprawdzenie live Google osobno |

Nie dodano zmyślonych recenzji, ocen, klientów, fraz z rzekomymi wolumenami ani danych firmy. Przykłady, autorstwo, daty, ograniczenia i źródła odpowiadają treści. Szczegóły CSV i poprawki: [seo-review.md](seo-review.md), [search-console-export.json](search-console-export.json).

Po odnowieniu Netlify: potwierdzić 200 publicznego cennika i porównań, prawdziwe404 nieznanego adresu, canonical stron prawnych oraz 46 URL-i sitemap. Następnie ponownie odczytać sitemap w Search Console i sprawdzić reprezentatywne adresy w Inspekcji URL. Do oceny widoczności potrzebny jest raport Skuteczności: zapytania/strony/kraj/urządzenie/pozycje w kolejnych tygodniach. Indeksacja i llms nie gwarantują TOP 5 ani cytowań.

## Wydajność — aktualne final7 i granice celu

Pomiary final7: [WYNIKI-final7-2026-10-09.md](../../performance/WYNIKI-final7-2026-10-09.md), [pełne dane](../../performance/results-final7-2026-10-09.json). Wszystkie serie wykonano kolejno po QA na tym samym EtIK/202ad9a snapshot, ze sprawdzeniem tożsamości przed i po. Nie przeniesiono mediany 97 ani 1419 żądań z final6.

| Twardy próg | Wynik aktualnego final7 / status |
| --- | --- |
| TTFB <100 ms | Dokument lokalnie mediana 11,2 ms. API przy 20 wykonawcach p95 538,26 ms — cel niespełniony; Internet/edge/cold-start niezweryfikowane |
| LCP <1 s | CDP 588/652/644 ms, mediana 644 ms. Lighthouse mediana 2432,1 ms — cel niespełniony w tym profilu; field niezweryfikowany |
| INP <100 ms | Field niezweryfikowany; EventTiming 56/40/56 ms to pojedyncza zaprogramowana interakcja, nie INP |
| CLS =0 | Wszystkie 6 prób CDP/Lighthouse ma 0; field niezweryfikowany |
| Lighthouse Mobile 100 | 97/95/95, mediana **95** — cel niespełniony |
| Początkowy JS <100 KB gzip | **116653 B / 113,92 KiB**, ponad 100000 B — cel niespełniony |
| Tysiące jednoczesnych użytkowników | Niezweryfikowane. 1000 kont/30000 seed faktur to rozmiar fixture; rampa miała maks. 20 wykonawców |

Rampa 232/535/550 żądań przy 1/5/20 wykonawcach zliczyła 1317, zero błędów. Maksymalny etap: 89,46 req/s, p95 całości 538,5 ms. 136 udanych utworzeń odpowiada dokładnie 136 zapisom i rezerwacjom numerów. Rozgrzanie PDF i sondy nie wchodzą do liczników rampy. To lokalny zamknięty model bez dostawców zewnętrznych i produkcyjnego Netlify/Atlas, nie SLA. Wpływu aktualizacji zależności nie przedstawiono jako zysku czasu; różnice między seriami mogą wynikać ze zmienności. Po wdrożeniu potrzebne są nowe Lighthouse/DevTools/PageSpeed Insights/WebPageTest dla Polski/mobile, first/repeat, nagłówki/protokoły, fizyczny słaby telefon i RUM p75 za zgodą.

## Wydajność — historyczne pomiary final6 i priorytety według efektu/wysiłku

**Historyczny quiet lab z 9 października dotyczy dokładnie final6 `21f_lBaQA8Ww--YiYgN1t` / źródeł `14e1b8e…`.** CDP3, Lighthouse3 i izolowany load wykonano kolejno, po zakończeniu przeglądarek i innych testów, ze sprawdzeniem tożsamości przed/po każdej serii. Wszystkie próby, profile, host, rozmiary, indeksy i SHA surowych raportów: [results-2026-10-09.json](../../performance/results-2026-10-09.json). Gotowy kod/config i komendy Lighthouse/DevTools/WebPageTest/PageSpeed Insights: [WYNIKI-2026-10-09.md](../../performance/WYNIKI-2026-10-09.md).

| Priorytet | Zmiana / pomiar i gotowy kod | Efekt udokumentowany | Granica dowodu |
| --- | --- | --- | --- |
| 1 | Automatyczny prefetch linków wyłączony; warmup tylko po intencji — kod A aktualnego raportu | Prywatny dashboard w trzech silnikach: RSC13→0, JS26→22, gzip szacowany z treści348 893→322 964 B, czyli −25 929 B/−7,43%; 33 scenariusze intencji/SaveData/2G i 36 asercji PASS | [Baseline](private-prefetch-before-final5.json), [ruch final6](private-prefetch-traffic-final6.json), [review](private-prefetch-review.json). Prywatny desktop+3s, standardowy gzip; brak izolowanego zysku LCP/ms. Raw diagnostyka WebKit zachowana |
| 2 | Projekcje bootstrap/list, indeksowany lookup i brak pełnych archiwów na start — kod B/F | Aktualna sonda pełnego bootstrapu65 637 B/26,44ms; plan numeracji bada1 dokument. Przy20 wykonawcach p95 bootstrap188,9ms, create586,21ms | Istniejące mechanizmy; nowy fixture1000×30 nie ma dopasowanego baseline. Nie wymyślono osobnego zysku indeksu/ms ani nie osłabiono atomowości numerów/wpłat |
| 3 | CDN/hash immutable, SSG, kompresja/keep-alive i prywatne no-store — kod C | Hashowane zasoby mają roczny immutable; publiczne HTML i llms nie wymagają bazy. Brotli zaobserwowano na starszym deployu | Nowy kod nie potwierdza aktualnego edge, HTTP/3,103 ani Brotli nowego wdrożenia. Prywatne dane/API/PDF nie trafiają do publicznego cache |
| 4 | Odroczone overlaye, fonty WOFF2/swap, inline CSS i SVG — kod C/D/E | Final6 publiczny start116 537 B gzip9, pobrane fonty59 132 B WOFF2,0 osobnych początkowych CSS; HTML50 244 B szacowanego gzip. CDP LCP mediana616ms | Brak dopasowanego zysku każdej grupy; CSS przeniesiony do HTML ma koszt, a startJS nadal przekracza100KB. Hero SVG/HTML nie daje fikcyjnego zysku AVIF zdjęcia |
| 5 | Dokładne liczniki eksportu zamiast pobierania pełnych katalogów | Brak cichego limitu1000, brak list do samego policzenia;1250 dokumentów zweryfikowano jednostkowo | Nowa zmiana poprawności/wydajności; osobny zysk ms/KB niewymierzony |
| 6 | Kontrolowany pilot i osobne pomiary field — aktualny load, OPS | 1000 kont/30 000 seed faktur, maks.20 wykonawców:101,96req/s, p95 całości474,99ms; 1419 żądań łącznie bez błędów.143 udane utworzenia=143 faktury=143 unikalne rezerwacje numerów | Liczność fixture nie oznacza1000 jednoczesnych użytkowników. Lokalny model zamknięty, rozgrzanyPDF, brak producentów/login-bcrypt i realnego Netlify/Atlas; nie jest to SLA |

| Twardy próg użytkownika | Wynik historycznego buildu final6 / status |
| --- | --- |
| TTFB<100ms | CDP dokument lokalnie:13,1/10,3/11,3ms, mediana11,3ms. p95API przy20 wykonawcach474,87ms; Internet/edge/cold-start i field niepotwierdzone |
| LCP<1s | CDP616/616/684ms, mediana616ms; Lighthouse2027,7/2423,92/2483,64ms, mediana2423,92ms. Spełnione tylko w profiluCDP, niespełnione w Lighthouse; field niepotwierdzony |
| INP<100ms | Niezweryfikowany w field. Próbki EventTiming40/64/40ms dotyczą jednej interakcji na próbę i nie są INP |
| CLS=0 | Wszystkie sześć prób CDP/Lighthouse ma0; field niezweryfikowany |
| Lighthouse mobile100 |98/97/95, mediana97 — cel100 nieosiągnięty |
| StartJS<100KB gzip |116 537B/113,81KiB — cel niespełniony. Prywatny dashboard także powyżej progu |
| Brak render-blocking zasobów |0 osobnych początkowych CSS; pozostają krytyczny inlineCSS i mały skrypt motywu. Nie zadeklarowano braku całej pracy blokującej parser |

**Starsze dane pozostają historyczne.** [WYNIKI-2026-10-08.md](../../performance/WYNIKI-2026-10-08.md) i [IMPLEMENTACJA-2026-10-08.md](../../performance/IMPLEMENTACJA-2026-10-08.md) opisują wcześniejsze buildy/fixture. Nowego load1000×30 nie przedstawia się jako przyspieszenia względem starego10×300. Odczyt starszej produkcji: [production-performance.json](production-performance.json), CDP LCP1832/1888/1516ms i EventTiming24–96ms z pojedynczym Escape272ms przez sesyjny proxy; to inny deploy/profil i brak fieldINP. Po wdrożeniu potrzebne są nowe Lighthouse/PageSpeed Insights/WebPageTest, region Polski, first/repeat, rzeczywiste nagłówki/protokoły, fizyczny słaby telefon oraz RUMp75 za zgodą.

Monitorowanie, backupy i bezpieczny pilot: [OPS-PILOT.md](../../OPS-PILOT.md). Ochrony danych oraz atomowości wpłat/numeracji nie poświęcono dla krótszej pozornej odpowiedzi.

## Problemy, których na produkcji jeszcze nie usunięto

| Element | Pozostały problem | Powód / dalszy dowód |
| --- | --- | --- |
| Wdrożenie main | Aktualna produkcja nie odpowiada nowym funkcjom i naprawom | Według użytkownika limit Netlify; nie aktywowano płatnego wdrożenia |
| Publiczny cennik i potwierdzenie email | HTTP307 do login | Wymagają aktualnego kodu produkcyjnego |
| Dwa nowe porównania | HTTP404 | Wymagają wdrożenia stron |
| Nieistniejący adres | HTTP307 do login zamiast 404 | Wymaga wdrożenia poprawki middleware |
| Strony prawne | Brak canonical | Wymaga wdrożenia metadanych |
| CSP Report-Only | 265 diagnostyk, dodatkowo9 oczekiwanych resource401 | Wymaga wdrożenia poprawki nagłówków; nie jest to czysta konsola |
| Natychmiastowy Escape w WebKit | Produkcyjny modal nie zamknął się po 5 s | Źródłowa naprawa managera wymaga wdrożenia; nie udaje się zdalnej naprawy |
| Health i sitemap | Brak revision; starszy zakres sitemap/llms | Nie można potwierdzić SHA ani zgodności produkcji z finalnym buildem |

Odczyt publiczny powtórzony **9 października** nadal potwierdza blokadę: `/cennik` kończy na `/login?next=%2Fcennik`; sitemap ma 43 adresy i pomija cennik. Strona główna, robots, llms i health odpowiadają 200; health deklaruje `db: ok`, ale nie udostępnia revision. To sześć nowych odczytów, nie powtórzenie pełnego crawl ani test zalogowanych użytkowników. TTFB 431–1596 ms zawiera sesyjny proxy i nie stanowi field metryki. Dowód: [production-readonly-2026-10-09.json](production-readonly-2026-10-09.json).

Wszystkie odpowiedzi, scenariusze i rozdzielenie błędu CA Firefox od błędu strony: [production-readonly.md](production-readonly.md), [production-readonly.json](production-readonly.json), [production-browser.json](production-browser.json).

## Jawnie niesprawdzone lub nienaprawione — z powodem

1. **Każdy mikroelement i każdy stan wszystkich wariantów UI.** Inwentaryzacja jest pełniejsza niż żywe scenariusze. Pozycje `unverified` zachowują ten status; fakt odwiedzenia strony nie zastępuje kliknięcia, błędu, loading i walidacji. Końcowy runtime musi mieć zgodny fingerprint.
2. **Poprawki na produkcyjnym panelu zalogowanego użytkownika i historyczne dane.** Nie udostępniono produkcyjnego konta testowego, a nowe wdrożenie pozostaje zablokowane limitem Netlify. Wszystkie zapisy testów odbywały się na izolowanej bazie.
3. **Rzeczywiste dostarczenie SMTP oraz MF/KSeF, Stripe, GUS, VIES, NBP, OCR i skaner antywirusowy.** Providerzy są blokowani lub zastępowani deterministycznymi atrapami. Nie wykonano realnych płatności, zgłoszeń ani wysyłek. PASS XML/PDF nie dowodzi przyjęcia dokumentu przez MF.
4. **Produkcja pod obciążeniem tysięcy użytkowników, worker/cron, RUM i SLA.** Brak odpowiedniej produkcyjnej próby i danych; odczyt zdrowia jednej bazy nie dowodzi przepustowości, failover czy globalnej kolejki.
5. **Aktywne backupy, alerty, odtworzenie produkcji i migracje.** Są instrukcje/testy izolowane; nie sprawdzono rzeczywistej konfiguracji operatora i offsite receipt na tej produkcji.
6. **Wszystkie fizyczne urządzenia i czytniki ekranu.** Chromium/Firefox/WebKit emulują rozmiary, nie konkretny Safari/iPhone ani słaby Android. Brak odsłuchu NVDA/JAWS/VoiceOver, Braille, wszystkich zoom i ustawień systemu; axe ma także pozycje do ręcznej oceny.
7. **Pełny pentest infrastruktury i brak wszystkich XSS/zero-day.** Zbadano konkretne autoryzacje, CSRF, parsery i ekspozycje; nie istnieje dowód bezpieczeństwa wszystkich możliwych wejść. Ścisła skryptowa CSP pozostaje osobnym wdrożeniem hash/nonce.
8. **Korekty zaliczek/końcowego rozliczenia i refundowanie ujemnych korekt.** Wymagają dedykowanej logiki księgowej. Obecny formularz/opłacanie jawnie blokuje te operacje zamiast tworzyć błędny dokument.
9. **Historyczne długie hasła bcrypt i stare logi tokenów.** Sufiks >72 bajtów nie istnieje w starym hashu; wcześniejsze logi dostawcy nie są naprawiane zmianą aplikacji. Nowe operacje mają walidację i linki fragment/no-referrer.
10. **Aktualne Google canonical, wszystkie zaindeksowane URL-e, frazy/rankingi i TOP 5.** Dostarczone CSV nie zawierają tych danych. Brak live GSC i niezależnych SERP/RUM. Poprawiona technika i treść nie gwarantują pozycji.
11. **Cytowania GEO/AEO w AI.** Brak powtarzalnego testu prawdziwych odpowiedzi AI; llms jest katalogiem pomocniczym, nie miernikiem ani gwarancją cytowań.
12. **Zakończenie Escape produkcyjnego Firefox.** Pierwszy odczyt był natychmiastowy; osobny retry zatrzymał się na WebKit. Nie przypisano Firefox PASS nieukończonego kroku.

13. **Historyczny final6: pojedynczy Firefox `InvalidStateError: Navigated away from page`.** Zachowano go podczas historii/nawigacji na `/dashboard` w ukończonym świeżym Firefox final6. Final7 nie odnotował tego wpisu; nie wyjaśnia to przyczyny historycznego komunikatu. Nie był fatalnym błędem aktywnej strony i wszystkie asercje testu przeszły, lecz nie odtworzono niezależnie konkretnej przyczyny ani producenta komunikatu. Nie wykonano hipotetycznej poprawki źródła i nie uznano tego za dowód braku błędów.

14. **Zgłoszenia bezpieczeństwa narzędzi deweloperskich.** Aktualizacja final7 usuwa trzy zgłoszone węzły z produkcyjnego podzbioru zależności, ale pełny audyt zachowuje 7 węzłów dev: 5 high i 2 moderate w łańcuchach braces oraz postcss-selector-parser. Nie znaleziono zgodnej poprawki braces w zbadanej gałęzi; proponowana przez npm migracja Tailwind 4 wymaga osobnej zmiany i regresji. Nie wykonano jej ani nie zadeklarowano kompletnego braku podatności. Dokładne wyniki: [dependency-followup-final7.md](dependency-followup-final7.md).

## Odtworzenie i materiał dowodowy

Podraporty zawierają konkretne skrypty regresji. Standardowe gates: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:mobile`; nie uruchamiać testów zapisujących na produkcji. `npm run verify` obejmuje build, TypeScript, lint, testy jednostkowe i integracyjne. Integracja wywołuje także `browserChecks`, chyba że ustawiono `SKIP_BROWSER_CHECKS=1`; `RUN_ALL_MOBILE_CHECKS=1`, `RUN_WEBKIT_CHECKS=1` i `RUN_FIREFOX_CHECKS=1` rozszerzają ten zakres o pełną macierz i pomocnicze scenariusze UI. W historycznym audycie final4 HTTP uruchomiono z `SKIP_BROWSER_CHECKS=1`, po czym wykonano osobny `test:mobile`. Poniższy 180-ekranowy audyt axe jest osobnym przebiegiem i nie jest częścią `npm run verify`. Inwentaryzację i runtime dowody aktualizuje `scripts/qa-inventory.mjs`, używając zgodnego fingerprintu.

**Osobny audyt axe:** użyto przypiętego `axe-core@4.14.0`, zainstalowanego poza zależnościami aplikacji. Bieżący przebieg uruchamiał tymczasowy runner `/tmp/faktura-qa-axe-final.mjs`; nie jest on częścią `npm run verify` ani plikiem repozytorium. Runner korzystał z izolowanej lokalnej repliki MongoDB, syntetycznej sesji i fixture oraz tworzył poprawne capability dla faktury, oferty i zaproszenia i trzy stany kosztów. Replikę i fixture usuwa nadrzędny izolowany harness.

Przykład odtworzenia po przygotowaniu własnych lokalnych fixture:

```sh
npm install --prefix /tmp/faktura-qa-tools --no-save --no-audit --no-fund axe-core@4.14.0
AXE_CORE_PATH=/tmp/faktura-qa-tools/node_modules/axe-core/axe.min.js \
QA_AXE_CONTEXT=/tmp/faktura-axe-context.json node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { auditAccessibilityRoutes } from './scripts/audit/accessibility-routes.mjs';
const { base, storageState, fixture } = JSON.parse(
  await readFile(process.env.QA_AXE_CONTEXT, 'utf8')
);
const report = await auditAccessibilityRoutes(base, storageState, fixture, {
  axePath: process.env.AXE_CORE_PATH,
});
assert.equal(report.summary.failedScreens, 0);
JS
```

Plik kontekstu trzeba przygotować w izolowanym runnerze: `base` to działająca kompilacja na loopback, `storageState` to stan Playwright z ważną syntetyczną sesją, a `fixture.invoiceId` wskazuje fakturę tego konta. `fixture.publicRoutes` musi zawierać rzeczywiście istniejące `/portal/<token-faktury>`, `/portal/<token-oferty>` i `/invite/<token-zaproszenia>`, z rekordami przypisanymi do syntetycznej firmy/kontrahenta i nieprzeterminowanym zaproszeniem. Zapisane koszty oraz szkice muszą uruchamiać badane statusy i ostrzeżenie księgowości. Sam brak rekordów zmienia ekran w pusty/błędny i nie odtwarza pozytywnego zakresu 90 tras. Narzędzie zapisuje wynik w `artifacts/qa/accessibility-routes.json`; `incomplete` pozostaje materiałem do oceny ręcznej.

Po finalnym przebiegu porównać źródła i katalog API, zachować JSON raportów przeglądarek i scenariuszy HTTP. Po realnym wdrożeniu powtórzyć mały odczytowy smoke produkcji, a pomiary Lighthouse/WebPageTest/PSI/DevTools prowadzić w tym samym profilu z jawnym oddzieleniem cold/warm i prawdziwych danych użytkowników.

Końcowe pokrycie final6 jest jawnie złożone z dwóch wykonań opisanych w `composition` pliku [browser-coverage-summary.json](browser-coverage-summary.json): ukończone Chromium/WebKit oraz oddzielny świeży Firefox (`QA_BROWSER_ENGINES=firefox`). Filtr jest opcjonalny; domyślny zakres nadal obejmuje trzy silniki. Firefox odnawia proces i konteksty między grupami viewportów i przed testami końcowymi, zachowując auth/localStorage i dotychczasowe dowody; nie zmieniono domyślnych ustawień historii/BFCache ani fatalnych kontroli żywej strony. Log zatrzymanego pełnego procesu i log ukończonego Firefox mają osobne SHA.
