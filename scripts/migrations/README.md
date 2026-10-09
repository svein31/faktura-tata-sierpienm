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


- `007-document-workspace`: indeksy firmy/dat dla Offer, Order, Expense i ExpenseScan. Nie przypisuje starych rekordów do firm. Up/down zachowują oryginały i dane biznesowe. Preferencje użytkownika i zakresy kluczy są opcjonalnymi polami bez wymaganej migracji danych.

### 015-auth-rate-limit

Tworzy indeks TTL na `AuthRateLimit.expiresAt` (liczniki logowania, rejestracji i resetu hasła). `up` działa wielokrotnie; `down` usuwa jedynie indeks założony przez migrację i zachowuje rekordy. Przed publikacją sprawdź stan produkcyjnej migracji; brak indeksu nie usuwa starych liczników. Zalecany stabilny `NEXTAUTH_SECRET`; istniejące wdrożenia bez niego używają `DATABASE_URL` jako klucza HMAC dla pseudonimu IP.

### 017-launch-safety

Dodaje unikalny indeks `BillingCheckoutState.userId` dla trwałych prób zakupu Pro i wspólnej blokady rozliczeń oraz indeks wyboru oczekujących e-maili KSeF na `Invoice`. Przed uruchomieniem nowej aplikacji wykonaj `npm run db:migrate -- up`; nowe opcjonalne pola nie wymagają nadpisywania istniejących faktur. Migracja up → up → down → up jest sprawdzana na izolowanej bazie. Rollback usuwa tylko dodane indeksy i zachowuje próby Checkout, historię oraz stany wysyłki. Przed cofnięciem kodu zatrzymaj worker, aby nie powtórzyć wysyłek zapisanych jako `sending` lub `verify_needed`.

### 018-performance-indexes

Dodaje dziewięć nieunikalnych indeksów numerów i historii faktur, katalogów i powiadomień. Pomija już istniejące równoważne klucze niezależnie od nazwy. Down usuwa tylko indeksy należące do checkpointu i zachowuje dokumenty; regresja porównuje dane up/up/down/up i rzeczywisty plan zapytań. Kierunki indeksów są odwzorowane w schema Prisma.

### 019-email-safety

Dodaje unikalne klucze deduplikacji ręcznych e-maili i potwierdzeń adresu, indeksy odbiorców/faktury/stanu oraz TTL jednorazowych tokenów. Nowe konta wymagają dowodu adresu; istniejące nie otrzymują wstecznego obowiązku. Opcjonalne liczniki fencing i pola rozstrzygnięcia nie nadpisują faktur ani kont. Down pozostawia tokeny, historię i niepewne wysyłki, usuwając tylko dodane indeksy. Przed cofaniem kodu zatrzymaj wysyłki; starszy kod nie zna trwałych blokad.

### 020-pilot-metrics

Dodaje TTL `expiresAt` i indeks daty na `PilotMetric`, TTL oraz indeks pseudonimu i daty/metryki na `PilotVital`. Pomiar jest domyślnie wyłączony bez osobnego sekretu i aktualnej zgody analitycznej. Rekordy mają maksymalnie 30-dniową retencję, a raport filtruje wygasłe dane także przed sprzątaniem MongoDB. Down usuwa tylko założone indeksy, nie dane biznesowe; przed rollbackiem wyłącz `PILOT_METRICS_SECRET`, aby nie pozostawić nowych pomiarów bez retencji. Nie ma migracji danych faktur ani relacji do użytkowników.

### 021-queue-throughput

Dodaje pięć indeksów najstarszych zadań, wygasłych blokad i automatycznych e-maili. Nie zmienia statusów ani dokumentów. Down usuwa wyłącznie indeksy utworzone przez checkpoint. Operator obserwuje agregat kolejki i wiek zaległości; sama migracja nie zwiększa limitu czasu ani liczby instancji Netlify.

### 022-subscription-nullable-identifiers

Naprawia unikalność opcjonalnych identyfikatorów Stripe: stare indeksy niesparse indeksują także brak pola, a indeksy sparse nadal indeksują jawne `null`. Dwa oczekujące konta Checkout lub dwa przyznane dostępy mogły więc powodować błąd duplikatu. Nowe indeksy `Subscription_stripeCustomerId_string_key` i `Subscription_stripeSubscriptionId_string_key` są unikalne wyłącznie dla wartości tekstowych (`partialFilterExpression: { pole: { $type: 'string' } }`). Migracja najpierw buduje oba nowe indeksy, a potem usuwa rozpoznane stare indeksy; nie zmienia żadnego konta, subskrypcji ani danych Stripe.

Przed uruchomieniem płatności wykonaj `npm run db:migrate -- up` po ewentualnym przygotowaniu schematu. `prisma db push` nie odwzorowuje tych indeksów częściowych i może przywrócić wadliwe indeksy; po takim kroku trzeba osobno sprawdzić stan indeksów oraz checkpoint migracji. Nie uruchamiaj `db push` na produkcji jako zamiennika migracji.

Checkpoint zapisuje rzeczywiste poprzednie opcje indeksów. Rollback odtwarza je przed usunięciem nowych indeksów, ale zostaje jawnie zablokowany, jeśli obecne dane zawierają wiele wartości `null` lub brakujących pól niezgodnych ze starym indeksem. Cofnięcie nigdy nie usuwa danych, aby wymusić unikalność. Nieznane nazwy indeksów, zmienione definicje, duplikaty rzeczywistych identyfikatorów oraz niepoprawne typy wymagają wyjaśnienia przed zmianą indeksów.
