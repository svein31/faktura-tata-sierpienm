# Plany aplikacji

Model `Subscription` przechowuje jeden rekord na użytkownika (`userId` z unikalnym indeksem). Wartości planu to `monthly` i `yearly`, statusy: `inactive`, `active`, `past_due`, `canceled`; `currentPeriodEnd` jest opcjonalną datą zakończenia bieżącego okresu. Brak rekordu jest pokazywany jako `inactive` bez planu. Oba plany zachowują taki sam dostęp do wszystkich istniejących funkcji.

`GET /api/subscription` zwraca wyłącznie plan zalogowanego użytkownika i opis planów. Klient nie ma endpointu zmiany statusu. Karta „Plan” w ustawieniach jest informacyjna: nie pobiera opłat ani nie sugeruje, że subskrypcja została aktywowana. Przed użyciem modelu w uruchomionej instancji zastosuj istniejącą migrację `013-subscriptions` poleceniem `npm run db:migrate` z właściwym `DATABASE_URL`. Migracja tworzy tylko unikalny indeks i nie zmienia istniejących kont.
