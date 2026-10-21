# Mniej danych przy starcie i mniej pracy przeglądarki

Zakres: trzy usprawnienia zatwierdzone przez użytkownika — dane pobierane na potrzeby ekranu, ograniczenie pracy klienta i zbędnych transferów. Cel pomiarowy: gotowość danych oraz interaktywnych kontrolek pulpitu i listy faktur poniżej 2000 ms.

## Zmiany

- Pierwszy render aplikacji otrzymuje dane nawigacji, firm, uprawnień i powiadomień, bez katalogu produktów, kontrahentów i całej historii faktur. Pulpit i lista zachowują autoryzowane dane przygotowane na serwerze.
- Strona faktur pobiera najwyżej 30 dokumentów oraz wyłącznie kontrahentów powiązanych z tą stroną. Podgląd kolejnych stron, CSV, wiadomości i istniejące akcje zachowują właściwego nabywcę. Szczegóły dokumentu dostają własnego kontrahenta; bezpośrednie otwarcie faktury z innej dostępnej firmy nie wymaga pobrania całego katalogu.
- Pozostałe ekrany pobierają potrzebne katalogi i podsumowania dla wybranej firmy. Nie obcięto danych używanych do wyliczeń, finansów i faktur cyklicznych. Ustawienia firm zachowują przekrój wszystkich dostępnych firm. Istniejące listy wyboru w edytorze nadal korzystają z pełnego katalogu wybranej firmy, pobieranego dopiero przy wejściu do edytora.
- Wyszukiwarka poleceń pobiera kontrahentów i produkty po otwarciu, wyszukuje na serwerze i otrzymuje po 30 rekordów. Endpoint katalogu obsługuje osobne kursory obu zbiorów. Przerwane i spóźnione odpowiedzi nie przywracają wyników poprzedniej firmy.
- Formularz faktury obserwuje wyłącznie wykorzystywane fragmenty stanu. Aktualizacja powiadomień nie wymusza ponownego renderowania całego formularza. Formularz firmy i pomoc skrótów są pobierane przy pierwszym otwarciu.
- Zapis edycji korzysta z otwartego dokumentu i jego oryginalnej wersji również wtedy, gdy pobranie katalogu usunęło zbiorczą listę faktur ze stanu. Nie pobiera na nowo aktualnej wersji w celu obejścia konfliktu. Testy wykonują rzeczywisty preflight i zapis edycji faktury z drugiej firmy.
- Równoczesne pobrania tego samego bootstrapu współdzielą jedno żądanie w obrębie jednej instancji stanu użytkownika. Nie ma cache wyników po zakończeniu żądania. Reset i zmiany firmy unieważniają stare odczyty; szybkie A → B → A rozpoczyna nowy odczyt, zamiast dołączać do starego. Tworzenie firmy z tymczasowym identyfikatorem nie rozpoczyna odczytu nieistniejącej firmy.
- Odświeżenie podsumowania/listy nadal sprawdza aktualną sesję, uprawnienia i dane. Jeżeli pełny wynik się nie zmienił, prywatny ETag pozwala odpowiedzieć `304` bez ponownego przesyłania i przetwarzania dokumentów. `Cache-Control: no-store` pozostaje aktywny. To ograniczenie transferu i pracy klienta, a nie pomijanie kontroli dostępu ani cache danych księgowych.
- Podsumowania mają stabilne sortowanie walut, statusów, stawek i kontrahentów, również przy identycznych kwotach. Zmiana kolejności wyników grupowania nie powoduje zbędnego transferu. Nie zmieniono wartości wyliczeń.
- W otwartej wyszukiwarce poprawiono kontrast etykiet i obszar kopiowania NIP do 24 × 24 px. Przycisk pomocy skrótów ma jednoznaczną nazwę również na telefonie.

## Zgodność i bezpieczeństwo

Nie zmieniono logiki Stripe/subskrypcji, wysyłki KSeF, wyliczania podatków, generowania PDF ani zasad autoryzacji i kontroli wersji w API zapisu dokumentów finansowych. Zmiana odpowiedzi GET szczegółów dodaje kontrahenta dopiero po sprawdzeniu dostępu do dokumentu, z ograniczeniem do tej samej firmy lub powiązanego kontaktu historycznego. Zestawy testowe sprawdzają rozliczenia i korekty po zmianie sposobu ładowania.

Nie jest potrzebna migracja danych ani nowe indeksy do uruchomienia tych zmian. Starszy wariant `/api/data` zachowuje dotychczasową odpowiedź dla zgodności. Nie dodano zależności runtime, wyłączeń TypeScript/ESLint, filtrów błędów przeglądarki ani publicznego cache prywatnych danych.

## Warunki pomiaru

Produkcyjny build Next.js i syntetyczna, izolowana baza MongoDB; Chromium 390 × 844 px, dotyk, CPU spowolnione cztery razy, 80 ms opóźnienia sieci, 10 Mb/s pobierania i 5 Mb/s wysyłania. Zestaw standardowy ma 300 faktur i jednego kontrahenta. Większy zestaw ma dodatkowo dwie dostępne firmy, po 1000 kontrahentów i 1000 produktów w każdej: łącznie 2001 kontrahentów i 2000 produktów.

Każdy zestaw obejmuje 3 wejścia z pustą pamięcią przeglądarki na każdą trasę oraz po 6 powrotów przez prawdziwe linki klienta: 18 prób tras i 3 rzeczywiste wyszukiwania. Gotowość wymaga danych oraz naturalnych handlerów React na przycisku odświeżania lub wyszukiwarce. Lista wymaga wszystkich 30 wierszy/kart z linkami dokumentów, bez aktywnego ładowania. Wyszukiwanie obejmuje wpisanie frazy, debounce, odpowiedź serwera i jeden poprawny wynik.

Start procesu i inicjalizacja przez endpoint health są poza pomiarem. Są to pomiary laboratoryjne aplikacji, nie pomiar zimnego startu funkcji Netlify ani prywatnych sesji produkcyjnych. PDF, KSeF i dostawcy zewnętrzni są wykluczeni. Znacznik rAF określa obecność danych w DOM i gotowość handlerów; nie jest gwarantowanym znacznikiem zakończenia malowania ekranu. Mała próba nie jest SLA ani gwarancją maksymalnego czasu na dowolnym urządzeniu i łączu.

## Końcowe wyniki

Wszystkie **36 prób tras i 6 wyszukiwań** spełniło budżet poniżej 2000 ms. Oba końcowe uruchomienia skryptu z `--budget-ms 2000` zakończyły się sukcesem.

Większy katalog, porównanie w tych samych warunkach (mediana / maksimum):

| Widok | Przed | Po |
| --- | ---: | ---: |
| Pulpit, pierwsze wejście | 2036,3 / 2055,3 ms | 1401,5 / 1518,9 ms |
| Faktury, pierwsze wejście | 2166,1 / 2282,3 ms | 1601,4 / 1649,9 ms |
| Pulpit, powrót | 433,4 / 591,1 ms | 281,9 / 377,2 ms |
| Faktury, powrót | 626,7 / 881,2 ms | 462,1 / 667,4 ms |

Mediana gotowości przy pierwszym wejściu spadła o około **31% dla pulpitu i 26% dla faktur**. HTML pulpitu zmniejszył się z 3 351 400 B do około 85 KB, a listy z 3 692 296 B do około 427 KB. Są to rozmiary po rozpakowaniu; rzeczywisty transfer z kompresją jest osobno zapisany w JSON. Zysk obejmuje również mniej parsowania i mniej danych utrzymywanych w przeglądarce, a nie tylko pobieranie pliku.

Zestaw standardowy, wyniki końcowe (mediana / maksimum):

| Widok | Wynik |
| --- | ---: |
| Pulpit, pierwsze wejście | 1316,6 / 1583,1 ms |
| Faktury, pierwsze wejście | 1561,5 / 1598,9 ms |
| Pulpit, powrót | 282,8 / 360,7 ms |
| Faktury, powrót | 479,8 / 615,4 ms |

Wyszukiwanie: **462,6–504,3 ms** w większym katalogu oraz **460,6–490,0 ms** w standardowym. Najwolniejsza próba obu zestawów miała **1649,9 ms**.

Kod początkowy edytora według raportu Next.js zmniejszył się z około 241 do 234 kB. Kod początkowy pulpitu i listy pozostaje zbliżony (około 135 i 152 kB); największy efekt tej zmiany pochodzi z ograniczenia danych startowych i pracy nad nimi. Nie deklarujemy dużej redukcji JavaScriptu tych dwóch tras.

Przenośne wyniki: [STARTUP-PERFORMANCE.json](./STARTUP-PERFORMANCE.json). Metadane lokalnego baseline wskazują wcześniejszy build kandydata z poprzedniego zadania, zapisany przed commitem `9e1b7a6`; końcowe buildy wskazują `9e1b7a6`, ponieważ nowe zmiany były jeszcze niezatwierdzonym kandydatem. Dokładne identyfikatory buildów pozostają w JSON. Te metadane nie są deklaracją pomiaru konkretnego wdrożenia produkcyjnego.

Pełne logi i zrzuty: `/workspace/artifacts/startup-under2-20261021/`.

## Weryfikacja końcowa

- `npm test`: **689/689** testów oraz osobna grupa **7/7**. W tym 9 testów nowej polityki ładowania, współdzielenia wyłącznie trwających żądań, izolacji instancji, cofniętego dostępu, szybkiego A → B → A oraz edycji na oryginalnej wersji dokumentu bez zbiorczej listy faktur.
- `npm run lint`, `npm run typecheck`, `npm run build` i `git diff --check`: sukces. Końcowy build pomiarowy: `hMxDt1mPa07dR7GjygsVb`.
- Pełny `npm run test:integration`, z włączoną częścią przeglądarkową: sukces, **137 tras / 195 metod / 446 kontroli / 0 błędów**, dodatkowo 42 kontrole bezpieczeństwa produktu, 57 kontroli rozliczeń bankowych i podpowiedzi oraz **35 nowych kontroli HTTP** ładowania, stronicowania i walidatorów. Obejmuje cofnięcie członkostwa/sesji, zmienioną płatność, zmienionego kontrahenta i stabilność rankingu przy identycznych kwotach.
- Nowe scenariusze Chromium i WebKit: po **11 grup**, w tym rzeczywisty zapis edycji faktury drugiej firmy. Widoki 1440 i 390 px, jasny/ciemny motyw, po 11 zrzutów i skanów axe WCAG 2.2 AA. Końcowe wyniki: zero błędów strony i naruszeń.
- Dotychczasowa regresja faktur: po **26 grup** w Chromium i WebKit. Podpowiedzi i rozliczenia z poprzedniego zadania: po **9 grup** w obu silnikach. Wszystkie końcowe zestawy przeszły.
- Osobny test cyklu wyszukiwania: **26 regresji** Chromium, m.in. wycofany dostęp, błędy sieci, powroty między firmami i odrzucone nieaktualne dane serwerowe. Sukces.
- Podstawowy audyt przeglądarkowy zawarty również w pełnej integracji: logowanie na telefonie, nawigacja, wyszukiwanie/stronicowanie, menu klawiaturą, projekty/czas i szablony oraz **15 scenariuszy formularzy**, m.in. ułamkowa ilość, preflight, edycja, notatki dokumentu przyjętego, produkty, koszty, zlecenia, oferty, płatności i storno. Zero nieobsłużonych błędów JavaScript.

Historyczne testy dostosowano do już opublikowanego interfejsu: szczegóły są w menu, jego pierwszą pozycją nie jest edycja, szkic zapisuje przycisk „Zapisz szkic”, a oś czasu rozróżnia symulację demo od urzędowego UPO. Nie usunięto kontroli tych przepływów ani asercji finansowych. Runner przeglądarki przyjmuje ścieżkę do istniejącego Chromium; `browser-isolated.mjs --basic` pozwala osobno odtworzyć zestaw CI, a domyślny rozszerzony tryb pozostaje dostępny. Skan całego formularza rozpoczyna się od góry strony, aby losowy offset po automatycznym przewinięciu nie oceniał przycisku częściowo schowanego pod przyklejonym nagłówkiem. Żadna reguła axe nie jest wyłączona.

## Pozostała obserwacja i publikacja

We wczesnym przebiegu ponownie wystąpiło sporadyczne ostrzeżenie hydratacji React 418, odnotowane także przed tym zadaniem w raporcie redesignu. Nie ustalono jego przyczyny. Nie odtworzono go w osobnej diagnostyce 24 nawigacji w buildzie developerskim ani w końcowych zestawach przeglądarkowych i pomiarach. Nie dodano `suppressHydrationWarning` ani filtra takich błędów; wcześniejszy przebieg pozostaje zapisany jako nieudany. Wymaga dalszej obserwacji rzeczywistych sesji.

Powyższe testy wykonano przed wysłaniem zmian na `main`. Dokładny SHA wdrożenia i 20 kontroli HTTP produkcji są sprawdzane osobno po publikacji; nie wykonuje się zapisów do dokumentów klientów. GitHub Actions miał wcześniej blokadę uruchomienia związaną z płatnością/limitem konta — jego nowy status należy sprawdzić po pushu, niezależnie od udanych lokalnych testów i wdrożenia Netlify.

Odtworzenie pomiaru po produkcyjnym buildzie, z lokalnymi binariami MongoDB/Chromium:

```sh
node scripts/performance/private-page-speed.mjs --catalog-size 1000 --budget-ms 2000 --output /tmp/startup-large.json
node scripts/performance/private-page-speed.mjs --budget-ms 2000 --output /tmp/startup-standard.json
UI_AUDIT_SUITE=startup-efficiency MOTION_ENGINE=chromium node scripts/audit/ui-motion-isolated.mjs . /tmp/startup-ui
node scripts/browser-isolated.mjs --basic
```
