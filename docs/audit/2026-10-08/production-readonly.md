# Audyt produkcji bez zapisu — 2026-10-08

Odczyt publiczny powtórzony **9 października** nadal potwierdza blokadę: `/cennik` kończy na `/login?next=%2Fcennik`; sitemap ma 43 adresy i pomija cennik. Strona główna, robots, llms i health odpowiadają 200; health deklaruje `db: ok`, ale nie udostępnia revision. To sześć nowych odczytów, nie powtórzenie pełnego crawl ani test zalogowanych użytkowników. TTFB 431–1596 ms zawiera sesyjny proxy i nie stanowi field metryki. Dowód: [production-readonly-2026-10-09.json](production-readonly-2026-10-09.json).

Historyczny pełny przebieg i pomiary poniżej pochodzą z 8 października; nie zostały przeliczone z sześciu odczytów późniejszego dnia.

Odczytano `https://fakturaprosto.pl` przez skonfigurowany proxy środowiska, z weryfikacją TLS. Crawler wykonywał maksymalnie 3 równoległe publiczne GET. Przeglądarki przechodziły pojedyncze dokumenty kolejno; wszystkie żądania inne niż GET/HEAD, zewnętrzne originy i endpointy cron były blokowane. Nie utworzono konta, faktury, płatności ani rzeczywistej wysyłki. Nie zmieniono danych produkcyjnych.

## Zakres faktycznie wykonany

- Crawler: **62 różne adresy**, w tym wszystkie **43 URL-e aktualnej produkcyjnej sitemap**, robots, llms, health, wybrane strony logowania, adresy chronione i celowo nieistniejący adres. Dodatkowe pojedyncze odczyty potwierdziły przekierowania, kompresję i cache zasobów.
- Browser: **79 ekranów** — Chromium 63, WebKit 8, Firefox 8. Chromium: wszystkie 43 URL-e sitemap przy 390×844, dodatkowe publiczne/auth, po 8 ekranów przy 768×1024 i 1440×900. WebKit i Firefox: po 8 wybranych publicznych ekranów przy 390×844.
- **58 interakcji**: 50 kontroli disclosures, okna prywatności, zakładek i lokalnej symulacji demo, walidacji kalkulatora VAT oraz 8 dodatkowych kontroli kalkulatora limitu KSeF, historii „wstecz” i odświeżenia.
- Kalkulatory: kwota `100`, grosz `0,01`, ujemna, bardzo duża, polskie znaki i tekst `<script>`; limit KSeF dokładnie `10 000` i `10 000,01`, wcześniejsze przekroczenie, zero i niepoprawne kwoty. Wyniki odpowiadały opisanym regułom; nie wykonano przesłania transakcji do KSeF.
- Zero błędów `pageerror`, nieoczekiwanych HTTP 4xx/5xx w przeglądarkach, poziomych overflow >2 px i widocznych anchorów wskazujących brakujące ID. **Konsola nie jest czysta**: zachowano 265 komunikatów CSP Report-Only i 9 komunikatów zasobu 401; surowe odpowiedzi zawierają 12 oczekiwanych `/api/auth/me` 401.

Firefox początkowo odrzucił certyfikat proxy (`SEC_ERROR_UNKNOWN_ISSUER`). Po imporcie publicznego, skonfigurowanego CA środowiska do izolowanego profilu NSS wszystkie 8 ekranów przeszło. Weryfikacja TLS pozostała włączona. Wstępne nieudane próby są w `environmentSetupAttempts`, osobno od wyników strony.

## Wykryte problemy i ustalona przyczyna

| Element | Problem | Przyczyna / dowód | Poprawka / przekazanie | Status produkcji |
| --- | --- | --- | --- | --- |
| `/cennik` | HTTP 307 do `/login?next=%2Fcennik` | Produkcja nie udostępnia publicznego cennika obecnego w main | Poprawka publicznej trasy istnieje w kodzie; potrzebne wdrożenie | Nadal występuje |
| `/porownania/fakturowo`, `/porownania/faktura-pl` | HTTP 404 | Produkcyjna wersja nie zawiera tych dwóch stron obecnych w main | Wdrożyć aktualny kod; przekazano agentowi SEO | Nadal występuje |
| `/verify-email` | HTTP 307 do login | Produkcja nie zawiera aktualnej publicznej trasy potwierdzenia | Trasa i przepuszczenie middleware istnieją w main | Nadal występuje |
| Nieznany adres `/qa-missing-route-20261008` | HTTP 307 do login zamiast 404 | Produkcyjny middleware przechwytuje nieznane adresy | Aktualny kod przepuszcza nieznane adresy do obsługi 404 | Nadal występuje |
| 5 stron prawnych | Brak canonical | Odczyt HTML `/regulamin`, `/polityka-prywatnosci`, `/polityka-cookies`, `/powierzenie-danych`, `/podwykonawcy` | Przekazano agentowi SEO; lokalna poprawka ma osobną regresję | Brak w produkcji |
| CSP Report-Only | 265 diagnostyk w Safari/Firefox | `script-src 'self'` nie uwzględnia wymaganych inline Next/JSON-LD; brak raportowania `report-to` | Przekazano agentowi bezpieczeństwa do naprawy źródła; nie wyłączano obowiązujących zabezpieczeń | Nadal występuje |
| Okno prywatności — natychmiastowy Escape w WebKit | Po otwarciu i `dialog.visible` Escape nie zamknął okna, także po 5 s | Listener modalny instalowany po paint; reprodukcja w osobnym odczytowym scenariuszu | Agent UI naprawił gotowość przez `useLayoutEffect` i powrót fokusu po commit; regresja źródłowych komponentów obejmuje trzy silniki | Nadal odtworzony na starszej produkcji |
| `/api/health` | Brak `revision` | Bieżąca odpowiedź zawiera `ok`, `db`, `uptimeSeconds`, timestamp i env; nie można wskazać SHA wdrożenia | Pole jest w aktualnym kodzie; wymaga wdrożenia i konfiguracji wersji | Nie można potwierdzić zgodności z main |
| Sitemap i llms | Brak nowego cennika/2 porównań; cennik w llms prowadzi do `/#cennik` | Publiczne pliki nadal reprezentują starszy zakres produktu | Aktualizacja kodu SEO i wdrożenie | Nadal starszy zakres |

Produkcja wyraźnie różni się od aktualnego źródła, ale **nie ustalono dokładnego produkcyjnego SHA**. Wiek wpisu CDN około 511 tys. sekund i `x-nextjs-date` z 3 października są dowodem czasu odpowiedzi cache, nie samodzielnym dowodem uszkodzenia cache.

## Potwierdzone poprawne zachowania

| Element | Dowód | Status |
| --- | --- | --- |
| 43 URL-e sitemap | Wszystkie 200, bez przekierowań; po jednym H1, tytuł i opis; brak duplikatów title oraz błędnego noindex | PASS zakresu crawl |
| Dostęp bez logowania | `/api/auth/me` i `/api/data` zwracają 401, chronione strony kierują do login | PASS badanych adresów |
| Niedozwolona metoda API | GET `/api/invoices` zwraca 405; endpoint przyjmuje inne metody | Zachowanie oczekiwane |
| Zdrowie bazy | Publiczny `/api/health`: 200, `ok: true`, `db: ok` | PASS chwilowego odczytu |
| Kompresja | HTML i JS z `Content-Encoding: br`; 61 z 62 odczytów crawl obsłużyło gzip | PASS badanych odpowiedzi |
| Haszowane JS/fonty | `/_next/static/...` z `public,max-age=31536000,immutable` | PASS badanych zasobów |
| Service worker | Cache obejmuje wyłącznie ogólną stronę offline; nie zapisuje API ani prywatnych dokumentów | PASS odczytu źródła produkcji |
| Nagłówki HTML/API | HSTS, nosniff, DENY, referrer policy, ograniczenia object/base/frame/form; API health no-store/noindex | PASS obecności; nie dowód całego bezpieczeństwa |
| Widoki i lokalne kalkulatory | 79 ekranów, 58 interakcji, bez pageerror/overflow/brakujących anchorów; kalkulatory zwracają sprawdzone wyniki | PASS wskazanych kontroli; Escape modala jest osobnym błędem |

## Produkcyjny pomiar laboratoryjny strony głównej

Trzy zimne nawigacje Chromium, 390×844, CPU×4, CDP latency 150 ms, throughput `1.6×1024²/8` B/s, cache wyłączony, service worker zablokowany. Ruch nadal przechodzi przez proxy środowiska. To pomiar orientacyjny z jednej lokalizacji, bez obciążania produkcji.

| Metryka | Run 1 | Run 2 | Run 3 | Interpretacja |
| --- | --- | --- | --- | --- |
| LCP | 1832 ms | 1888 ms | 1516 ms | Mediana 1832 ms; próg <1 s nie został potwierdzony |
| TTFB requestStart→responseStart | 588 ms | 403 ms | 49 ms | Mediana 403 ms; proxy i zestawianie połączeń, nie bezpośredni pomiar edge |
| CLS | 0 | 0 | 0 | PASS w tych trzech nawigacjach |
| Początkowe 11 skryptów z HTML, encoded | 165 335 B | 165 354 B | 165 114 B | Około 161,5 KiB przesłanych, nie deklaracja gzip budgetu |
| Wszystkie JS w obserwacji po load+2 s, encoded | 325 152 B | 324 935 B | 324 699 B | Około 317 KiB; zawiera pobrania późniejsze/prefetch |

Event Timing dla kliknięć wyniósł 24–96 ms; pojedyncza próbka zamknięcia przez Escape osiągnęła 272 ms. Nie jest to field INP ani dowód spełnienia progu INP <100 ms. CPU jest współdzielone z innymi zadaniami QA; wynik nie nadaje się do gwarancji produkcyjnego SLA ani porównania różnych profili Lighthouse.

## Nieweryfikowalne w tym zakresie

- Cały panel zalogowanego użytkownika, każda jego funkcja i mikrostan: brak produkcyjnego konta testowego; sprawdza je osobny audyt izolowany.
- Rzeczywiste SMTP, MF/KSeF, Stripe, aktywność cron i alertów, odtworzenie produkcyjnego backupu: nie wykonano operacji na rzeczywistych usługach/danych.
- Dokładna zgodność produkcji z main, poprawność wdrożenia po zmianach i produkcyjne migracje: brak SHA w health i dostępu do wdrożenia.
- Wszystkie stany hover/focus/loading/error/disabled każdego publicznego mikroelementu: ten audyt produkcji wykonuje wskazane przypadki, nie zastępuje pełnej lokalnej checklisty.
- Zakończenie zamknięcia okna prywatności Escape w produkcyjnym Firefox: pierwszy odczyt wykonano natychmiast, a osobny recheck zatrzymał się na potwierdzonym błędzie WebKit. Chromium zamyka i przywraca fokus; WebKit nie zamknął w ciągu 5 s. Nie przypisano wyniku PASS Firefox dla nieukończonego kroku.
- Fizyczne Safari na iPhone, Chrome na słabym Androidzie oraz wszystkie wersje desktop browsers: użyto Playwright Chromium/WebKit/Firefox i emulowanych viewportów.
- Real-user TTFB/LCP/CLS/INP, SLA oraz obsługa tysięcy równoczesnych użytkowników: brak danych RUM i brak testu obciążeniowego produkcji.
- Gwarantowane top 5 Google/GEO/AEO, widoczność dla wszystkich fraz oraz przyczyny aktualnego rankingu: odczyt stron i plików GSC nie ustanawia gwarancji pozycji.

## Surowe dowody

- [production-readonly.json](production-readonly.json): wszystkie odczyty HTTP, nagłówki, tytuły/opisy, canonical, schematy, linki, przekierowania i sondy cache/Brotli.
- [production-browser.json](production-browser.json): poszczególne ekrany, widoczne kontrolki, błędy konsoli/sieci i 50 interakcji.
- [production-performance.json](production-performance.json): trzy pomiary, zasoby, Event Timing oraz 8 dodatkowych interakcji kalkulatora i nawigacji.
