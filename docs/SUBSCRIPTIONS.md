# Plany aplikacji

Model `Subscription` przechowuje jeden rekord na użytkownika (`userId` z unikalnym indeksem). Wartości planu to `monthly` i `yearly`, statusy: `inactive`, `active`, `past_due`, `canceled`; `currentPeriodEnd` jest opcjonalną datą zakończenia bieżącego okresu. Brak rekordu jest pokazywany jako `inactive` bez planu. Oba plany zachowują taki sam dostęp do wszystkich istniejących funkcji.

`GET /api/subscription` zwraca wyłącznie plan zalogowanego użytkownika i opis planów. Klient nie ma endpointu zmiany statusu. Karta „Plan” w ustawieniach jest informacyjna: nie pobiera opłat ani nie sugeruje, że subskrypcja została aktywowana. Przed użyciem modelu w uruchomionej instancji zastosuj istniejącą migrację `013-subscriptions` poleceniem `npm run db:migrate` z właściwym `DATABASE_URL`. Migracja tworzy tylko unikalny indeks i nie zmienia istniejących kont.

## Konto Free

Konto bez aktywnego planu (z nieprzekroczoną datą `currentPeriodEnd`) może wystawić 5 faktur sprzedaży na miesiąc kalendarzowy w strefie Europe/Warsaw, łącznie we wszystkich firmach jednego właściciela. Limit obejmuje korekty, zaliczki, faktury końcowe, faktury cykliczne oraz konwersje; proformy, zakupy i niewystawione szkice nie zużywają miejsca. Przejście szkicu do wysyłki KSeF rezerwuje miejsce przed transmisją. Nieudany zapis transakcyjny nie zużywa limitu. Anulowanie wystawionego dokumentu nie zwalnia miejsca. Historyczne wystawione faktury bez `issuedAt` liczą się według daty utworzenia w bazie; nowe według daty wystawienia. Licznik jest chroniony zapisem właściciela w transakcji, aby równoległe wystawienia nie przekroczyły limitu. Migracja `014-free-invoice-quota` dodaje indeksy daty wystawienia; uruchom `npm run db:migrate` na właściwej bazie przed aktywacją zmiany w aplikacji.
