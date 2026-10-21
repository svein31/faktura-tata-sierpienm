# Sprawniejsza praca: pulpit, wystawianie faktur i rozliczenia bankowe

Data: 2026-10-21. Baza porównania: `bc1a6958558cdac0892bf456d59ad6afbd38fa12`.

## Wdrożone zmiany

1. **Pulpit i nawigacja.** Sześciomiesięczny wykres przychodów korzysta z niewielkiego SVG zamiast pobierania osobnego runtime Recharts. Zachowuje wartości netto/brutto, wybraną walutę, wartości ujemne, podpowiedzi i obsługę klawiaturą. Stała wysokość zapobiega przesuwaniu treści. Linki do pulpitu, listy i nowej faktury pobierają trasę przy najechaniu lub uzyskaniu focusu, z poszanowaniem oszczędzania danych. Zapytania o nierozliczone operacje bankowe najpierw ustalają identyfikatory połączeń danej firmy, zamiast wykonywać relacyjny filtr na całym zbiorze transakcji.
2. **Podpowiedzi w nowej fakturze.** Kontrahenci i pozycje pochodzą z maksymalnie 80 ostatnich wystawionych faktur sprzedaży wybranej firmy; ceny i warunki płatności są ograniczone do waluty i wskazanego kontrahenta. Użytkownik sam wybiera dane do wstawienia. Dodanie pozycji nie zastępuje ręcznie wpisanej usługi; ilość nowej pozycji wynosi 1. Warunki płatności stosuje osobny przycisk; termin jest liczony od aktualnej daty wystawienia. Podpowiedzi nie pojawiają się przy edycji, klonowaniu ani korekcie. Zmiana firmy usuwa wcześniejsze podpowiedzi, a spóźniona odpowiedź nie przywraca danych poprzedniej firmy.
3. **Zatwierdzane rozliczenia bankowe.** Import pozwala zatwierdzić lub odznaczyć każde proponowane rozliczenie. Można zaimportować same operacje bez księgowania płatności. Ręczne rozliczenie ma edytowalną kwotę, aktualne saldo dokumentu, pozostałe środki i historię przypisań. Przykład: przelew 150 zł można przypisać jako 100 zł do jednej faktury oraz 25 zł + 25 zł do drugiej. Faktura nigdy nie otrzymuje więcej niż jej pozostałe saldo; nadwyżka zostaje na operacji bankowej do kolejnego zatwierdzenia. Wydatki nadal wymagają pełnej kwoty swojego salda.

## Zabezpieczenia i zgodność

- Nowe podpowiedzi są prywatnym endpointem sesyjnym z kontrolą firmy i uprawnienia do wystawiania faktur; odpowiedzi nie są buforowane publicznie.
- Każdy zapis rozliczenia ponownie sprawdza firmę, uprawnienia, walutę, kierunek przelewu, aktualne saldo, wersję dokumentu i otwarty okres księgowy. Transakcja bazodanowa, blokada zapisu firmy oraz porównanie wersji chronią przed równoczesnym lub ponowionym rozliczeniem.
- Zmiana faktury po podglądzie importu powoduje odrzucenie całego zapisu; klucz importu pozostaje dostępny po wycofaniu transakcji. Cofnięcie uprawnień między podglądem a zapisem blokuje zapis.
- Kwoty są sprawdzane i porównywane jako bezpieczne całkowite grosze. Ułamki grosza, wartości ujemne i przekroczenia salda są odrzucane. Storno nie jest traktowane jako zapłata.
- Historia przypisań jest dopisywana, a pominięcie pozostałych środków nie cofa wcześniej zarejestrowanych płatności. Stare zamknięte operacje zachowują dotychczasową interpretację; nie dopisujemy im fikcyjnych wpisów historii.
- Nie zmieniono integracji Stripe, wysyłki KSeF, obliczeń podatkowych, autoryzacji ani generowania PDF. Nie wykonano żadnych zapisów do rzeczywistych dokumentów klientów podczas testów.
- Nie dodano zależności runtime. Komponenty używają istniejącego systemu UI. Przycisk pomocy ma teraz obszar 24 × 24 px, po wykryciu zbyt małego celu w kontroli dostępności.

## Pomiar gotowości danych i interaktywnych kontrolek

Poniżej **pomiar laboratoryjny produkcyjnego buildu**, a nie pomiar prywatnych kont na produkcji. Jedna firma, 300 syntetycznych faktur, Chromium 390 × 844 px, CPU spowolnione 4 razy, opóźnienie sieci 80 ms, pobieranie 10 Mb/s, wysyłanie 5 Mb/s. PDF, KSeF i zewnętrzni dostawcy są wyłączeni z pomiaru. Dla każdej trasy: 3 wejścia z nowym procesem i pustą pamięcią przeglądarki oraz 6 powrotów przez nawigację klienta. Start procesu jest poza pomiarem. Gotowość wymaga rzeczywistych danych oraz obsługi React na kontrolce; nie wystarcza sam szkielet.

| Widok | Przed: mediana / maksimum | Po: mediana / maksimum |
| --- | ---: | ---: |
| Pulpit, pierwsze wejście | 1252,1 / 1287,1 ms | 1236,3 / 1300,7 ms |
| Pulpit, powrót | 253,1 / 342,0 ms | 265,6 / 392,5 ms |
| Faktury, pierwsze wejście | 1484,2 / 1497,7 ms | 1592,1 / 1700,5 ms |
| Faktury, powrót | 438,7 / 584,2 ms | 462,0 / 613,3 ms |

Wyszukiwanie mierzone od rzeczywistego wpisania frazy do jednego poprawnego wyniku, łącznie z debounce i odpowiedzią serwera: **458,3 / 480,2 / 501,1 ms**. Wszystkie 18 prób tras i 3 próby wyszukiwania spełniły budżet **poniżej 4000 ms**. Skrypt kończy się błędem po przekroczeniu `--budget-ms 4000`.

Przed zmianą aplikacja również spełniała budżet w tych warunkach. Mała próba nie dowodzi skrócenia czasu gotowości; wyniki są zbliżone, a lista faktur ma nieco wyższe wartości. Korzyścią przebudowy wykresu jest usunięcie dodatkowego runtime i odroczonego placeholdera. Nie przypisujemy jej niezmierzonej redukcji bajtów ani gwarancji czasu na każdym urządzeniu i łączu. Prywatne sesje produkcyjne wymagają osobnego pomiaru danych rzeczywistych użytkowników.

Poprawiono także nieaktualny warunek testu: po wcześniejszym redesignie akcje szczegółów są schowane w menu. Pomiar wymaga teraz wszystkich 30 widocznych wierszy/kart z poprawnymi linkami identyfikującymi dokumenty, bez aktywnego ładowania; nie obniżono liczby wymaganych dokumentów.

## Weryfikacja

- `npm test`: **680/680** testów oraz osobna grupa **7/7**. W tym 11 nowych testów jednostkowych podpowiedzi, kwot i dopasowywania.
- `npm run lint`, `npm run typecheck`, `npm run build`: sukces, bez wyłączania reguł i sprawdzania typów.
- Pełny `npm run test:integration`: **136 tras, 194 metody, 444 kontrole, 0 błędów**, istniejące audyty bezpieczeństwa i 49 początkowych kontroli nowego przepływu. Po rozszerzeniu zakresu komplet **57 kontroli HTTP** nowego przepływu przeszedł ponownie w obu izolowanych zestawach przeglądarkowych, w tym test zamkniętego okresu, cofnięcia uprawnień i zmienionej wersji dokumentu.
- Chromium i WebKit: po **9 grup nowych scenariuszy**, rzeczywiste tworzenie szkicu i rozliczenia w izolowanej bazie, szerokości 1440 i 390 px, jasny i ciemny motyw, zmiana firmy. Po **11 zrzutów i skanów axe WCAG 2.2 AA** na silnik: zero wykrytych naruszeń, błędów strony i nieoczekiwanych wywołań dostawców.
- Regresja faktur: po **26 grup** w Chromium i WebKit, m.in. zapis, korekty, statusy KSeF, filtry, sortowanie, podgląd, zapisane widoki, wybór kolumn, rozdzielenie walut, przypięte kolumny i responsywność. Sukces w obu silnikach.
- `git diff --check`: sukces.

Pełne logi i zrzuty w środowisku roboczym: `/workspace/artifacts/workflow-speed-20261021/`. Przenośne podsumowanie pomiarów: [WORKFLOW-PERFORMANCE.json](./WORKFLOW-PERFORMANCE.json).

## Baza danych i wdrożenie

`BankTransaction.allocatedAmount` i `allocations` są opcjonalne. Nie wymagają uzupełniania wartości historycznych; wdrożenie obsługuje stare dokumenty bez tych pól. Migracja `023-bank-workflow-indexes` dodaje wyłącznie nieunikalne indeksy wyszukiwania operacji i połączeń; została wykonana w izolowanych bazach testowych.

**Nie potwierdzono uruchomienia migracji 023 na produkcji.** Obecny build Netlify nie wykonuje migracji danych, a środowisko tej pracy nie ma poświadczeń do produkcyjnej bazy. Kod działa bez nowych indeksów. Dostępny operator bazy może zastosować je istniejącym mechanizmem `npm run db:migrate`; nie dodano automatycznych zapisów indeksów przy żądaniach użytkowników ani nowego publicznego endpointu administracyjnego.

Lokalny build i pomiary wykonano na niezatwierdzonym kandydacie opartym o powyższy commit, dlatego metadane tych plików wskazują bazowy SHA. Po publikacji należy osobno sprawdzić dokładny SHA przez `/api/health`, dostępność stron publicznych, granice uwierzytelnienia oraz stan Netlify/GitHub Actions. Ten dokument nie deklaruje wyniku CI ani wdrożenia przed ich sprawdzeniem.

## Odtworzenie testów

Wymagane są systemowe Chromium/WebKit i MongoDB dla izolowanych baz oraz poprzedzający `npm run build`. Zwykłe testy integracyjne uruchamia `npm run test:integration`. Nowe scenariusze przeglądarkowe:

```sh
UI_AUDIT_SUITE=workflow-efficiency MOTION_ENGINE=chromium node scripts/audit/ui-motion-isolated.mjs . /tmp/workflow-chromium
UI_AUDIT_SUITE=workflow-efficiency MOTION_ENGINE=webkit node scripts/audit/ui-motion-isolated.mjs . /tmp/workflow-webkit
node scripts/performance/private-page-speed.mjs --budget-ms 4000 --output /tmp/workflow-speed.json
```

Ścieżki do lokalnych binariów można przekazać zmiennymi istniejących runnerów: `MONGOMS_SYSTEM_BINARY`, `PLAYWRIGHT_BROWSERS_PATH`, `CHROMIUM_EXECUTABLE` i `WEBKIT_EXECUTABLE` dla UI oraz `CHROMIUM_EXECUTABLE_PATH` dla benchmarku. Testy finansowe zapisują wyłącznie syntetyczne dane w bazach loopback, nigdy na produkcji.
