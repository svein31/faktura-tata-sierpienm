# Migracje MongoDB

Każdy moduł dodaje wersjonowany plik `YYYYMMDDNN-name.mjs` z `id`, `plan(db)`, `up(db, checkpoint)` oraz `down(db, checkpoint)`.
`plan` zapisuje stan sprzed zmian w dzienniku przed pierwszą mutacją. `up` musi być idempotentne także po przerwaniu procesu przed zapisem dziennika. `down` odwraca tylko zmiany danej migracji; nie usuwa danych biznesowych.

Uruchomienie: `npm run db:migrate -- up`, status: `npm run db:migrate -- status`, rollback: `npm run db:migrate -- down IDENTYFIKATOR`.

Przed wdrożeniem wykonać snapshot bazy. Migracje testować up → up → down → up na odizolowanym replica set. Najpierw migracja addytywna, potem nowa aplikacja. Przy rollbacku zatrzymać worker i wdrożyć poprzednią aplikację przed cofnięciem indeksów. Zachowane dane nowych funkcji umożliwiają ich późniejsze przywrócenie.

Nie uruchamiać starych migracji SQLite z `prisma/migrations` na MongoDB. `prisma db push` służy do inicjalizacji pustych baz testowych; produkcyjne zmiany danych i indeksów przechodzą przez ten runner. Runner nie modyfikuje modeli ani kolekcji płatności/bankowości.

Po awarii operator sprawdza stan migracji i blokadę `_fakturoMigrationLocks` przed jej ręcznym usunięciem. Nie ma automatycznego wygaszania blokady w trakcie długiej migracji.

### 001-company-catalog

Dodaje indeksy `Contractor.companyId` i `Product.companyId`. Rekordy konta mającego dokładnie jedną własną firmę przypisuje do tej firmy; kontrahenta powiązanego z dokumentem innej firmy pomija. Nie zgaduje przypisania przy wielu firmach. Plan zachowuje identyfikatory i rozróżnienie brak pola/null; rollback przywraca wyłącznie te przypisania, które nadal odpowiadają wartości migracji, i usuwa wyłącznie indeksy utworzone przez migrację. Nie usuwa kontrahentów, produktów ani nowych danych. Limit 20 000 wpisów chroni rozmiar pojedynczego checkpointu; dla większej bazy trzeba podzielić migrację danych przed uruchomieniem. Kod i migracja nie zmieniają kolekcji płatności.

### 002-user-mfa

Tworzy unikalny indeks `UserMfa.userId`. Nowe pole sesji `mfaVerifiedAt` jest opcjonalne; brak pola oznacza sesję bez 2FA. Migracja nie włącza 2FA żadnemu użytkownikowi. `down` usuwa wyłącznie indeks utworzony przez `up`, zachowuje dane. Cofnięcie wsparcia MFA jest blokowane, dopóki istnieją aktywne konfiguracje: użytkownicy muszą wcześniej wyłączyć 2FA przez uwierzytelnione ustawienia. Nie wolno wycofać kodu bramki 2FA przy aktywnej ochronie kont. Operacje indeksów wykonywać w oknie serwisowym.

### 003-recurring-occurrences

Dodaje unikalne indeksy wystąpień harmonogramu: dokument źródłowy + termin oraz wygenerowana faktura. `down` usuwa wyłącznie indeksy utworzone przez migrację, zachowuje powiązania i wszystkie faktury. Przed rollbackiem zatrzymać zadanie cron; ponownie włączyć dopiero po `up`. Nowe pola harmonogramu na fakturze są opcjonalne i nie wymagają masowego nadpisania danych.

- `004-integrations`: indeksy kluczy API, endpointów i kolejki webhooków. Down zachowuje dane; wcześniej wyłączyć scheduler i webhooki.

- `005-due-reminders`: indeksy konfiguracji i dziennika wiadomości. Down po wyłączeniu crona; dane pozostają.

- `006-invoice-settlements`: indeksy ledgeru `InvoiceSettlement` (dokument źródłowy, faktura, idempotencyjny request oraz pojedyncza faktura końcowa). Migracja nie usuwa proform, faktur zaliczkowych ani końcowych; `down` usuwa wyłącznie indeksy utworzone przez `up`. Przed rollbackiem wyłączyć moduł rozliczeń, a po ponownym `up` zweryfikować unikalność `requestKey` i `finalKey`.
