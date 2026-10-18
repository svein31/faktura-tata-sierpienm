# Gotowość operacyjna i pilotaż

Kod przygotowuje sondę aplikacji, bazy, kolejek, kopii i odtworzeń, test alarmu oraz pomiar pilota. Nie włącza usług, nie kupuje limitów, nie wysyła wiadomości do użytkowników i nie potwierdza nieuruchomionej produkcji. Publikacja czeka na dostępny limit Netlify.

## Monitoring z niezależnego hosta

Zainstaluj Node 22 i rclone na hoście operatora. Sekrety trzymaj w `/etc/fakturo/monitor.env` (0600), poza repozytorium. Uprawnienie sondy do kopii offsite powinno być tylko do odczytu. Nie umieszczaj tokenów w poleceniach ani URL-ach.

```dotenv
MONITOR_HEALTH_URL=https://fakturaprosto.pl/api/health
MONITOR_BACKUP_DIR=/var/lib/fakturo-backups
MONITOR_BACKUP_COPY_TARGET=readonlyremote:private/fakturo
MONITOR_BACKUP_MAX_AGE_HOURS=36
MONITOR_OPS_TOKEN=<ten sam chroniony CRON_SECRET co w aplikacji; minimum 24 znaki>
MONITOR_KSEF_MAX_DUE_AGE_SECONDS=300
MONITOR_EMAIL_MAX_DUE_AGE_SECONDS=300
MONITOR_KSEF_URL=https://api.ksef.mf.gov.pl/v2
MONITOR_ALERT_WEBHOOK_URL=https://<kolektor kontrolowany przez operatora>/fakturo
MONITOR_ALERT_SECRET=<osobny sekret HMAC minimum 32 znaki>
MONITOR_EVIDENCE_DIR=/var/lib/fakturo-evidence
```

`node scripts/ops/check-health.mjs` sprawdza równolegle zdrowie aplikacji, agregaty `/api/ops/queue-health`, podpisane dowody `/api/ops/readiness`, NBP, dostępność bramki MF oraz świeżość lokalnych i zewnętrznych archiwów. Żądania mają timeout i zakaz przekierowania. Bramka MF odpowiadająca 4xx potwierdza jedynie dostępność sieciową, nie rzeczywistą wysyłkę KSeF.

Brak dowodu odtworzenia, brak matching backup/offsite receipt, zaległość powyżej 5 minut, wygasła blokada lub `verify_needed` powodują wynik niepoprawny. Sonda nie drukuje tokenów, adresów baz, danych firm ani identyfikatorów faktur. Wysyła wyłącznie zagregowane rodzaje awarii; kolektor weryfikuje `X-Monitor-Signature = HMAC-SHA256(secret, exact_body)` i powinien deduplikować alarmy oraz kierować je do dyżurnego. HTTP 2xx kolektora oznacza przyjęcie zdarzenia, nie przeczytanie powiadomienia.

Opcjonalny systemd timer `deploy/backup/fakturo-health.timer` uruchamia sondę co 5 minut. Najpierw wykonaj kontrolę ręczną i próbę alarmu; dopiero potem zainstaluj/włącz timer na swoim hoście. Harmonogram repozytorium sam nie stanowi aktywnego monitoringu.

## Dowód działania alarmu

```bash
node scripts/ops/alert-drill.mjs send
# Gdy dyżurny rzeczywiście otrzyma alarm z powyższym drillId:
node scripts/ops/alert-drill.mjs confirm <drillId>
```

Stan `deliveredAt` jest zapisany po HTTP 2xx; `confirmedAt` wymaga ręcznego potwierdzenia odbiorcy w ciągu 24 godzin. Potwierdzaj wyłącznie przeczytany alert, nie sam wynik skryptu. Plik JSON w chronionym katalogu dowodów nie zawiera sekretów. Test automatyczny uruchamia prawdziwy lokalny kolektor HTTPS i sprawdza podpis; nie potwierdza produkcyjnego odbiorcy.

## Kopia zewnętrzna i rzeczywiste odtworzenie

Aplikacja przyjmuje podpisane dowody `backup`, `offsite` i `restore` przez `/api/ops/backup-receipt`. Skrypty istniejącego archiwum/transferu wystawiają je po ukończeniu operacji. Ustaw chronione `BACKUP_MONITOR_URL=https://fakturaprosto.pl/api/ops/backup-receipt` i taki sam `BACKUP_MONITOR_SECRET` w aplikacji i u operatora. Brak potwierdzenia ma status `unknown`.

```bash
node scripts/backup/run.mjs create /var/lib/fakturo-backups/<nowa-nazwa>.enc
node scripts/ops/copy-backups.mjs
# Na odizolowanym hoście z osobnym RESTORE_DATABASE_URL i BACKUP_KEY:
node scripts/backup/offsite-drill.mjs
```

Ostatnie polecenie pobiera najnowszą świeżą szyfrowaną kopię **z wybranego offsite rclone remote**, odtwarza ją do nowej losowej bazy, weryfikuje integralność i liczności oraz usuwa wyłącznie tę bazę. Nie wykonuje nowego eksportu produkcyjnego. Nie uruchamiaj aplikacji ani workerów na odtworzonych sesjach/sekretach. Oddzielnie zabezpiecz klucz szyfrowania oraz klucze MFA/webhooków. Duże bazy wykraczające poza limit transakcji backupu wymagają snapshotów/PITR operatora MongoDB.

Dla już pobranego archiwum można ustawić absolutne `RESTORE_ARCHIVE` i uruchomić `node scripts/backup/production-drill.mjs`. Bez tego parametru starszy tryb tworzy świeżą kopię źródła; nie dowodzi odczytu offsite. Zapisz wynik sondy i datę próby. Zielona gotowość kopii wymaga backupu/offsite w ciągu 36 godzin oraz odtworzenia w ciągu 30 dni.

## Pomiar pilota bez danych faktur

Pomiar jest domyślnie wyłączony. Operator uruchamia go po migracji `020-pilot-metrics` przez osobny `PILOT_METRICS_SECRET` (minimum 32 losowe znaki; wyłącznie po stronie serwera, nigdy `NEXT_PUBLIC_*`). Klient ładuje własny moduł dopiero po idle i wyraźnej zgodzie analitycznej w wersji `1.2.0-2026-10-15`. Ten moduł nie ładuje skryptów firm trzecich. Oddzielna integracja GA4 działa tylko na dozwolonych publicznych stronach i nie otrzymuje biznesowych etapów lejka. DNT i Global Privacy Control wyłączają także własny pomiar.

Cookie `fakturo_pilot` jest własne, HttpOnly/Secure/SameSite=Lax, ważne maksymalnie 30 dni i tworzone wyłącznie po opt-in. Baza przechowuje HMAC losowego identyfikatora przeglądarki, pięć pierwszych dat etapów (`visit`, `register`, `first_invoice`, `ksef`, `pro`) oraz numeryczne próbki TTFB/LCP/INP/CLS z ogólną klasą `public`/`app` i `mobile`/`desktop`. Datę etapu przechwytuje serwer przy prawidłowej operacji, przed odroczeniem zapisu przez `after()`; równoległe zapisy zachowują najwcześniejszą obserwację. Identyfikator pomiaru Web Vitals jest hashowany; nie zapisujemy go wprost, ścieżki URL, IP, User-Agent, e-maila, NIP-u, treści dokumentu ani kwot.

Etapy biznesowe rejestruje serwer po prawidłowej operacji. Pierwsza faktura oznacza wystawioną fakturę sprzedaży: bezpośrednie utworzenie albo wystawienie wcześniej zapisanego szkicu, dopiero po zatwierdzeniu transakcji. Sam szkic i proforma nie są aktywacją. Publiczny endpoint przyjmuje tylko `visit`; klient nie może zadeklarować rejestracji, faktury ani zakupu. KSeF wymaga rzeczywistego środowiska test/production oraz potwierdzonego UPO. Pro wymaga znanego planu, aktywnej, niewygasłej subskrypcji Stripe i wyklucza trial oraz dostęp gratisowy. Jest to obserwacja uprawnienia z potwierdzonego stanu serwera, nie audyt przychodu ani rozliczenia płatności. Polling statusu jest momentem obserwacji, więc brak jego wywołania może zaniżyć KSeF/Pro. Zliczenia dotyczą przeglądarek wyrażających zgodę, nie wszystkich ani unikalnych klientów. Odrzucenie zgody nie blokuje aplikacji.

Wycofanie zgody zatrzymuje wysyłanie nowych próbek; po skutecznym DELETE usuwa etapy i próbki tej przeglądarki oraz cookie. W razie awarii kolektora cookie pozostaje do ponowienia usunięcia. Żądania mają limit 5 s; klient ponawia wycofanie po odzyskaniu sieci lub powrocie do okna. Krótko żyjący rekord `revoked` z samym HMAC i datą wygaśnięcia pozostaje wyłącznie do końca pierwotnych 30 dni, aby zablokować wcześniej zaplanowane zapisy po wycofaniu. Transakcja z blokadą zapisu chroni przed równoczesnym zdarzeniem i wycofaniem. TTL usuwa rekordy; raport także filtruje wygasłe dane, bez oczekiwania na cykl sprzątania MongoDB. Zmiana urządzenia lub usunięcie cookie uniemożliwia powiązanie wcześniejszych danych; wygasną przez TTL.

Raport operatora wymaga osobnego, tylko do odczytu `PILOT_REPORT_DATABASE_URL` i nie dziedziczy produkcyjnego `DATABASE_URL`:

```bash
node scripts/ops/pilot-report.mjs
```

Raport rozdziela wszystkie obserwacje (`observedStageCounts`) od lejka (`counts`), w którym kolejne etapy wymagają wcześniejszych etapów tej przeglądarki w kolejności chronologicznej. Konta bez obserwowanej rejestracji ani faktura poprzedzająca rejestrację nie zawyżają konwersji. Pierwsza faktura oznacza pierwszą kwalifikującą obserwację w tej przeglądarce, nie całe życie konta. Pro stanowi gałąź po rejestracji i może poprzedzać pierwszą fakturę. `steps` podaje liczbę uprawnionych, ukończeń i jeszcze nieukończonych etapów oraz konwersję; nieukończony etap nie jest dowodem trwałego porzucenia. `activationTime` to średni czas w ms od obserwowanej rejestracji do pierwszej wystawionej faktury wśród kwalifikujących przeglądarek.

Raport JSON z ostatnich 28 dni pokazuje wejście → rejestrację → pierwszą fakturę i gałęzie KSeF/Pro oraz dokładne p75 próbek Web Vitals osobno dla telefonu/desktopu i stron publicznych/aplikacji. Pokazuje wszystkie 16 grup, również bez danych. Wartości CLS są bez jednostki, pozostałe w ms. Mniej niż 200 próbek w grupie daje `insufficient_samples`, nigdy zaliczenie celu. Brak próbki daje `p75: null`, nie zero. Klasa strony dotyczy pierwotnego dokumentu; późniejsza nawigacja SPA nie przeklasyfikowuje jego LCP/INP/CLS. Nie jest to pomiar czasu gotowości każdej kolejnej trasy panelu. Raport ogranicza jednorazowy odczyt do 200 tys. próbek; przy przekroczeniu skróć `PILOT_REPORT_DAYS` (1–30). INP powstaje dopiero po interakcji. Zbiory mają stronniczość zgód; nie przypisuj ruchu organicznego do przyczynowości ani rankingów na podstawie tego raportu.

### Potwierdzenie uruchomienia przed premierą

1. W kontekście produkcyjnym Netlify sprawdź obecność nazwy `PILOT_METRICS_SECRET`, bez drukowania wartości. Zastosuj migrację `020-pilot-metrics` istniejącym procesem migracji. Obie kolekcje muszą mieć indeks TTL `expiresAt` z `expireAfterSeconds: 0`. Sama obecność sekretu nie potwierdza indeksów ani działania bazy.
2. W osobnym, niezalogowanym profilu przeglądarki otwórz stronę i odrzuć analitykę. Nie może powstać `fakturo_pilot` ani żądanie do `/api/pilot/vitals`. Następnie dobrowolnie włącz analitykę: `POST /api/pilot/events` ma zakończyć się 204 i utworzyć HttpOnly/Secure/SameSite=Lax cookie. Samo 204 bez cookie nie dowodzi aktywnego zapisu — wyłączony kolektor także zwraca 204.
3. Wycofaj zgodę w ustawieniach. Potwierdź skuteczny DELETE i wygaśnięcie cookie; po odświeżeniu nic nie powinno go odtworzyć bez ponownego opt-in. Taka kontrola tworzy wyłącznie własny syntetyczny pomiar, który następnie usuwa; nie wymaga konta, faktury, KSeF ani obciążenia Stripe.
4. Z chronionego hosta operatora uruchom raport z osobnym kontem MongoDB tylko do odczytu kolekcji `PilotMetric` i `PilotVital`. Zachowaj wyłącznie zagregowany JSON i czas wykonania. Nie publikuj adresu bazy, cookie ani identyfikatorów pomiaru. Skrypt celowo nie korzysta z produkcyjnego `DATABASE_URL` i nie udostępnia publicznego API raportu.
5. Prawdziwe przejścia rejestracji, wystawienia i zakupu potwierdź po legalnym wykonaniu ich przez uczestników pilota. Nie deklaruj aktywnych klientów, konwersji ani celu wydajności na podstawie syntetycznej wizyty. Liczniki GA4 `registration_click` i `demo_click` pozostają kliknięciami; nie utożsamiaj ich z kontami ani płatnościami i nie łącz z danymi faktur.

## Pilotaż 20–50 osób i bramki szerszego startu

Rekrutację i kontakt prowadzi właściciel usługi. Kod nie wysyła zaproszeń ani nie pozyskuje uczestników. Wybierz 20–50 osób reprezentujących małe firmy i księgowość, różne telefony i łącza. Zacznij od 5 osób, następnie 20, na końcu 50; zwiększaj ruch po przeglądzie błędów i limitów hostingu/bazy/poczty.

1. Na środowisku testowym każdy uczestnik przechodzi: rejestracja, weryfikacja adresu, firma, kontrahent, faktura, PDF, mail na własny testowy adres, KSeF test z numerem/UPO, korekta, eksport, wylogowanie/reset. Płatności najpierw przez tryb testowy Stripe; rzeczywiste testy operator dokumentuje osobno.
2. Oprócz automatycznej ścieżki sprawdź słaby telefon, ograniczone łącze, cofanie, odświeżenie, przerwaną sieć, powtórne kliknięcie i dwa okna. Zapisuj czas do pierwszej prawidłowej faktury i liczbę problemów, bez kopiowania faktur do systemu zgłoszeń.
3. Przy wdrożeniu obowiązują wszystkie testy CI/migracje; na produkcji musi być zgodna rewizja, dostępny budżet hostingu/poczty/bazy, odtworzona kopia offsite i odebrany alarm. Bez tych dowodów status pozostaje niezweryfikowany.
4. Przez co najmniej 7 dni wymagaj braku utraty/ujawnienia danych i duplikatów opłat/wysyłek, odebranych alarmów, braku rosnącej zaległości KSeF/mail (>5 min) oraz minimum 95% poprawnych ścieżek pilota. Awaria finansowa, izolacji lub utrata dokumentu zatrzymuje rozszerzanie pilota.
5. Osobno sprawdź cel p75: TTFB <100 ms, LCP <1000 ms, INP <100 ms i CLS=0 po zebraniu co najmniej 200 próbek w każdej ocenianej grupie. Lab Lighthouse/obciążenie nie zastępuje pomiaru u użytkowników; przy niedostatecznej liczbie próbek nie deklaruj osiągniętych progów.
6. Przejdź do 200, 1000 i kolejnych użytkowników dopiero po powtórzeniu oceny przy większym ruchu. Ustal dyżurnego, godziny pomocy i plan cofnięcia wdrożenia według `docs/INCIDENT-RESPONSE.md`.

Do produkcyjnych dowodów zapisz: rewizję/daty, wynik testu obciążenia, wynik sondy bez sekretów, potwierdzenie odebranego alarmu, wynik offsite restore oraz zagregowany raport pilota. Same pliki i syntetyczne testy w repozytorium nie oznaczają gotowości produkcji.
