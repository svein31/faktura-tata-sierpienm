# Migracje MongoDB

Każdy moduł dodaje wersjonowany plik `YYYYMMDDNN-name.mjs` z `id`, `plan(db)`, `up(db, checkpoint)` oraz `down(db, checkpoint)`.
`plan` zapisuje stan sprzed zmian w dzienniku przed pierwszą mutacją. `up` musi być idempotentne także po przerwaniu procesu przed zapisem dziennika. `down` odwraca tylko zmiany danej migracji; nie usuwa danych biznesowych.

Uruchomienie: `npm run db:migrate -- up`, status: `npm run db:migrate -- status`, rollback: `npm run db:migrate -- down IDENTYFIKATOR`.

Przed wdrożeniem wykonać snapshot bazy. Migracje testować up → up → down → up na odizolowanym replica set. Najpierw migracja addytywna, potem nowa aplikacja. Przy rollbacku zatrzymać worker i wdrożyć poprzednią aplikację przed cofnięciem indeksów. Zachowane dane nowych funkcji umożliwiają ich późniejsze przywrócenie.

Nie uruchamiać starych migracji SQLite z `prisma/migrations` na MongoDB. `prisma db push` służy do inicjalizacji pustych baz testowych; produkcyjne zmiany danych i indeksów przechodzą przez ten runner. Runner nie modyfikuje modeli ani kolekcji płatności/bankowości.

Po awarii operator sprawdza stan migracji i blokadę `_fakturoMigrationLocks` przed jej ręcznym usunięciem. Nie ma automatycznego wygaszania blokady w trakcie długiej migracji.
