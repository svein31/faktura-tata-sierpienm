# Przestrzeń dokumentów — 19 września 2026

## Zaimplementowane i objęte weryfikacją

- Oferty, zlecenia i koszty otrzymują opcjonalne `companyId`. API weryfikuje aktualne członkostwo i uprawnienia przy zapisie. Widoki reagują na zmianę firmy; dokumenty historyczne bez przypisania pozostają w osobnym archiwum. Nie ma automatycznego przypisania danych do zgadywanej firmy.
- Zestawienie księgowe dotyczy wybranej firmy, miesiąca i jednej waluty. Pomija szkice, anulowane dokumenty i proformy; zakupy nie są sprzedażą. Powiązania KSeF zapobiegają podwójnemu liczeniu zakupu i odpowiadającego kosztu. CSV zachowuje walutę i stan rozliczenia, poprawnie cytuje dane i zabezpiecza formuły arkusza. To zestawienie dokumentów, nie kompletne wyliczenie podatku.
- Pulpit nie udaje aktywnego KSeF. Test połączenia korzysta z POST, wybranej firmy i uprawnień, nie udostępnia anonimowo tokenu serwera. Błąd startowego ładowania pokazuje przycisk ponowienia po jednej automatycznej próbie.
- `/documents`: prywatne oryginały PDF/JPG/PNG do 3 MB, aparat telefonu, deduplikacja SHA-256 w obrębie firmy, stronicowanie, wyszukiwanie nazw plików, podgląd i weryfikacja kwot. Akceptacja tworzy dokładnie jeden koszt w transakcji wraz z audytem; oryginał i zatwierdzone dane finansowe są chronione przed edycją/usunięciem. Zatwierdzanie wymaga `canExport`, opracowanie `canIssueInvoices` lub `canExport`.
- OCR.space: ręcznie uruchamiany odczyt tekstu z limitem czasu, kontrolą współbieżności i ponowieniem. Wymaga `OCR_SPACE_API_KEY`; pusty klucz pozostawia ręczne opracowanie. Nie ma automatycznego przypisywania pól faktury ani fikcyjnej oceny pewności. Adapter korzysta z udokumentowanego POST https://ocr.space/ocrapi. Limit dostawcy może być niższy niż limit skrzynki. Nie testowano prawdziwego dostawcy kluczem produkcyjnym.
- Portal oferty: publikowanie przez udostępnienie linku, akceptacja/odrzucenie wersji, ważność według daty w Warszawie, niezmienny audyt decyzji ze snapshotem. Edycja niezatwierdzonej oferty unieważnia poprzedni link. Decyzja blokuje edycję/usunięcie tej wersji. Portal zwraca ograniczone DTO bez danych wewnętrznych. Konwersje są transakcyjne i chronione przed powieleniem. Walidacja faktury i przeliczenie walut korzystają ze wspólnego parsera.
- Zapisane filtry faktur, ulubione pozycje nawigacji i osobista lista kontrolna księgowości są zapisane na koncie. Filtry i checklisty są oddzielone dla firm. Zapis z nieaktualnej karty zwraca konflikt zamiast nadpisywać dane.
- Menu pogrupowane przy zachowaniu dotychczasowych odnośników i pulpitu na początku. Manifest PWA i statyczny ekran offline; żadne odpowiedzi API ani prywatne dokumenty nie są buforowane przez service worker.
- Klucze integracji mają osobne zakresy odczytu statusów KSeF, dokumentów i katalogów. Stare klucze zachowują wyłącznie dotychczasowy dostęp do statusów. Nowe API ma limit i paginację.
- `/settings/health`: właściciel widzi niedokończone zadania KSeF, OCR i webhooków firmy. To stan zapisany w bazie, nie syntetyczny test dostępności dostawców.

## Dane i uruchomienie

Zmiany schematu są addytywne. Nowe pola na starych dokumentach pozostają puste. Nie wykonano migracji ani innych zapisów na bazie produkcyjnej. Indeksy poprawiające zapytania tworzy migracja:

```sh
npm run db:migrate -- up 007-document-workspace
```

Migracja nie przenosi dokumentów i nie modyfikuje danych finansowych. Rollback usuwa tylko własne indeksy, zachowując dane. Dla OCR administrator konfiguruje klucz dostawcy po ustaleniu właściwej umowy/przetwarzania danych; samo wdrożenie nie przesyła plików do OCR. Pliki są przechowywane w MongoDB w istniejącej kolekcji `ExpenseScan` jako data URL, maksymalnie 3 MB na plik i 100 przyjęć dziennie na firmę. Przy większej skali należy przenieść treść do prywatnego storage i utrzymać hash oraz kontrolę dostępu. Limit dzienny jest kontrolą operacyjną, nie gwarantowaną atomową kwotą.

## Weryfikacja

`npm run verify`: build produkcyjny, TypeScript, ESLint, testy jednostkowe/regresji oraz HTTP na odizolowanym MongoDB replica set. Nowe scenariusze obejmują obce firmy i odebrane uprawnienia, dwie równoczesne decyzje oferty, dwie konwersje, dwa zatwierdzenia skanu, blokadę edycji oryginału, konflikt preferencji, zakresy API i prawidłowe zestawienie zakupów/sprzedaży. Brak testów na danych produkcyjnych i brak rzeczywistych wiadomości do kontrahentów.

## Pozostały zakres większego planu

Ten pakiet nie jest realizacją całej wcześniejszej listy rozbudowy. Pozostają:

1. Rozpoznawanie pól i pozycji faktury z wiarygodnością OCR, trwała kolejka workerów oraz storage poza MongoDB.
2. Wieloetapowe reguły akceptacji, przypisywanie osób, komentarze, wspólny obieg księgowy i blokada zamkniętych okresów we wszystkich ścieżkach zapisu.
3. Pełna migracja starych ekranów ze wspólnego bootstrapu faktur na paginację i agregacje serwerowe. Obecny bootstrap zachowano dla zgodności istniejących widoków i sum; skrzynka dokumentów i nowe API są stronicowane.
4. Panel WMS (backend już istnieje), projekty/rentowność oraz wersjonowane szablony PDF.
5. Importy integracyjne i konektory sklepów, event outbox, pakiety archiwalne XML/PDF/UPO, produkcyjne backupy i próba odtworzenia.
6. Lokalne szkice offline z rozwiązywaniem konfliktów, onboarding na koncie i przeglądarkowe testy E2E.
7. Rozszerzenie klasyfikacji podatkowej JPK ponad zakres opisany w JPK.md.

Płatności i bankowość pozostają poza zakresem rozbudowy. Istniejące moduły i zachowania rozliczeń są zachowane.
