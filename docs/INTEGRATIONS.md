# Publiczne statusy KSeF i webhooki

Właściciel firmy tworzy i unieważnia klucze w Ustawienia → API i webhooki. Klucz jest pokazywany raz, baza przechowuje SHA-256. Każde żądanie ponownie sprawdza uprawnienie właściciela i limit 120/minutę na klucz. Klucz ma wyłącznie odczyt statusów jednej firmy.

`GET /api/v1/ksef/statuses`, nagłówek `Authorization: Bearer fkt_…`; opcjonalnie `invoiceId` albo `cursor`. Odpowiedź `{data: […], nextCursor: …}` (do 50 pozycji). Błędy: 400 parametry, 401 klucz, 403 odebrany dostęp, 404 faktura spoza firmy/nieistniejąca, 429 limit. Żądania nie wysyłają faktur do KSeF.

Webhooki wymagają osobnego `WEBHOOK_ENCRYPTION_KEY` (32 losowe bajty jako 64 znaki hex) i migracji 004. Sekret endpointu pokazany raz, szyfrowany AES-GCM i powiązany z firmą. Wyłącznie HTTPS:443, publiczny IPv4, walidowany DNS i przypięty adres połączenia, bez przekierowań. Odbiorca musi zwracać 2xx.

Cron `POST /api/integrations/process`, `Authorization: Bearer CRON_SECRET`; podpięty do harmonogramu Netlify co 15 min. Skan po 50 faktur na endpoint, do 5 endpointów/run; nadrobienie zaległości może wymagać kolejnych uruchomień. Powiadomienia są migawkami zaobserwowanych statusów, nie pełnym strumieniem każdej przejściowej zmiany. Identyczna migawka nie tworzy kolejnego zdarzenia. Po rejestracji odbiorca dostaje również aktualne statusy istniejących dokumentów.

Nagłówki: `X-Fakturo-Event` stabilny identyfikator, `X-Fakturo-Timestamp` Unix sekundy, `X-Fakturo-Signature: sha256=HEX`. Sprawdzaj HMAC-SHA256(sekret, timestamp + "." + surowe body) porównaniem stałoczasowym, odrzucaj czas starszy niż 5 min i deduplikuj ID. Podpisuj/sprawdzaj surowe bajty JSON przed parsowaniem. Dostarczenie co najmniej raz; możliwe powtórzenie po awarii. Maks. 8 prób z wykładniczym odstępem, potem status failed. Kolejność dostarczeń nie jest gwarantowana; observedAt pozwala rozpoznać starszą migawkę. Szczegóły prób w panelu integracji.

Wyłączenie endpointu zatrzymuje kolejne dostarczenia; żądanie już wysyłane może się zakończyć. Przed rollbackiem wyłączyć scheduler i endpointy; migracja down usuwa wyłącznie utworzone indeksy, zachowuje klucze, zaszyfrowane sekrety i dziennik dostarczeń. Klucza szyfrowania nie usuwać przy rollbacku.

Ręcznie: utworzenie/unieważnienie klucza, faktura innej firmy, odebranie roli, limit, odbiorca 2xx/500/timeout, weryfikacja HMAC i deduplikacja, próba URL prywatnego/redirect, wyłączenie webhooka. Testy automatyczne nie wysyłają wiadomości na publiczne endpointy.
