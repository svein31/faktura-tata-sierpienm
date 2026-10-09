# Aktualizacja zależności i ponowna regresja — final7

**Status: lokalna regresja i pomiary final7 ukończone w opisanym zakresie.** W chwili zamrożenia raportu nie zweryfikowano jeszcze nowego zdalnego CI; dokładny SHA publikacji w historii main i odpowiedzi końcowej. Po publikacji `87fb9afb170e5c04921aa22f1f8e674d0edf0645` zdalny audyt zależności wykrył zgłoszenia dotyczące Next.js, sharp/librsvg i source-map-js. Zdalny skan sekretów przeszedł. Aktualizację zależności i nowe kontrole prowadzi się oddzielnie od ukończonego final6.

Zainstalowano Next.js **15.5.25 → 15.5.27**, sharp **0.35.4 → 0.35.5** oraz source-map-js **1.2.1 → 1.2.2**. Ponowna czysta instalacja i natywne kodowanie PNG/WebP/AVIF przeszły. sharp używa libvips 8.18.7 i librsvg 2.63.2. Nie zmieniano wersji głównej Tailwind. Sam wynik kontroli zależności nie dowodzi poprawności nowej skompilowanej aplikacji.

Fingerprint obejmuje `package.json` i `package-lock.json`, więc aktualizacja zmienia tożsamość badanego kodu również bez edycji plików aplikacji. Final7 wymaga nowego BUILD_ID, SHA-256 i dowodów wykonania. Nie przenosi się wyniku final6 na ten build.

| Kontrola final7 | Stan |
| --- | --- |
| Wersje zainstalowanych zależności i audyt produkcyjny | PASS: trzy aktualizacje; 3 zgłoszenia → 0 w `npm audit --omit=dev`. Pełny audyt narzędzi nadal ma 7 zgłoszeń |
| Czysta instalacja i natywne formaty sharp | PASS: PNG, WebP i AVIF |
| BUILD_ID i SHA-256 źródeł | `EtIKJoZ6X52nNorRlxheE`; `202ad9a2ba265177355cbaf5318a9a91837744b89727ebc42f8fdaa49588a716` |
| Build, TypeScript, lint i testy jednostkowe | PASS: każdy proces exit 0; 275 nazwanych + 7 test:fixes = 282, zero błędów i pominięć |
| Rzeczywisty HTTP na izolowanej replice MongoDB po migracji 022 | PASS: 135 wzorców / 193 metody / 442 kontrole, zero failures; 42 kontrole produktu/bezpieczeństwa, SEO 46 i wszystkie 12 natywnych grup migracji. [http-audit-final7-postmigration.json](http-audit-final7-postmigration.json) |
| Axe WCAG A/AA | Automatycznie PASS: 90 tras / 180 ekranów, zero ekranów z naruszeniami; 86 ekranów wymaga ręcznej oceny. [accessibility-routes-final7.json](accessibility-routes-final7.json) |
| Chromium, WebKit i Firefox | PASS jednej rzeczywistej pełnej inwokacji: 1010 kontroli układu, 33863 obserwowane wystąpienia kontrolek i 246 nazwanych scenariuszy. [Podsumowanie](browser-coverage-summary-final7.json), [wykonanie i zakres fixture](browser-execution-final7.json) |
| Aktualne pomiary final7 | CDP LCP mediana 644 ms, CLS 0; Lighthouse 97/95/95, mediana **95**; start JS **116653 B / 113,92 KiB gzip**. Rampa 1317 żądań / 0 błędów, maks. 20 wykonawców, p95 538,5 ms. [Pomiary](../../performance/WYNIKI-final7-2026-10-09.md) |
| Poprzedni zdalny CI na `87fb9af` | Audyt produkcyjnych zależności FAIL; skan sekretów PASS; wspólna regresja HTTP/przeglądarki FAIL przy tworzeniu testowej subskrypcji |
| Izolacja fixture finansowego we wspólnej bazie | Rzeczywisty helper PASS: trzy wywołania obok istniejącej subskrypcji HTTP; nie jest to jeszcze zaliczenie całej wspólnej przeglądarkowej ścieżki CI |
| Migracja 022 indeksów nullable Stripe ID | PASS 12 natywnych grup regresji, rzeczywisty grant i Prisma checkout upsert, idempotencja, kolacje/checkpoint oraz odmowa niebezpiecznego rollbacku; [subscription-indexes-final7.json](subscription-indexes-final7.json) |
| Nowy zdalny CI — stan w chwili zamrożenia raportu | Nie zweryfikowano; dokładny SHA publikacji i rzeczywisty późniejszy wynik znajdują się w historii main oraz odpowiedzi końcowej |

Aktualny [spis final7](inventory-final7.json) i [zakres dopasowania](coverage-final7.md) zawierają 65 wzorców stron, 51 konkretnych publicznych ścieżek, 135 wzorców API / 193 metody, 75 komponentów i 1730 szablonów UI. Zaobserwowano 279 dopasowanych szablonów, ale tylko 2 mają jednoznacznie przypisaną jawną akcję. Nie jest to zaliczenie wszystkich mikroelementów. API ma 396 dopasowanych dowodów: 268 smoke i 128 celowanych; 46 wpisów nie dopasowano. Dowody HTTP sprzed 022 pozostają osobno; najnowsze rozszerzone HTTP potwierdza także nowe kontrole migracji.

Konsola final7 zachowuje **91 wpisów**: 90 diagnostyk zasobów i jeden komunikat WebKit anulowanego RSC. Zachowano 131 odpowiedzi ujemnych: 53 anonimowe 401, 63 blokowane NBP 502, 6 kontrolowanych reset 400 i 9 zamierzonych 404. To **nie jest czysta konsola**. Komunikat WebKit odpowiada historycznemu wzorcowi; nie instrumentowano ponownie jego dokładnego producenta. W tym przebiegu nie wystąpił Firefox InvalidStateError, lecz nie rozwiązuje to niewyjaśnionej historycznej przyczyny final6.

## Zgłoszenia zależności — przyczyna i wynik

| Element | Problem / przyczyna | Poprawka | Status |
| --- | --- | --- | --- |
| Next.js | Dwa zgłoszenia cache poisoning SSG/ISR w wersjach poniżej 15.5.27: [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676), [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | 15.5.27 | Brak tych zgłoszeń w ponownym audycie produkcyjnym; nowe HTTP/build osobno |
| sharp / librsvg | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), zależność natywna w sharp poniżej 0.35.5 | sharp 0.35.5, librsvg 2.63.2 | Audyt produkcyjny 0; rzeczywiste natywne PNG/WebP/AVIF PASS |
| source-map-js | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), DoS przez sekcje indeksowanej mapy źródeł | 1.2.2 | Brak tego zgłoszenia w ponownym audycie |
| Narzędzia Tailwind 3 | Łańcuchy braces i postcss-selector-parser: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Zbadano dostępność zgodnej poprawki; nie przeprowadzono migracji Tailwind 4 | **Pozostaje 7 zgłoszeń dotyczących węzłów dev: 5 high i 2 moderate.** To łańcuchy dwóch zgłoszeń, nie siedem niezależnych CVE |

Pełny audyt wszystkich zależności zmienił się z 10 zgłoszeń (7 high, 3 moderate) na 7 (5 high, 2 moderate). Produkcyjny podzbiór ma 0 zgłoszeń w chwili pomiaru. Nie oznacza to kompletnego braku podatności ani zaliczenia pentestu. Dla braces 3.0.3 nie znaleziono zgodnej poprawionej wersji w zbadanej gałęzi; npm dla tych łańcuchów proponuje migrację do Tailwind 4.3.3, wymagającą osobnej zmiany konfiguracji i regresji. Zachowano zależności deweloperskie, bez ukrywania wyniku pełnego audytu. Pełne raporty przed/po, metadane oraz SHA logów instalacji i testu natywnego są osadzone w [dowodzie final7](dependency-followup-final7.json).

## Indeksy Stripe ID i wspólne fixture w zdalnym CI

Izolowana replika MongoDB odtworzyła błąd zdalnej regresji: oryginalny fixture finansowy przy istniejącej subskrypcji HTTP dostawał P2002 na `Subscription_stripeCustomerId_key`. Poprawiony rzeczywisty helper nadaje osobne syntetyczne identyfikatory Stripe; trzy wywołania obok istniejącego fixture przeszły i usunęły wyłącznie własne dane. Ta próba zatrzymywała się po konstrukcji fixture, bez uruchomienia UI; nie zastępuje całej ścieżki CI.

Próba ujawniła także odrębny błąd indeksów: `db push` tworzy unikalne **non-sparse** nullable Stripe ID, więc drugi poprawny rekord oczekującego checkoutu z samym customer ID, bez subscription ID, koliduje. Migracja 014 tworzy indeksy sparse, ale pomija naprawę już istniejącego non-sparse; również sparse nadal koliduje dla jawnego `null`. Rzeczywista operacja nadania dwóm kontom subskrypcji bezpłatnej z jawnymi null została odtworzona jako błąd 11000 i wycofała oba zapisy. Nie odczytano produkcyjnego kształtu indeksów; zakres ryzyka zależy od istniejącej konfiguracji bazy.

Nowa migracja **022** utrzymuje unikalność rzeczywistych ID przez partial unique wyłącznie dla stringów. Nowe nazwane indeksy powstają przed usunięciem poprzednich, bez przerwy w ochronie. Rollback najpierw odmawia niezgodnych duplikatów null/braku i odtwarza poprzednie indeksy przed usunięciem nowych. **12 natywnych grup regresji przeszło**: rzeczywiste nadanie dwóm kontom subskrypcji, dwa Prisma checkout upsert, zachowanie danych, odmowa duplikatu prawdziwego ID, kontrola typu, kolacje, checkpoint, idempotencja i bezpieczny rollback. Rozszerzony HTTP po migracji także przeszedł; log zachowuje aktualne kontrole kont, wpłat, zaproszeń, uprawnień, współbieżnej wysyłki lokalnego SMTP i 12 natywnych grup migracji. Tożsamość aplikacji sprawdzono przed i po jego wykonaniu. Fingerprint aplikacji nie obejmuje skryptów migracji; ich osobne SHA-256 są zapisane w [dowodzie natywnym](subscription-indexes-final7.json) i zostały sprawdzone względem plików.

Dotychczasowa macierz używa bazy przygotowanej przed 022: dowodzi zachowania tego samego skompilowanego kodu, ale nie nowego układu indeksów. Publikacja produkcyjna wymaga procedury kopii i aktualnych migracji **018–022**, następnie weryfikacji indeksów. Ponowną wspólną regresję i zdalny CI zapisuje się dopiero po wykonaniu. Surowe fakty reprodukcji są osadzone w [dowodzie final7](dependency-followup-final7.json).

## Aktualna wydajność i niespełnione progi

Trzy zimne CDP i trzy Lighthouse wykonano kolejno po zakończeniu QA; tożsamość źródeł i builda potwierdzono przed/po każdej serii. Aktualna mediana dokumentu TTFB to **11,2 ms lokalnie**, CDP LCP **644 ms**, a Lighthouse LCP **2432,1 ms**, Performance **95/100**, TBT **172 ms**. CLS ma 0 w każdej z sześciu prób. Próbki EventTiming 56/40/56 ms nie są field INP. Początkowy JS **116653 B** przekracza 100000 B; nie uzyskano Lighthouse 100 ani LCP poniżej 1 s w jego profilu.

Rampa przy 1/5/20 wykonawcach zliczyła **232/535/550 żądań**, łącznie **1317**, bez błędów. Przy 20 wykonawcach: 89,46 req/s, p95 całości **538,5 ms**, p95 TTFB **538,26 ms**, więc API nie spełnia progu 100 ms w tej próbie. Fixture ma 1000 syntetycznych kont i 30000 początkowych faktur; liczność bazy nie jest liczbą jednoczesnych użytkowników. Rozgrzanie PDF i serialne sondy są poza licznikami rampy. Integralność: **136 udanych utworzeń = 136 zapisanych faktur = 136 rezerwacji**, exactlyOnce=true. To lokalny zamknięty model na jednej maszynie, bez produkcyjnego RTT, providerów i SLA.

Pełne profile, każda próba, zasoby, indeksy i SHA surowych raportów są w [results-final7-2026-10-09.json](../../performance/results-final7-2026-10-09.json); opis wyników w [WYNIKI-final7-2026-10-09.md](../../performance/WYNIKI-final7-2026-10-09.md). Wcześniejsze 97/1419 dotyczą final6; nie wybrano ich zamiast rzeczywistych final7. Field INP, TTFB edge/cold-start, fizyczne telefony, HTTP/3/103 i tysiące równoczesnych osób nadal nie mają dowodu. Powtórzenie w Lighthouse/DevTools/PageSpeed Insights/WebPageTest i dane RUM p75 wymagają wdrożenia Netlify oraz odpowiedniej liczby próbek.

## Historia i ograniczenia

Dowody final6 pozostają historyczne: BUILD_ID `21f_lBaQA8Ww--YiYgN1t`, SHA-256 `14e1b8e0f3850b795ad5d8e7c183edb335b0f40f275e16ce710c6e456e62a3fc`. Ich JSON-y, logi i [pomiary wydajności](../../performance/WYNIKI-2026-10-09.md) zachowują własne identyfikatory; nie są pomiarami final7. Szczegóły nowego przebiegu są w [dependency-followup-final7.json](dependency-followup-final7.json) oraz nowym wpisie [runtime-release-evidence.json](runtime-release-evidence.json).

Nie przeprowadzono wdrożenia Netlify ani prób na danych produkcyjnych. Ograniczenia badania wszystkich mikroelementów, fizycznych urządzeń, integracji produkcyjnych, field INP i pozycji Google pozostają w [raporcie głównym](RAPORT.md).
