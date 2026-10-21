# Import kartotek i przygotowanie miesiąca dla księgowości

## Zakres i audyt

Zlecenie obejmuje przenoszenie kontrahentów oraz produktów/usług z innego programu, wygodniejsze przygotowanie dokumentów dla księgowości i sprawdzenie istniejącego wdrożenia do pierwszej faktury.

Przed zmianą istniały: import kontrahentów z CSV (200 wierszy, mapowanie, podgląd i sprawdzanie NIP), wspólne zadania miesiąca, zamykanie okresu, portal księgowy i eksport ZIP faktur. Importu produktów i plików Excel nie było. Lista zadań była zagnieżdżona w osobistej liście kontrolnej, notatki korzystały z systemowego promptu, a paczka nie dołączała oryginałów kosztów ze skrzynki ani nie pokazywała spisu pominięć.

Pierwsze kroki już działają: gotowość wynika z zapisanych danych firmy oraz dokumentu, a nie z samego przeczytania przewodnika. Zachowano ten przepływ, w tym rozdzielenie szkicu/podglądu od rzeczywistej wysyłki do KSeF. Poprawiono jedynie semantykę grupy wskaźników kroków, wykrytą przez axe. Nie dodano drugiego onboardingu.

## Import

- Wspólny kreator na stronach **Kontrahenci** i **Produkty / Usługi**: wybór pliku, dopasowanie kolumn, podgląd i jawne potwierdzenie importu.
- CSV UTF-8/BOM i Windows-1250, separator średnik/przecinek/tabulator; Excel `.xlsx`, także z kompresją DEFLATE, współdzielonymi i wieloczęściowymi ciągami tekstowymi oraz wieloma arkuszami. Można wybrać kolejny arkusz również przy pustym pierwszym.
- Automatyczne propozycje kolumn, oznaczenie pól obowiązkowych, zakaz przypisywania jednej kolumny do kilku pól, próbka danych i raport każdego wiersza. Zmiana mapowania usuwa wcześniejsze zatwierdzenie podglądu. Wzór oraz raport można pobrać jako CSV.
- Podgląd nie zapisuje kartotek. Import dodaje poprawne nowe rekordy i pomija wiersze błędne lub powtórzone; nigdy nie nadpisuje istniejącej kartoteki.
- Kontrahenci: dotychczasowa walidacja polskiego NIP i wykrywanie duplikatów NIP. Produkty/usługi: SKU bez rozróżniania wielkości liter; przy braku SKU znormalizowana nazwa. Powtórzenie importu nie dodaje ponownie tych samych pozycji. SKU jest identyfikatorem, więc różne SKU mogą mieć tę samą nazwę.
- Cena wymaga poprawnej liczby nieujemnej, najwyżej dwóch miejsc po przecinku i zakresu do 999 999 999,99 PLN. Polski przecinek i spacje grupujące są obsługiwane; tekst po liczbie, zapis wykładniczy, brak ceny i inne waluty są odrzucane. Stawka VAT jest jawna i sprawdzana przez istniejący parser aplikacji. Stanów magazynowych nie importuje się przy tej operacji.
- Zapis ponownie sprawdza uprawnienie `canIssueInvoices` i duplikaty w transakcji zabezpieczonej blokadą firmy. Równoczesne importy nie tworzą drugiej pozycji; konflikt transakcji może wymagać ponowienia. Zmiana firmy czyści plik i podgląd, a spóźniona odpowiedź nie wypełnia drugiej firmy.

### Granice formatu i bezpieczeństwo

200 wierszy, 30 kolumn; CSV do 256 KB, XLSX do 2 MB, do 20 arkuszy i 200 części archiwum. Kontrolowany jest rzeczywisty strumień body także bez Content-Length. Pliki Excel nie są wypakowywane na dysk. Kontrolowane są rozmiary części i całości po dekompresji, CRC, ścieżki archiwum i odwołanie do arkusza. Nie wykonuje się formuł, makr, zewnętrznych odwołań ani pobrań. Formuły w wybranym arkuszu, błędy komórek, typ logiczny oraz numeryczne daty/czasy są odrzucane, aby nie przeliczać ich na ceny. Starszy `.xls` należy zapisać jako `.xlsx` albo CSV.

Ten import nie przenosi historii faktur, plików księgowych ani kontrahentów bez polskiego NIP. NIP, SKU i kody pocztowe należy przygotować jako tekst, aby Excel nie usunął zer przed eksportem. Przy dużej kartotece plik trzeba podzielić na partie. Nie zadeklarowano natywnych formatów importu konkretnych konkurencyjnych programów.

## Miesiąc do rozliczenia

- Panel i wspólna lista są dostępne od razu na stronie **Księgowość & Współpraca**, nad podsumowaniami i eksportami. Osobista lista została zachowana osobno.
- Jeden widok pokazuje zgłoszone brakujące dokumenty, nieopracowane pliki dodane do skrzynki w danym miesiącu, dokumenty bez pełnego rozliczenia według statusu płatności oraz koszty bez wskazanego źródła. Linki prowadzą do dokumentów lub zadań; szczegóły pokazują pierwsze 10 przy zachowaniu pełnego licznika.
- Informacje o płatnościach i źródłach nie dodają nowych blokad zamknięcia. Gotowość i zamykanie okresu nadal korzystają z dotychczasowych reguł. Ukończone kontrole są zebrane w rozwijanej sekcji; wymagające działania pozostają widoczne.
- Wspólna lista ma filtry: do zrobienia, brakujące dokumenty, przypisane do mnie i wszystkie. Zachowano odpowiedzialnych, wersjonowanie, notatki i audyt. Notatka oraz potwierdzenie usunięcia korzystają ze wspólnych dialogów. Odrzucenie odczytu dostępu usuwa poprzednią listę ze stanu interfejsu.
- Wybrany miesiąc przechodzi do pulpitu księgowego i z powrotem. Pobieranie ZIP w portalu używa istniejącego potwierdzenia tożsamości, zamiast prowadzić do surowej odpowiedzi API wymagającej ponownego uwierzytelnienia.

## Paczka dla biura rachunkowego

Dotychczasowe CSV, zapisane XML KSeF/UPO oraz wizualizacje PDF pozostają. Dodatkowo paczka może zawierać oryginały kosztów z tej samej firmy, powiązane z kosztami okresu i mające pozytywny wynik skanera. Sprawdzane są aktualne powiązanie, typ, rozmiar i zapisany skrót treści. Pliki bez potwierdzenia, w kwarantannie albo z niespójnymi danymi są pomijane z informacją w raporcie. Nie pobiera się zewnętrznych adresów załączników.

Nowe pliki:

- `oryginaly-kosztow.csv`: informacja o każdym koszcie i przyczynie braku jego oryginału;
- `zawartosc-paczki.csv`: spis dołączonych plików i rozmiarów;
- `przygotowanie-miesiaca.txt`: stan przygotowania, informacje o brakach, płatnościach i znaczeniu eksportu.

Zachowano limit 100 faktur / 500 wydatków; nowe limity wynoszą 20 MB oryginałów i 30 MB danych paczki. Uprawnienie do firmy jest sprawdzane ponownie po przygotowaniu eksportu. Pobranie nie oznacza przekazania plików do biura, zamknięcia miesiąca, złożenia deklaracji ani zmiany statusów dokumentów. Paczka jest bieżącym odczytem, a nie niezmiennym snapshotem księgowym. Przy braku skanera oryginały bez pozytywnego wyniku pozostają poza paczką, z wyraźną informacją w spisie.

## Pomiary wysokości przy ładowaniu

Podczas testów WebKit zgłosił ostrzeżenie ResizeObserver. We wspólnym `LoadingReveal` zapisy wysokości w reakcji na zmianę rozmiaru przeniesiono do kolejnej klatki, poza dostarczanie powiadomień obserwatora; zaplanowane pomiary są anulowane przy sprzątaniu. Pierwszy pomiar nadal jest synchroniczny. Dodatkowy scenariusz zatrzymuje odpowiedź podsumowania, zmienia szerokość ekranu i sprawdza zachowanie miejsca szkieletu po wyświetleniu danych. Nie dodano filtrowania błędów przeglądarki.

## Weryfikacja

- `npm test`: 704/704 oraz osobna grupa 7/7. W tym 15 nowych testów importu i kompletowania paczki: ceny bez cichego przeliczania, duplikaty, kompresja, tekst i arkusze Excel, formuły/makra, CRC, rozmiary, daty/typ logiczny, limity strumienia, źródła dokumentów i rozdzielenie informacji od blokad zamknięcia.
- `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`: sukces. Build kontrolny: `sH_djlU-gNmUbvjoVFtbJ`.
- Chromium i WebKit: po 13 grup scenariuszy i 15 zrzutów/skanów axe WCAG 2.2 AA; zero błędów strony i naruszeń w końcowych przebiegach. Szerokości 1440, 768 i 390 px, jasny/ciemny motyw oraz dodatkowa zmiana szerokości przy wstrzymanej odpowiedzi danych. Sprawdzono rzeczywisty import CSV/XLSX, zapis ceny, raport i ZIP z oryginałem, notatki, przypisanie, filtry, ukończenie, anulowanie usunięcia, zmianę firmy, zachowanie miesiąca i istniejący przewodnik.
- Nowy audyt HTTP: 37 kontroli, w tym podgląd bez zapisu, powtórzenie i równoczesny import, odwołanie uprawnień, izolacja firm, pobieranie oryginału, pominięcie kwarantanny i wymagane potwierdzenie tożsamości.

`npm run test:integration` z włączoną częścią przeglądarkową zakończył się sukcesem: 139 tras / 197 metod / 448 kontroli / 0 błędów, dodatkowo 42 kontrole bezpieczeństwa, 57 poprzednich przepływów rozliczeń, 35 kontroli ładowania oraz nowe 37 kontroli importu i kompletowania dokumentów. Przeszły również dotychczasowe scenariusze formularzy, korekt, płatności, uprawnień i zapisów finansowych. Końcowy pomiar `private-page-speed.mjs --catalog-size 1000 --budget-ms 2000` zakończył się sukcesem. Produkcyjny build, syntetyczna baza: 300 faktur, dwie firmy, 2001 kontrahentów i 2000 produktów; Chromium 390 × 844, CPU 4×, 80 ms i 10/5 Mb/s. Wszystkie 18 wejść/powrotów i 3 wyszukiwania zmieściły się w 2000 ms.

| Widok | Mediana gotowości danych i kontrolek | Maksimum |
| --- | ---: | ---: |
| Pulpit, pierwsze wejście | 1268,1 ms | 1303,3 ms |
| Faktury, pierwsze wejście | 1520,5 ms | 1530,1 ms |
| Pulpit, powrót | 277,8 ms | 352,3 ms |
| Faktury, powrót | 474,3 ms | 711,9 ms |

Wyszukiwanie: 476,4–518,8 ms. Zero błędów JavaScript i wywołań zewnętrznych dostawców. Warunki i pełne wyniki: [CATALOG-ACCOUNTING-PERFORMANCE.json](./CATALOG-ACCOUNTING-PERFORMANCE.json). To mała próba laboratoryjna, nie SLA prywatnych sesji produkcyjnych ani pomiar zimnego startu Netlify. Proces aplikacji jest uruchamiany i sprawdzany health przed pomiarem. Pomiar gotowości danych i handlerów nie jest gwarantowanym znacznikiem końca malowania ekranu. PDF i KSeF nie są mierzone. Metadane buildu wskazują bazowy commit `9f12bd5`, ponieważ kandydat był zbudowany przed zatwierdzeniem zmian. Nie przypisuje się różnicy względem wcześniejszych prób wyłącznie tej zmianie. Logi, wcześniejsze nieudane przebiegi i zrzuty: `/workspace/artifacts/catalog-accounting-20261021/`. Testy przeglądarkowe używają aktualnych nazw przycisków; asercji zapisu nie usunięto. Skan modalnego okna czeka na zakończenie jego animacji; żadna reguła axe ani błąd strony nie są wyłączone.

Nie dodano zależności runtime ani migracji. Nie zmieniono autoryzacji, subskrypcji, Stripe, wyliczeń faktur, podatków, wysyłki KSeF i generatora PDF. Eksport korzysta z istniejącego generatora.

## Publikacja

Powyższe testy wykonano przed wysłaniem na `main`. Po publikacji sprawdzany jest dokładny SHA produkcji i 25 publicznych kontroli HTTP, w tym anonimowe granice nowych endpointów importu i eksportu. Nie wykonuje się testowych zapisów do dokumentów klientów. GitHub Actions wymaga osobnego sprawdzenia po pushu; wcześniejsze uruchomienia były zatrzymane przez rozliczenie lub limit konta GitHub.
