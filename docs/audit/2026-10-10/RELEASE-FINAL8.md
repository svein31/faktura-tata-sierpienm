# Release final8 — lokalna weryfikacja, 2026-10-10

Migawka wersji przygotowanej do publikacji, 2026-10-12 UTC. Parent Git `f9e1e106d7e61e21cefaa0487e116315fab2348e` to baza builda przed nowym commitem. Stan CI/main opisuje ten moment; wynikowy commit i jego CI są odrębnym późniejszym potwierdzeniem. Wdrożenie produkcyjne Netlify pozostaje niezweryfikowane.

**Kandydat 14 odrzuca sprawdzony błędny PNG przed zapisaniem profilu lub osadzeniem w PDF.** Własne sześć bramek i zaobserwowany proces nadrzędny zakończyły się kodem 0: 577 testów jednostkowych, 11 helperów wydajności i 442 sprawdzenia HTTP. Osobne 68 testów PNG również ma kod 0. Własne testy nawigacji, stanów mobile i kontrastu przeszły. Sześć kalibrowanych zimnych prób panelu i faktur osiągnęło gotowość danych/UI w **2,69–3,54 s, CLS = 0**. Pełna macierz Chromium/WebKit/Firefox ukończyła wszystkie trzy silniki z kodem procesu testowego 0: 1010 sprawdzeń układu bez failures i 246 scenariuszy. Oryginalny wynik sesji nadrzędnej macierzy po przerwie pozostaje UNKNOWN; świeża odrębna kontrola zgodności źródeł i dowodów ma kod 0. Zachowano 132 obserwacje sieci i 93 konsoli, w tym dwa komunikaty o niepotwierdzonej przyczynie. Nie deklarujemy braku wszystkich błędów.

Aktualny limit to **załadowanie strony lub sekcji w maksymalnie 4 s**, z wyłączeniem tworzenia/zapisywania faktur, PDF i pozostałych długich operacji. Własne publiczne CDP 14 ma LCP median 504 ms i CLS = 0; jego początkowy JS 116 669 B gzip nadal przekracza wcześniejszy budżet 100 KB. LOAD200 pozostaje odrębnym pomiarem backendu 8; nie zmierzono pełnego UI przy równoczesnym obciążeniu 200, wszystkich widoków ani produkcji. Wdrożenie Netlify, wszystkie stany UI i TOP 5 pozostają niezweryfikowane.

Maszynowe dowody i jawne ograniczenia: [RELEASE-FINAL8.evidence.json](RELEASE-FINAL8.evidence.json). Zachowane wcześniejsze dokumenty: [zależności i kompatybilność CSS](../2026-10-09/security-dependencies-load200.md) oraz [pomiar LOAD200](../../performance/LOAD200-2026-10-10.md). Surowe raporty w `artifacts/` i `/tmp` są **wyłącznie lokalnymi plikami roboczymi**. Nie są publikowane przez Git; poniższe ścieżki do nich są identyfikatorami dowodów, nie linkami do pobrania z repozytorium.

## Bieżący kandydat 14

Źródła: `4c3d79d51bc12bf1856c0e63637ec156935e5070b0566e90e307a780aa1ae2cf`; BUILD_ID: `j7yf1Y2WBJZ6W17DQlzpy`; skrypty: `eb09f56d5ee028bf87896144bfdfdee0d5003f396e9b9661d744c7178841681d`; parent Git: `f9e1e106d7e61e21cefaa0487e116315fab2348e`.

| Zakres | Własny wynik kandydata 14 | Stan / granica dowodu |
| --- | --- | --- |
| Build, TypeScript, lint, testy jednostkowe, helpery wydajności, integracja | Sześć procesów testowych i zaobserwowany proces nadrzędny (sesja 34105): kod 0, zgodne źródła/build/skrypty. 577 = 7 + 570 testów jednostkowych, 11 helperów wydajności; zakończone 18:27:22 UTC | PASS własnych bramek 14 |
| Audyt HTTP | 135 tras, 193 metody, 442 sprawdzenia, 0 failures; własny raport z 18:27:00,940 UTC przy dokładnej tożsamości 14 | PASS smoke; ogólny status HTTP nie potwierdza każdej autoryzacji i operacji biznesowej |
| Granice PNG, renderer i zapis profilu firmy | 68/68 testów, rzeczywisty kod 0; dokładne hashe sześciu plików i logu zachowane | PASS opisanych przypadków; proof targeted nie ma odrębnej kontroli fingerprintu całej aplikacji przed/po, własna frozen tożsamość builda jest osobnym dowodem |
| Kontrast i naciśnięcie Button | 16 własnych stanów kontrastu, 8 próbek rzeczywistego naciśnięcia/zwolnienia, 38 klatek animacji; sesja 98218: kod 0 obu procesów, zgodne źródła. Kontrast jasny 6,45273:1, ciemny 5,84895:1 | PASS opisanych stanów; 2 scoped axe po 0 violations i 1 incomplete |
| Cykl życia faktur | 24 przypadki w Chromium/WebKit/Firefox; sesja 18469: kod 0 obu procesów, zgodne źródła, brak native pageerrors | PASS opisanych przypadków; raw 6 network i 5 console z wstrzykniętych 503 zachowane |
| Zimne kalibrowane strony prywatne | Dashboard 3384,5/3541,7/3484,3 ms; faktury 2793,4/2821,1/2693,9 ms; wszystkie CLS = 0; sesja 98167: kod 0 obu procesów, zgodne źródła | PASS rzeczywistej gotowości danych/critical DOM ≤4 s tych 6 próbek; natywne health-body kontrole 150 ms versus 0 ms dają różnicę 129,3–158,9 ms; nie wszystkie trasy ani UI przy LOAD200 |
| Szczegółowe mobile UI/axe | 42 kontrole w trzech silnikach przy 320/390 px, 16 ekranów Chromium axe: 0 violations, po 1 incomplete; sesja 52606: kod 0 obu procesów, brak native pageerrors | PASS opisanych free/Pro/braku firmy/długich nazw i liczników; warianty danych są testowe, incomplete wymaga manual review |
| Publiczne trzy próby CDP | Własny proces testowy i zaobserwowany proces nadrzędny (sesja 34855): kod 0, zgodne źródła/build; TTFB median 13 ms, LCP median 504 ms, CLS = 0, pojedyncza próbka EventTiming median 40 ms; navigation load 1210,7/1239,3/1263,4 ms | PASS lokalnego profilu; globalny TTFB i field INP niezweryfikowane |
| Pełna macierz Chromium/WebKit/Firefox | Wszystkie 3 silniki ukończone 18:59:30 UTC 2026-10-11; kod procesu testowego 0, zgodne źródła/build/harness i świeże raporty; 1010 kontroli układu / 0 failures, 246 scenariuszy, 33 572 powtarzające się instancje widocznych kontrolek | PASS zakresu harnessu; oryginalny proces nadrzędny sesji 7723 UNKNOWN po przerwie, świeża niezależna kontrola po wznowieniu kod 0; raw 132 network / 93 console, dwie przyczyny niepotwierdzone |
| Zamknięcie prywatnej fixture 14 | Sesja 98119: zaobserwowany kod 0, zgodne źródła; wszystkie 4 własne PIDs nieobecne, porty 45150/34619 odmawiają połączenia, brak aktywnych browser/Next/Mongo | PASS własnego zamknięcia; świeży postgap scan potwierdza brak aktywnych procesów rodzin, lecz pierwotnych PIDs/portu Mongo pełnej macierzy nie zapisano |

Poprawka jest po stronie serwera: natywna asynchroniczna inflacja z limitem wyjścia, dokładne scanline bytes i filtry oraz kontrola całego zużytego wejścia. Renderer usuwa niepotrzebne ancillary chunks przed embedderem; zapisany prawidłowy string logo pozostaje bez zmian. Testy obejmują 30 prawidłowych wariantów koloru/głębi/interlace z rzeczywistym zachowaniem RGB/alpha i osadzeniem w PDF, filtry 0–4, mały Adam7 oraz ucięcie/checksum/output bomb/trailing data/dwa strumienie. Nieprawidłowy zapisany lub pobrany PNG nie dochodzi do embeddera. Company POST/PUT zwraca `400 FIELD_INVALID` i `fieldErrors.logoUrl` bez zapisów/audit; 401/404 pozostają sprawdzone. To wąski dowód, bez certyfikacji wszystkich dekoderów, providerów lub produkcji.

Publiczny CDP 14: Chromium 390×844, CPU ×4, cache wyłączony, service worker zablokowany; skonfigurowano latency 150 ms, download 200 000 B/s i upload 93 750 B/s. Trzy LCP to 608/504/420 ms; wszystkie CLS = 0 i brak błędów strony. Niskiego lokalnego TTFB dokumentu nie skalibrowano jako 150 ms transportu. Jedna skryptowana odmowa zgód daje próbkę EventTiming, bez potwierdzenia field INP lub wszystkich interakcji. Początkowe 7 nowoczesnych skryptów ma **116 669 B gzip (113,93 KiB)**: historyczny budżet 100 KB pozostaje niespełniony. 9 skryptów zaobserwowanych później ma 117 637 B gzip, a legacy nomodule jest osobno; nie zamieniamy tych zakresów. W każdej próbie: 0 żądań fontów, 0 początkowych zewnętrznych arkuszy CSS i 0 wpisów zasobów oznaczonych jako render-blocking. Rozmiary gzip/Brotli obliczono z odkodowanych źródeł; nie potwierdzają kodowania Netlify. Lighthouse 14 nie powtarzano; trzy historyczne próby 10 mają 99/99/99 i ostrzeżenie niepełnego pomiaru.

Pełna macierz zachowuje diagnostykę bez zmiany na zera: 132 obserwacje sieci to 54 anonymous auth 401, 63 NBP 502 przy celowo blokowanym zewnętrznym providerze, 9 negatywnych 404 i 6 reset-password 400. Z 93 obserwacji konsoli: 39 auth 401, 42 NBP 502, 6 negatywnych 404, 4 reset 400 oraz **2 komunikaty wymagające dalszej analizy**. WebKit zgłosił `TypeError: Load failed` podczas pobierania RSC `/invoices/new`, po czym Next przełączył się na nawigację dokumentu; Firefox zgłosił `InvalidStateError` przy opuszczaniu dashboardu. Obecny ślad nie potwierdza ich przyczyn. Końcowe asercje native pageerror przeszły, a trzy osobne raporty private-prefetch mają puste pageErrors; odłączenie listenera przy zamknięciu strony ogranicza obserwację. Nie wyciszono tych komunikatów i nie uznano ich za naprawione.

Kalibrowane prywatne próby mają LCP 2044–2180 ms, więc wcześniejszy cel LCP <1 s pozostaje niespełniony w tym profilu mimo spełnienia aktualnej gotowości strony ≤4 s. Pełne pokrycie wszystkich mikroelementów i ich stanów nadal nie zostało potwierdzone.

[Manifest własnych dowodów 14](../2026-10-08/browser-proof-manifest-final8-candidate14.json) obejmuje 14 oczyszczonych publikacji oraz odrębne hashe surowych dowodów. Wąski skan prywatnych credential/capability tych 14 plików ma 0 findings. To odrębna kontrola zakresu browser proof, przed finalnym globalnym skanem zamrożonego zestawu. [Pełna macierz — summary](../2026-10-08/browser-coverage-summary-final8-candidate14.json) i [świeża kontrola po wznowieniu](../2026-10-08/browser-postgap-guard-final8-candidate14.json) zachowują oryginalny kod procesu testowego 0, UNKNOWN utraconej sesji nadrzędnej i kod 0 niezależnego sprawdzenia.

Odrębna [ograniczona diagnostyka WebKit/Firefox](../2026-10-08/browser-console-focused-manifest-final8-candidate14.json) wykonała 36 kontroli przy 390/1280 px z trzema powtórzeniami, 04:41:23–04:42:53 UTC 2026-10-12. Rzeczywisty proces testowy i zaobserwowany nadrzędny mają kod 0, źródła/build/skrypty pozostały zgodne. Gotowość UI i asercje live native pageerror przeszły. Zachowano 24 przerwane żądania oraz 2 komunikaty Firefox podczas **rzeczywistego odświeżenia**, przy `closing: false`: native pagehide poprzedza je o 30,379/42,837 ms, a panel osiąga critical UI ready 273,309/404,032 ms później. To jedynie związek czasowy, bez identyfikacji wywołania i przyczyny; nie uznano ich za nieszkodliwe ani naprawione. Pierwotnego komunikatu WebKit nie odtworzono, co nie unieważnia wcześniejszej obserwacji. Fixture zamknięto z kodem 0; cztery własne PIDs nieobecne, porty 45151/33745 oraz poprzedni port pełnej macierzy 44416 zamknięte, brak aktywnych browser/Next/Mongo. Pięć publikacji supplementu przeszło odrębny wąski skan credential/capability z 0 findings.

**Initial secret preflight 14, 2026-10-12 UTC:** pierwsza niezmienna migawka 190 plików / 6 657 607 B miała rzeczywisty kod skanera 1 i jedno finding: publiczny status Netlify w raporcie został rozpoznany jako token. Potwierdzono jego znaczenie; identyczny status zapisano zwykłymi słowami z odstępami, bez zmiany config/ignore. Własny rerun o 04:43:14 UTC obejmuje 190 plików / 6 657 621 B i ma rzeczywisty kod skanera 0, 0 findings oraz 0 dopasowań prywatnych danych fixture/JWT. HEAD, config, ignore, zestaw i bytes pozostały zgodne podczas każdej próby. Wynik 1 i klasyfikacja pozostają w JSON. **To początkowy skan sprzed finalnego appendu i publikacji supplementu; dokładny skan zamrożonego zestawu musi przejść przed staging/commitem.** Jego wynik i hash manifestu są odrębnym zewnętrznym dowodem, bez wpisywania własnego hash finalnej migawki w jej treść. Stan main/CI w tym dokumencie jest stanem przed publikacją.

## Element, problem, przyczyna, poprawka i stan

| Element | Problem | Przyczyna źródłowa | Poprawka w lokalnym kodzie | Stan dowodu |
| --- | --- | --- | --- | --- |
| Zależności runtime i build | Znane advisories Next, sharp/librsvg, source-map-js oraz starego łańcucha Tailwind | Podatne wersje i zależności kompilatora Tailwind 3 | Next 15.5.27, sharp 0.35.5, source-map-js 1.2.2; rzeczywista migracja do Tailwind/@tailwindcss/postcss 4.3.3 i tailwind-merge 3.7.0 | **Świeży npm advisory audit 2026-10-11 08:11:43 UTC: kod 0, wszystkie poziomy 0.** Dokładny lockfile SHA-256 `2f92a64eabfb831686dcbe3b57927eeb927cb90b101f27d2eb1dcdd60c523269`; wcześniejsze audyty zachowują własne daty. To sprawdzenie znanych advisories, nie wszystkich luk aplikacji |
| Wygląd po Tailwind 4 | Zmiany resetu, odstępów, gradientów, outline i reduced motion | Inna semantyka generowanego CSS v4 | Zachowanie skali/resetu; ograniczony compatibility pass w rzeczywistym kompilatorze v4 | **PASS w 192 izolowanych porównaniach Chromium:** 0 różnic pikseli/geometrii; ten historyczny test izolowanego CSS nie zastępuje własnej macierzy bieżącego kandydata |
| Tożsamość sesji API | Odczyt API pobierał relacje profili i integracji; typowy fast path wymagał 6 operacji DB | Pełne `getSessionUser` dla endpointów potrzebujących tylko tożsamości | Żywy, indeksowany `readApiIdentity` i `getApiSessionUser`: `id`, `name`, `email`, wygaśnięcie i aktualne MFA w 1 agregacji; osobny legacy upgrade | **PASS w opisanym native proof:** 17 grup kontroli, 22/22 poprawnych odczytów = 22 agregacje; native/API candidate4 integration **PASS, actual exit 0** |
| Członkostwo, uprawnienia i MFA firmy | Wielokrotne odczyty i ryzyko zbyt szerokiego transferu; absent/null BSON nie są równoważne | Osobne lookupy i domyślne wartości Prisma/roli | Jedna `CompanyProfile.aggregateRaw` z indeksowanymi joinami; tylko pola dostępu; nieprawidłowe typy odmawiają dostępu; owner fallback po konflikcie ponownie odczytuje stan | **PASS w finalnej integracji:** 384 native role/flag przypadki, 1201 odczytów = 1201 agregacji; defaults/null/MFA/revoke/transaction/index parity |
| Wyszukiwanie i liczniki faktur | Page/count wykonywały dodatkowe komendy; duże archiwalne wiersze mogły przekroczyć dokument BSON 16 MiB wewnątrz facet | Umieszczenie pełnych wierszy w jednej odpowiedzi `$facet` | Jeden aggregate dla liczb i strony; facet przechowuje wyłącznie ID, potem indeksowany lookup ograniczonych DTO; cursor nadal może wykonać oddzielny anchor lookup | **PASS w finalnej integracji:** 28 native przypadków = 28 agregacji; strona legacy **18 065 584 B >16 MiB**, parity DTO/filters/cursor; nie jest to gwarancja dowolnej wielkości pojedynczej faktury |
| PDF wersji niezmiennych | Powtórne dekodowanie zapisanych bytes i przygotowanie wydruku przy warm PDF | Brak ograniczonego cache niezmiennych wersji | Worker-local LRU 64 MiB/1024 wpisów, kopie Buffer; klucz version/sourceHash; przed użyciem bytes aktualna sesja, faktura, uprawnienia i kontekst | **PASS unit i integracja candidate4:** bounded cache, kopie bytes, niezmienność snapshots/versions i ownership; warm PDF candidate2 miał 4 operacje DB. Candidate5 serial warm PDF **4**, primary PASS/horizontal2 FAIL; candidate6 serial warmPDF4/primary PASS/horizontal2 FAIL |
| Kontekst wydruku podczas wystawienia | Powtórny odczyt firmy i niepotrzebne bankAccounts | Pomijanie profilu sprzedawcy już odczytanego w tej samej transakcji | `captureInvoicePrint` otrzymuje sellerCompany odczytane w tej samej interactive transaction; ponowny odczyt pozostaje dla innej firmy/braku profilu | **PASS unit/integration candidate4**; serial create candidate2 28 operacji (w tym inicjalizacja okresu); candidate5 guarded serial create **32** operacje; candidate6 guarded serial create32; elapsed/load zgodnie z osobnym raportem |
| Logo firmy i PDF | Mały PNG z dużymi wymiarami mógł żądać wielkiej alokacji dekodera | Limit bytes bez ograniczenia rozmiaru po dekodowaniu i pełnej walidacji formatu | Wspólne zasady UI/parser/PDF: PNG/JPG bez animacji, do **2 MiB**, **4096 px na bok**, **4 000 000 pikseli**; walidacja wymiarów przed dekodowaniem, struktury/chunków/CRC PNG i JPEG, canonical base64 oraz publiczny HTTPS | Reprodukcja przed poprawką: 68 B PNG 4096×4096 próbował alokować 67 112 960 B; alokację przechwycono przed wykonaniem. **PASS w unit candidate4**: 427/427 obejmuje logo validation/rendering; raw-provider i browser proof PENDING |
| VIES | Ten sam zalogowany użytkownik mógł przekroczyć 15 zapytań/min przez zmianę IP/instancji | Lokalny limiter IP zamiast wspólnego klucza użytkownika | `rateLimitSubject(user.id, …, "vies-user")`: trwały atomowy licznik Mongo z HMAC, 15/min; brak licznika powoduje błąd zamiast wywołania providera | Reprodukcja przed poprawką: 20/20 HTTP 200 i 20 stubowanych wywołań providera; **PASS w unit candidate4**: quota niezależnych/concurrent users i fail-closed; quota na rzeczywistym Netlify PENDING |
| Granice parsera faktury | Zbyt długie ID pozycji i niezweryfikowane originalLines zwiększały wielkość snapshotów/JSON | Przepuszczenie tablicy klienta jako JSON bez parsera pozycji | ID do 128 znaków; originalLines do 200 pozycji z tym samym parserem pól/liczb i obsługą podpisanej ilości korekty; logo przez wspólny parser | **PASS w unit candidate4:** granice ID/snapshot/parser; cały przebieg 427/427, actual exit 0 |
| Transakcje i odebranie uprawnień | Snapshot uprawnień mógł pozostać ważny dla zapisu po zatwierdzonym revoke/MFA policy change | Odczyt bez współdzielonego konfliktującego zapisu firmy; aktualizacja tym samym timestamp mogła być no-op Mongo | `companyWriteAccess` ponownie autoryzuje w biznesowej transakcji i wykonuje `fenceCompanyWrite`; updatedAt zawsze co najmniej stored+1 ms; team/policy ścierają się o ten sam dokument | **PASS w finalnej integracji:** 11 native race/order/read-only przypadków, P2034 rollback/retry403; actual exit całej integracji 0. Dowód opisuje sprawdzone ścieżki, nie każdą trasę |
| PUT/DELETE faktury i polityka MFA | Nie wszystkie edycje/usunięcia dzieliły fence; no-op aktualizacji UserMfa mógł nie tworzyć konfliktu | Brak wywołania helpera w trzech callbackach; zapis identycznego sekretu bez zmiany czasu | W callbackach PUT obu ścieżek i DELETE `companyWriteAccess`; polityka firmy używa shared fence, UserMfa.updatedAt rośnie również przy tym samym ticku | **PASS w frozen candidate4:** build, unit i native integration; edycja/usunięcie **27 przypadków + 1 parent TAP =28 PASS**, MFA policy **6 controlled przypadków** |
| Katalog produktów i kontrahentów | Odebrana rola lub przeniesiony rekord mógł pozostać autoryzowany według preflight | Brak aktualnego odczytu rekordu/roli i shared fence wewnątrz write transaction | Cztery routes contractors/products i [id] ponownie sprawdzają aktualną firmę/owner/role oraz `companyWriteAccess` przed mutation/audit | **PASS w unit candidate4:** POST/PUT/DELETE, revoke/viewer/current-company/personal-owner ścieżki; 427/427 całej suite |
| KSeF admission i incoming contractor scope | Zmiana permission/MFA między preflight/provider download a zapisem; seller z tym samym NIP innej firmy mógł być zmieniony | Write callbacks poza shared authorization fence i zbyt szeroki lookup kontrahenta | Queue/offline/reservation/import aktualnie autoryzują w swoich transakcjach; lookup/update kontrahenta ograniczony do firmy, legacy personal do null/missing companyId | **PASS 25 named KSeF tests**, direct actual exit 0, również w pełnej unit 427/427; live provider PENDING |
| Legacy personal invoice role | Użytkownik o globalnej roli viewer mógł zmienić własną fakturę legacy mimo dostępu tylko do odczytu; stan roli z preflight mógł być nieaktualny | Osobiste faktury bez sellerCompanyId pomijały aktualny role allowlist wewnątrz write transaction | Normalny PUT, accepted-KSeF PUT, DELETE i personal payment czytają bieżący User.role w transakcji; dopuszczone tylko owner/accountant. POST również wymaga aktualnej roli; guarded native cases sprawdzają viewer/owner/accountant | **PASS targeted i 6/6 frozen gates candidate5; primary PASS, horizontal2 FAIL, browser PENDING:** invoice edit/delete native **43 named tests, actual exit 0**, payment **8 named tests, actual exit 0**. Baseline viewer 200 vs fixed 403/zero artifacts, unknown role 403, role change after preflight 403; accountant nadal dozwolony. Targeted proof nie miał whole-source before guard; native 43 checks powtórzono w passing frozen integration candidate5 |
| Prywatne argumenty zapytań w logach Prisma | Logger błędów mógł zapisać argumenty zapytania zawierające dane faktury | `PrismaClient({ log: ["error"] })` drukuje formatowaną treść błędu/query | `log: []`; błędy aplikacji raportują identyfikator incydentu, fingerprint i tylko kod Pdddd rzeczywistego `PrismaClientKnownRequestError`, bez message/meta/query args | **PASS targeted i 6/6 frozen gates candidate5; primary PASS, horizontal2 FAIL, browser PENDING:** 6 focused log-safety tests +2 istniejące search/log regressions =**8 named PASS, actual exit 0**. Native fresh loopback Prisma odtwarza ujawnienie syntetycznego argumentu w old logger i brak emisji w fixed client; dodatkowo malformed/forged codes/meta są odrzucane. Nie jest to audyt wszystkich loggerów |
| PNG text metadata w logo/PDF | CRC-valid PNG 82 B/1×1 z pustym iTXt dochodził do nieograniczonego skanowania tekstu | Validator nie ograniczał pól rozdzielonych NUL; zainstalowany UPNG przy EOF nadal spełniał `undefined !=0` | Bounded pola tEXt/iTXt, keyword1..79, iTXt flag0/1 i method0; prawidłowe puste pola zachowane | **9 named targeted PASS**, child/runner0, zgodne source/test:10 rzeczywistych valid embed controls i28 malformed cases odrzuconych przed decoder. Oryginalnej nieograniczonej pętli nie wykonano. Własne6 gates/load8 PASS; brak certyfikacji IDAT |
| Compressed PNG przed PDF | CRC-valid PNG 89 B/1×1 przechodził walidację, ale rzeczywisty embedder nie zwrócił wyniku w 700 ms | Walidacja struktury/metadata nie sprawdzała tej granicy strumienia; natywna inflacja zgłosiła Z_BUF_ERROR | Kandydat 14: bounded native inflate, dokładne scanline bytes/filtry i zużyte wejście, usunięcie niepotrzebnych ancillary chunks przed embedderem; firmowe POST/PUT odrzucają zły PNG przed zapisem | Własne 68/68 testów: kod 0, 30 prawidłowych wariantów zachowuje RGB/alpha i rzeczywiste osadzenie PDF; błędny stored/remote PNG nie dochodzi do embeddera. Oryginalny timeout 13/SIGKILL zachowany; własne sześć bramek 14 ma kod 0; prywatne testy i pełna macierz 14 jeszcze wymagane |
| Badge KSeF na stronie głównej | Tekst12px nie osiągał WCAG AA4,5:1 w jasnym motywie | Foreground#047857 na background#d4e5ee dawał4,24:1 | Light `text-emerald-700→800`, dark400 zachowane | Historyczny axe7:1failed/180, child/runner1; pełnej macierzy7 nie wykonano. **Własny axe8:0failed/180 PASS automatyki**,88manual-review screens nadal niesprawdzone |
| Prywatny header / Pro / paginacja | Kandydat 10: prywatny CLS około 0,06108/0,06768 w sześciu zimnych próbach | Slot firmy podnosił header 71→123 px; asynchroniczny Pro przesuwał refresh; status ładowania zmieniał zawijanie paginacji | Kandydat 11 rezerwuje naturalne miejsce firmy/Pro i osobny wiersz statusu na mobile | Historyczne własne 6 próbek 13: CLS = 0/gotowość <4 s, PASS; 42 UI i 16 axe PASS automatyki. Własny retest 14 jeszcze wymagany; wyniki 11/12 zachowane |
| Button podczas zmiany motywu | Szczegółowy axe kandydata 11 wykrył kontrast 1,44:1 po dwóch klatkach | Bazowe `transition-all` interpolowało kolor tekstu i tła; natywny probe po 50 ms ma 1,44653:1, stany ustalone jasny 6,45273:1 / ciemny 5,84895:1 | Kandydat 12 ograniczył transition do transform/box-shadow; kandydat 13 dodaje tylko scale, zachowując 150 ms i wygląd stanów ustalonych | Oryginalny audyt 11: FAIL zachowany. Osobne 16 próbek kontrastu 13 i 16 ekranów szczegółowego axe: PASS automatyki; po 1 incomplete wymaga manual review. Wyniki 12 zachowane |
| Animacja naciśnięcia Button | Lista przejść kandydata 12 pomijała zmianę skali naciśniętego przycisku | Tailwind 4 generuje indywidualne CSS `scale:.98`, którego transition dla `transform` nie obejmuje | Kandydat 13 dodaje tylko `scale` do listy przejść; zachowano 150 ms i brak interpolacji kolorów | Historyczne własne 8 próbek 13: PASS, kod 0; skale pośrednie 0,985168/0,986921 i ustalone 0,98/1, dokładne zegary zachowane. Własny retest 14 jeszcze wymagany |
| Client cookie consent | Niepoprawne percent/UTF8 w consent cookie powodowało URIError i błąd montowania strony | `decodeURIComponent` poza obsługą błędnego cookie; JSON catch nie obejmował dekodowania | `getCookie` łapie błąd decode i zwraca null; istniejący missing-consent flow pokazuje wybór, valid consent/Unicode/false choices zachowane | **Candidate7 targetedunit7/7, frozen full gates i browser21/21 PASS, actualexit0:** 7 przypadków w każdym Chromium/Firefox/WebKit; source/build/wrapper guards stable. Missing/malformed%/UTF8/nonJSON/stale/current consent, H1/HTTP200/banner/recovery poprawne; zero pageerrors. Console/network zachowano (anonymous401, blocked SW, aborted pilot requests), nie są zerowe. Firefox test-only sandbox flag jawny.  Before unit actual1: 4/7 PASS,3 URIError. Before browser14 actual cases Chromium/WebKit:8controls PASS,6 malformed FAIL; Firefox7 nie wykonał nawigacji przez environment newPage/uid_map EROFS/content SIG11. Owned Firefox terminated, testNode finished1, fixture0/port closed; nie zaliczono21attempts jako21 wykonanych |
| Manualny rescan dokumentu | Ten sam zalogowany aktor mógł przekroczyć20/min przez zmianę trustedIP | Limiter kluczowany IP zamiast tożsamością użytkownika | `rateLimitSubject(user.id,{max:20,windowMs:60000},"document-scan-user")`; aktualna auth/access, forced scan, zapisany verdict i quarantine pozostają | **Candidate7 targeted9/9 i frozen full gates PASS, actual0, guards PASS.** Exact old route +real limiter przy mocked atomic Mongo odtwarza40skanów/40IP, sameIP21blocked (before2/2 actual0). Tests: rotatingIPs/concurrency/independent actors, countererror/null failclosed, prequota auth/ID/lookup/access i verdict423. **Bez actual DB/scanner/provider calls; tylko manual rescan20/min**, nie cały upload/scan pipeline |
| Alokacje DTO i formatowanie dat | W profilu CPU obserwowano kopie pól/defaultów/BSON i wielokrotne tworzenie formattera Warsaw | Per-row kopie i konstrukcja `Intl.DateTimeFormat` | Ograniczone DTO i współdzielenie formattera według istniejącej semantyki | Wskazane koszty CPU zmierzone w profilu candidate2; wpływ tej dodatkowej poprawki na throughput/latency **NIEZMIERZONY** |
| Fonty strony głównej | Pobieranie dwóch fontów, których aktualny `font-sans` nie używa | Preload optional self-hosted faces przy systemowym stosie utility | `preload: false` obu localFont; style mogą nadal jawnie użyć `--font-sans` | **PASS świeży Chromium homepage:** zachowany computed systemfont body/H1, zero font preload/request/resource transfer. Historycznie **59 132 B**, obecnie **0 B** w tej próbie; nie jest to izolowany A/B pomiar zysku LCP |
| Kalkulator VAT na małym ekranie | Duże wyniki mogły wymusić szerokość karty/grid | Minimalna szerokość grid item i słabsze łamanie nieprzerwanego tekstu waluty | `grid-cols-1`, `min-w-0` na grid/kartach i `overflow-wrap:anywhere`, zachowana siatka 3 kolumn od `sm` | **PASS actualexit0:** Chromium/Firefox/WebKit ×18 =**54 workflows**, widths320/768/1280; exact money/validation/recovery/keyboard/reload/back i containment document/grid/card/value. Guards stable; zero pageerrors, raw11network/23console observations zachowane |

`npm audit` mówi o znanych advisories konkretnego lockfile, nie o kompletnej odporności aplikacji. Minimalne wersje Tailwind 4: **Safari 16.4, Chrome 111, Firefox 128**. Izolowane fixture Chromium i dziewięć porównań scalania klas nie zastępują regresji tras/interakcji w tych silnikach.

## Co pozostaje nieweryfikowane i dlaczego

| Zakres | Stan | Powód ograniczenia |
| --- | --- | --- |
| Dwa komunikaty konsoli pełnej macierzy 14 | Przyczyna niepotwierdzona, poprawka niezweryfikowana | WebKit RSC `/invoices/new` Load failed z fallbackiem dokumentu oraz Firefox dashboard InvalidStateError przy nawigacji; zachowany ślad nie ustala przyczyny |
| Każdy element i stan UI, obsługa screen reader | Niezweryfikowane w całości | Automatyczne przypadki mają określone trasy i stany; axe ma również incomplete wymagające oceny manualnej |
| Fizyczny Safari/iOS, prawdziwy prompt „Stay” i BFCache | Niezweryfikowane | Playwright WebKit to sprawdzony silnik testowy; część zdarzeń lifecycle jest symulowana |
| Pełne ładowanie UI ≤4 s przy 200 równoczesnych workers, wszystkie strony i użytkownicy | Niezweryfikowane | Kalibrowane strony mierzymy przy spokojnym lokalnym środowisku; LOAD200 kandydata 8 mierzy osobno requesty API. Nie wykonano wspólnego pomiaru pełnej gotowości UI pod tym obciążeniem |
| Pojemność 1000 rzeczywistych użytkowników | Niezweryfikowane | 1000 tenantów to dane syntetycznej fixture; closed-model 200 workers pomija oczekiwanie przed wysłaniem requestu i nie jest produkcyjnym SLA |
| Field INP, globalny TTFB, produkcyjne CWV | Niezweryfikowane | Lokalne próby i pojedyncze interakcje nie zastępują danych użytkowników, regionów, CDN i rzeczywistej sieci |
| Rzeczywiste VIES/KSeF/płatności/email/NBP oraz quota między instancjami Netlify | Niezweryfikowane | Fixture celowo blokuje zewnętrznych providerów i używa syntetycznych danych |
| Pełne bezpieczeństwo aplikacji | Niezweryfikowane | Named native/unit/HTTP checks i skan znanych advisories obejmują opisane przypadki; nie wykonano pełnego testu wszystkich ścieżek i loggerów |
| Finalny CI, publikacja main i dokładna rewizja Netlify | Stan przed publikacją | Lokalne bramki nie są wykonaniem GitHub CI; wynikowy commit/CI wymagają odrębnego późniejszego potwierdzenia. Limit Netlify wyczerpany; dotychczasowy read-only odczyt nie identyfikuje deployed revision |
| TOP 5 i obecność w odpowiedziach AI | Niezweryfikowane | Historyczny eksport Search Console nie zawiera zapytań ani pozycji; poprawki techniczne nie dowodzą wyników wyszukiwania ani cytowań |

**Bramka CI dla narzędzi wydajności:** [verify.yml](../../../.github/workflows/verify.yml) dodaje po `npm run verify` jeden krok `node --test scripts/performance/*.test.mjs`. Wcześniej workflow pomijał te regresje. Parse YAML i sprawdzenie dokładnie jednego nowego kroku oraz `git diff --check` zakończyły się kodem 0. Cztery pliki globu odpowiadają własnemu wcześniejszemu runowi kandydata8: **11/11 PASS**; nie uruchamiano nowych unit/load/browser dla tej zmiany workflow. Wykonanie nowego kroku przez GitHub CI na Node22 pozostaje do sprawdzenia.

**Preflight sekretów:** rzeczywisty Gitleaks **8.24.3** po zmianie kształtu metadanych SHA-256 zakończył się kodem 0 i0 findings: **129 plików /2 393 527 B**, 20:37:51 UTC. Oddzielny skan dostępnej historii Git zakończył się kodem 0 i0 findings w1,95 s: scanner raportuje **386 all-ref commits**, historia HEAD ma **175 ancestors**, repo nie jest shallow. Użyto istniejącego config/ignore bez zmian; nie potwierdzono wersji przypiętego obrazu Docker CI. Są to snapshoty sprzed końcowego zamrożenia dokumentów; świeży skan finalnego zestawu publikacji nadal wymagany.

**Nowszy preflight, 2026-10-11 07:53:42 UTC:** rzeczywisty skan133 plików zakończył się kodem1 z12 findings. Wszystkie12 są zweryfikowanymi, publicznymi SHA-256 źródeł w dwóch mapach opublikowanego failed execution proof; nie są credentials. Zachowano wynik skanu i klasyfikację. Próba zmiany wyłącznie kształtu metadanych na kopii `/tmp` zachowała wszystkie213 par każdej mapy i uzyskała kod0/0 findings. Repozytorium w tej próbie nie zmieniono. Root zlecił właścicielowi browser proof identyczną normalizację po ukończeniu macierzy, bez zmian allowlist/config i bez zmiany surowego executed proof. **Finalny skan zamrożonego zestawu repozytorium nadal PENDING**; zera z kopii `/tmp` nie przypisujemy finalnemu repozytorium.


## Własne wyniki kandydata 13 — historia

Źródła: `92aa9410c23daedf4023ee407a86beea1b353fa030503f9de854d07e52d5a584`; BUILD_ID: `5RPdmv0wKMdKJD1F5KND4`; skrypty: `2f4f1463f9eebf5f3a7e5c11cfd70dcfe30a1467cf441edc269504cda011313f`; parent Git: `f9e1e106d7e61e21cefaa0487e116315fab2348e`.

| Zakres | Własny wynik kandydata 13 | Stan / granica dowodu |
| --- | --- | --- |
| Build, TypeScript, lint, testy jednostkowe, helpery wydajności, integracja | Sześć procesów testowych i zaobserwowany proces nadrzędny (sesja 63345): kod 0, zgodne kontrole źródeł, builda i skryptów. 518 = 7 + 511 testów jednostkowych, 11 helperów wydajności; integracja zakończona 18:05:50,098 UTC | PASS własnych bramek 13 |
| Audyt HTTP | 135 tras, 193 metody, 442 sprawdzenia, 0 failures; własny raport tego builda z 18:05:42,553 UTC | PASS smoke; sam status HTTP nie potwierdza wszystkich autoryzacji i operacji biznesowych |
| Natywny kontrast i animacja naciśnięcia Button | Własne 16 próbek kontrastu i 8 próbek rzeczywistego naciśnięcia/zwolnienia myszy; proces testowy i nadrzędny (sesja 54274): kod 0, zgodne kontrole źródeł | PASS opisanych próbek; kontrast jasny 6,45273:1 / ciemny 5,84895:1, dwa ograniczone axe mają po 0 violations i 1 incomplete, brak błędów strony |
| Regresja cyklu życia faktur | 24 własne scenariusze w Chromium/WebKit/Firefox, brak błędów strony, kod 0 procesów testowego i nadrzędnego (sesja 77414); zgodne kontrole źródeł | PASS opisanych scenariuszy; zachowano 6 wstrzykniętych odpowiedzi 503 i 4 obserwacje konsoli |
| Sześć kalibrowanych próbek stron prywatnych | Dashboard 3577,6/3534,5/3566,4 ms; faktury 2794,0/2742,9/2726,6 ms; wszystkie CLS = 0. Kod 0 obu procesów (sesja 84294), zgodne kontrole źródeł | PASS rzeczywistej gotowości danych/DOM <4 s w tym zimnym profilu mobile; natywne kontrole opóźnienia treści 146,1–156,8 ms. Pozostałe trasy, produkcja i wspólny pomiar UI/LOAD200 niezweryfikowane |
| Szczegółowe mobile UI/axe | 42 sprawdzenia w trzech silnikach przy 320/390 px, 16 ekranów axe w Chromium: 0 violations, po 1 incomplete. Kod 0 obu procesów (sesja 50974), zgodne kontrole źródeł, brak błędów strony | PASS sprawdzonych stanów firmy/Pro/braku firmy/długich nazw i liczników; warianty odpowiedzi są testowe, incomplete wymaga manual review |
| Nowa granica compressed PNG | Validator zaakceptował CRC-valid PNG 89 B/1×1; natywna inflacja zwróciła Z_BUF_ERROR. Rzeczywisty embedder PDF nie zwrócił wyniku w 700 ms; własny proces zakończony SIGKILL | Potwierdzona usterka. Kod 0 diagnostycznego wrappera nie oznacza PASS bezpieczeństwa aplikacji; obserwacja limitu 700 ms nie dowodzi nieskończonej pętli |
| Publiczne trzy próby CDP i pełna macierz Chromium/WebKit/Firefox | Nie wykonano po nowym błędzie PNG | NOT EXECUTED; nie zastępują ich wcześniejsze wąskie PASS |
| Zamknięcie fixture 13 | Rzeczywisty kod 0 (sesja 18323), źródła/build zgodne; znane procesy fixture/Next nieobecne, porty 45149/41719 odmawiają połączenia, brak aktywnych procesów rodziny fixture i przeglądarek | PASS opisanej kontroli; osobne PIDs Mongo/helper pozostały nieznane po ENOENT przy odczycie `/proc`, nie odtworzono ich. 684 stare zombie są nieaktywne i nie zostały uznane za usunięte |

Button ma teraz `transition-[transform,scale,box-shadow]`; zachowano 150 ms i wygląd ustalonych motywów. Tailwind 4 realizuje `active:scale-[0.98]` przez indywidualną właściwość `scale`, której lista `transform,box-shadow` nie animowała. Edycję 13 wykonano dopiero po rzeczywistym stabilnym zamknięciu fixture 12.

Rzeczywiste zdarzenia myszy mają `isTrusted: true`. Pośrednia skala wyniosła 0,985168 przy naciśnięciu i 0,986921 po zwolnieniu; stany ustalone to 0,98 i 1. Etykieta „50 ms” oznacza oczekiwanie harnessu: faktyczna próbka nastąpiła 95,0 ms po pointerdown i 54,1 ms po pointerup. Zachowano oba zegary, zamiast traktować etykietę jako dokładny czas zdarzenia.

Ta usterka stała się przyczyną odrębnej poprawki 14, wykonanej po rzeczywistym zamknięciu fixture 13. Diagnostyka używała syntetycznego jednego piksela, bez sieci i zapisów produkcyjnych. Wyniki UI 13 zachowują własną tożsamość i nie zostały przepisane na wynik bezpieczeństwa ani na kandydata 14.

[Manifest własnych dowodów 13](../2026-10-08/browser-proof-manifest-final8-candidate13.json) wskazuje 10 oczyszczonych publikacji i odrębne hashe surowych plików. Skan prywatnych credential/capability tych 10 plików ma 0 findings; nie zastępuje finalnego globalnego Gitleaks. Wspólna ścieżka raw HTTP `artifacts/functional/http-audit.json` została zastąpiona raportem 14; JSON zachowuje oryginalny skrót, tożsamość i istotny wyciąg 13, ale nie deklaruje obecnej dostępności jego pełnych raw bytes pod tą ścieżką.

## Własne wyniki kandydata 12 — historia

Źródła: `f8834e647f1e76eab6a036a9db2f857ee5e33494d18534c495fdad7e60d17249`; BUILD_ID: `ZictPZLvCsULwvfac2O8w`; skrypty: `2f4f1463f9eebf5f3a7e5c11cfd70dcfe30a1467cf441edc269504cda011313f`; parent Git: `f9e1e106d7e61e21cefaa0487e116315fab2348e`.

| Zakres | Własny wynik kandydata 12 | Stan / granica dowodu |
| --- | --- | --- |
| Build, TypeScript, lint, testy jednostkowe, helpery wydajności, integracja | Sześć procesów testowych: kod 0, zgodne kontrole źródeł, builda i skryptów; integracja zakończona 13:45:49,043 UTC | PASS procesów testowych; pierwotny wynik procesu nadrzędnego (sesja 3443) pozostaje UNKNOWN po przerwie związanej z limitem i wznowieniem sesji |
| Niezależna kontrola po wznowieniu | Root zaobserwował własny kod 0, 17:57:14,725 UTC; obecne źródła, build, skrypty i parent zgodne z sześcioma dowodami | PASS sprawdzenia zgodności; nie odzyskuje wyniku sesji 3443 i nie jest ponownym testem |
| Testy jednostkowe i helpery wydajności | 518 = 7 + 511 testów jednostkowych; 11 helperów wydajności | PASS |
| Przejście kolorów Button | 16 własnych próbek: oba kierunki zmiany motywu po 0/50/150/400/1400 ms oraz rzeczywiste hover/focus; kontrast jasny 6,45273:1, ciemny 5,84895:1. Proces testowy i nadrzędny: kod 0, zgodne kontrole źródeł | PASS tych próbek; dwa ograniczone audyty axe mają po 0 violations i 1 incomplete, bez błędów strony. Wszystkie warianty i stany UI nie zostały sprawdzone |
| Regresja cyklu życia faktur | 24 sprawdzenia w Chromium/WebKit/Firefox, kod 0 procesów testowego i nadrzędnego, zgodne kontrole źródeł; 0 błędów strony, zachowane 6 obserwacji sieci i 5 konsoli | PASS opisanych scenariuszy; rzeczywisty prompt „Stay”, BFCache i fizyczny Safari niezweryfikowane |
| Sześć kalibrowanych próbek stron prywatnych | Dashboard 3273,8/3495,5/3454,5 ms; faktury 2739,2/2657,8/2802,5 ms. Wszystkie CLS = 0; kod 0 obu procesów, zgodne kontrole źródeł i natywne kontrole opóźnienia treści 148,9–157,5 ms | PASS tych zimnych próbek i profilu; pozostałe trasy, produkcja i UI przy LOAD200 niezweryfikowane |
| Zamknięcie fixture | Sesja 24361: rzeczywisty kod 0 i zgodne źródła/build 12; wszystkie własne procesy nieobecne, porty 45148/45735 odmawiają połączenia, brak aktywnych przeglądarek | PASS własnego zamknięcia 12; edycję 13 wykonano po tym potwierdzeniu |
| Szczegółowe UI/axe, strona główna i pełna macierz | Nie wykonano przed korektą animacji scale w kandydacie 13 | NOT EXECUTED; Lighthouse 10 pozostaje historycznym baseline z ostrzeżeniami |

Zmiana 11→12 ogranicza się do bazowego Button: `transition-all` zastąpiono `transition-[transform,box-shadow]`, zachowując 150 ms, wygląd stanów ustalonych i animację transform/shadow. Nie wykonano nowego backendowego LOAD200; backend pozostaje niezmieniony.

[Manifest własnych dowodów 12](../2026-10-08/browser-proof-manifest-final8-candidate12.json) wskazuje osiem oczyszczonych publikacji i odrębne hashe surowych plików. Prywatny skan credential/capability tych ośmiu plików ma 0 findings; to nie końcowy globalny Gitleaks. Szczegółowego UI/axe, CDP i pełnej macierzy 12 nie wykonano przed korektą scale 13.

## Własne wyniki kandydata 11 — historia

Źródła: `bcd2f1fd6b309404a91d162e6e5fa5afde66c847219b8e035e5fc66f29b884a0`; BUILD_ID: `r-VhHAA5roCm5-zjj7zzk`; skrypty: `2f4f1463f9eebf5f3a7e5c11cfd70dcfe30a1467cf441edc269504cda011313f`.

| Zakres | Własny wynik kandydata 11 | Stan / granica dowodu |
| --- | --- | --- |
| Build, TypeScript, lint, testy jednostkowe, helpery wydajności, integracja | Sześć procesów testowych i zaobserwowany proces nadrzędny (sesja 92996): kod 0; zgodne kontrole źródeł | PASS w opisanym zakresie |
| Testy jednostkowe i helpery wydajności | 518 = 7 + 511 testów jednostkowych; 11 helperów wydajności | PASS |
| Regresja cyklu życia w trzech silnikach | 24 własne sprawdzenia, kod 0, brak błędów strony, zgodne kontrole źródeł | PASS opisanych scenariuszy |
| Prywatne strony, CLS i ≤4 s | Sześć własnych kalibrowanych próbek: dashboard 3393,8/3511,8/3539,0 ms; faktury 2839,1/2835,9/2855,0 ms; CLS = 0 we wszystkich | PASS tych próbek i profilu; pozostałe trasy i produkcja niezweryfikowane |
| Szczegółowe mobile UI/axe | Pierwszy harness używał błędnego kontekstu bez dotyku. Poprawiona próba: 15 sprawdzeń UI PASS, kod 1 na pierwszym axe jasnego dashboardu z kontrastem 1,44:1 („Uruchom samouczek”); 15 pozostałych ekranów axe niewykonanych | FAIL tej próby; osobny natywny probe CSS potwierdził interpolację kolorów podczas zmiany motywu |
| Strona główna | CDP i Lighthouse 11 niewykonane | NOT EXECUTED; Lighthouse 10 pozostaje własnym baseline |
| Pełna macierz Chromium/WebKit/Firefox | Nie wykonano po potwierdzeniu błędu kontrastu | NOT EXECUTED |

W kandydacie 11 zarezerwowano naturalną geometrię company/Pro przed odpowiedzią API i przeniesiono status paginacji do osobnego wiersza na mobile. Backend i helper cyklu życia nie zmieniły się. Sześć własnych kalibrowanych próbek potwierdziło CLS = 0 po wcześniejszym 0,06108/0,06768 oraz gotowość rzeczywistych danych/DOM <4 s. Różnice czasów nie dowodzą wpływu pojedynczej zmiany bez izolowanego eksperymentu.

Osobny natywny probe CSS (sesja 88170) zakończył się kodem 0 przy zgodnych kontrolach źródeł 11. Po 50 ms jasnego przejścia Button miał fg #616571 / bg #746eef i kontrast 1,44653:1; stany ustalone miały 6,45273:1 w jasnym i 5,84895:1 w ciemnym motywie, także hover/focus w jasnym 6,45273:1. Oba ustalone audyty axe miały 0 violations. To rzeczywista usterka stanu przejściowego; wcześniejszy kod 1 szczegółowego audytu pozostaje FAIL.

Zamknięcie fixture 11 (sesja 97928) rzeczywiście zakończyło się kodem 1: kontrola odczytała zmianę źródeł 11→12 podczas krótkiej równoległej edycji/przywrócenia po zamknięciu przeglądarek. Next/Mongo i porty zamknięto. Wcześniejsze zgodne kontrole poszczególnych faz 11 zachowują swój zakres; zamknięcia fixture nie oznaczono jako PASS.

## Własny baseline10 i nieudane próby9 — historia

Source10: `339037ad2014ec8b03ef191e33c1cb9eb476bc67b638aedf44646795299a903a`, build `mGIX8LuaRXDVJdRJZL6nm`. Własne 6 bramek, 518 unit/11 performance-unit, [targeted24](../2026-10-08/invoice-navigation-lifecycle-candidate10-targeted.json), CDP3/Lighthouse3 i [kalibrowane private6](../2026-10-08/private-mobile-page-candidate10-calibrated.json) zakończyły się kodem 0 przy zgodnych guards. Nie wykonano jego pełnej macierzy po wykryciu prywatnego CLS.

| Własny pomiar10 | Zachowany wynik i ograniczenie |
| --- | --- |
| Publiczny CDP3 | TTFB lokalne12,4 ms, LCP424 ms, CLS0, pojedynczy EventTiming40 ms; native navigation load1223,6/1240,1/1235,4 ms. Skonfigurowana latency150 ms nie kalibruje document TTFB ani globalnej sieci. |
| Lighthouse mobile3 | 99/99/99, mediana LCP1868,72 ms/TBT73/CLS0; wszystkie trzy capture incomplete. To własny baseline10, nie pomiar11. |
| Startup strony głównej | 7 modern scripts:116 667 B computedgzip,389 395 B raw,0 font resources/blocking entries. Ponad pierwotnym budżetem100KB; encoding CDN i field INP niezweryfikowane. |
| Kalibrowane strony prywatne | Dashboard3472,2/3576,9/3695,2 ms; invoices2708,4/2726,4/2775,3 ms; health150vs0 body delta142,9–156,7 ms. Tylko te cold próbki/profil390×844 CPU4/cache-SW off, nie allroutes/produkcja. |
| Potwierdzony prywatny CLS | Dashboard0,06108/invoices0,06768. Header71→123px, async Pro przesuwał refresh, loading status zmieniał wrap paginacji; przyczyna wąskiej poprawki11. |

[Wcześniejsze private6](../2026-10-08/private-mobile-page-candidate10.json) zachowują odrębne zastrzeżenie o interception/nieskalibrowanej latency. Pierwszy targeted10 miał kod1 przez tymczasowy harness i 5 sprawdzonych przypadków; poprawiony rerun miał24/24 PASS,0 native pageerrors i zachowane6 network/4 console observations. Actual native cancel/signal-abort i trusted `window.stop` sprawdzono; legacy beforeunload/persisted pageshow były symulowane, rzeczywisty prompt „Stay”, BFCache i Safari/iOS pozostają niezweryfikowane. Fixture10 cleanup11712 rzeczywiście zakończył się kodem0; własne procesy/porty zamknięto. Hashe i wyciągi są w companion JSON.

**Krótka historia9:** pierwszy gate przerwano kodem143; draft-rerun1 ukończył bramki i wymagał kolejnej poprawki. Final9-rerun2 miał6 child exits0 i512 unit; utracony root wait pozostaje UNKNOWN. Poprawiony [targeted9](../2026-10-08/invoice-navigation-lifecycle-candidate9-targeted-failure.json) rzeczywiście zakończył się kodem1 z native WebKit pageerror; pozostałych silników i pełnej macierzy9 nie wykonano. Pierwszy błąd locatora i późniejsza usterka aplikacji są zachowane osobno.

**Ostatni backendowy LOAD200 — source8:** 0 błędów,920/920/920 zgodnych zapisów; przy200 odczyty API ≤2298,93 ms, create p95/max9639,44/10162,80 ms. Create/save/PDF są poza aktualnym limitem ładowania strony/sekcji4 s. Pośrednia interpretacja5 s dla wszystkich żądań jest nieaktualna; dawne tabele<1 s zachowują poprzedni cel i wartości. Nie ma nowego LOAD11 ani transferu tych czasów na11.

## Historyczne własne wyniki kandydata 8

Źródła: `bb3bd5f9c2ef1713f0f37d20eba90a7ffe293df2bc4ecf5893d54645fedb5927`; BUILD_ID: `xgSEexMkddck8HqP_WFBa`. Każda ukończona faza ma własny raport i zgodne hashe źródła, builda oraz harnessu przed i po wykonaniu. Wyniki testów nie potwierdzają wdrożenia tego builda.

| Zakres | Własny wynik kandydata 8 | Stan / granica dowodu |
| --- | --- | --- |
| Build, TypeScript, lint, unit, performance-unit, integration | Wszystkie sześć procesów i nadrzędny runner zakończyły się kodem 0 | PASS w opisanym zakresie |
| Testy jednostkowe i helpery wydajności | 505 = 7 + 498 unit; 11 performance-unit | PASS |
| Audyt HTTP | 135 tras, 193 metody, 442 wyniki, 0 błędów | PASS; ogólny status HTTP nie dowodzi każdej operacji biznesowej |
| Test obciążenia | Wszystkie cztery etapy bez błędów; 920 odpowiedzi create = 920 faktur = 920 claims | PASS integralności; poprzedni historyczny cel <1 s był niespełniony |
| Zgody cookies | Chromium, Firefox i WebKit: 21/21 scenariuszy | PASS |
| Kalkulatory VAT i limitu KSeF | Trzy silniki, szerokości 320/768/1280: 54/54 scenariuszy | PASS |
| Automatyczna dostępność axe | 90 tras, 180 ekranów, 0 failed screens; 88 ekranów wymaga oceny manualnej | PASS automatyki; bez certyfikacji manualnej i screen reader |
| Pełna macierz przeglądarek, rerun2 | Kod 1; Chromium PASS, WebKit pageerror, Firefox niewykonany; 713 layout checks i 0 layout failures | FAIL; wymagane poprawka lifecycle i pełny retest |

Pomiary strony głównej to trzy zimne próby CDP i trzy próby Lighthouse mobile na loopback. Oba procesy oraz nadrzędny runner zakończyły się kodem 0.

| Cel | Własny wynik kandydata 8 | Stan / zakres |
| --- | --- | --- |
| TTFB <100 ms | CDP mediana **11,9 ms**; probe origin **44,03 ms**; Lighthouse server response **11 ms** | Spełniony w lokalnych próbach; globalny i Netlify TTFB niezweryfikowany |
| LCP <1 s | CDP **576/436/412 ms**, mediana **436 ms**; Lighthouse **2144,52/1863,14/2146,48 ms**, mediana **2144,52 ms** | CDP PASS; Lighthouse **UNMET**; profile są odmienne |
| INP <100 ms | Jeden scripted cookie-reject: EventTiming **32/40/40 ms** | Field INP niezweryfikowany; pojedyncza interakcja lab nie jest pomiarem INP |
| CLS =0 | Wszystkie próby CDP i Lighthouse: **0** | PASS w tych próbach |
| Lighthouse Performance 100 mobile | **94/99/98**, mediana **98**; TBT **252/66/99 ms** | **UNMET**; wszystkie trzy próby mają ostrzeżenie niepełnego capture |
| Homepage startup JS <100 KB gzip | 7 modern scripts, **116 668 B gzip ≈113,93 KiB**; raw **389 395 B**; obliczone Brotli **99 406 B** | **UNMET** dla 100 000 B i 100 KiB; obliczona kompresja nie dowodzi rzeczywistego kodowania CDN |
| Authenticated dashboard JS <100 KB gzip | Chromium/WebKit: **324 937 B ≈317,32 KiB**,22 script paths, decoded **1 103 724 B** | **UNMET**; local gzip estimate z initial/3s-settled baseline, Firefox niewykonany, rzeczywiste CDN encoding niepotwierdzone |
| Fonty i render-blocking | CDP3: **0 font responses/transfer**, 0 external stylesheets, 0 resource entries oznaczonych blocking | PASS w tym profilu; świeży Chromium potwierdził systemowy font body/H1 |

**Wszystkie trzy próby Lighthouse ostrzegają:** „The page loaded too slowly to finish within the time limit. Results may be incomplete.” Zachowano wszystkie wyniki 94/99/98; kod zakończenia 0 nie usuwa tego ograniczenia. Nie ustalono przyczyny niepełnego capture ani izolowanego wpływu zmian 7→8. Konfiguracje pomiarów, trzy serie i hashe surowych plików są w companion JSON. Profile i ograniczenia kompresji opisuje także historyczny pomiar kandydata 7.

WebSHA `f1debace41b6cf9799e4c080225b9ff544af7391c1cc89f11ebc8d1efcca818f`; LHSHA `3f67f3223e4bf56f7f234a4234b8795fe2f15387d82de759c9e6aa718a807d4b`; executionSHA `2507b4ff526dfc124313e7b5b65d649f4c3bc35d9078bd1868f8306f8be23059`.

**Zgody cookies: 21/21 PASS.** Proces testów i nadrzędny runner zakończyły się kodem 0; hashe źródeł, builda, komponentu i runtime pozostały zgodne. Każdy z trzech silników wykonał siedem przypadków: brak cookie, błędne kodowanie procentowe/UTF-8, wartość niebędąca JSON, stary i aktualny format. Banner, HTTP200, H1 i recovery działały poprawnie; zero pageerrors. Obserwacje console/network zachowano. Firefox używa jawnego flagu wyłącznie w środowisku testowym. Raport SHA-256 `b49710053b42598a5ad4f6945f3b3520cdfe544b32e391c4e78f77695d94be17`.

**Kalkulatory: 54/54 PASS**, po 18 scenariuszy w Chromium, Firefox i WebKit na szerokościach 320/768/1280, **20:34:48–20:35:29 UTC**. Child i outer mają rzeczywisty exit0, a source/build/runtime guards pozostały zgodne. Sprawdzono dokładne kwoty i stawki VAT, polskie separatory, puste/błędne/skrajne dane, containment dokumentu/grid/kart/wartości, obsługę klawiaturą, odświeżenie i przycisk wstecz oraz granice limitu KSeF. Świeży Chromium homepage zachowuje systemowy font body/H1 i ma **0 font requests/preloads/transfers**; nie jest to izolowany pomiar zysku LCP. Zero pageerrors; surowe **11 network i 23 console observations** zachowano (anonymous401, przerwane pilot DELETE przy nawigacji i blokada SW w testach). Rzeczywisty Safari/iOS pozostaje niesprawdzony. Report SHA-256 `40540798518c53e14738e92788287ca942e0a9f5a727099751fe04f9aa6a9009`; execution/log hashes i konfiguracja środowiska są w companion JSON. Axe180 ma PASS automatyki; pełna macierz8 rerun2 ma FAIL opisany poniżej.


**Dostępność axe: 180 ekranów, 0 automatycznie wykrytych błędów.** Rzeczywisty axe **4.14.0** sprawdził 90 tras w jasnym i ciemnym motywie, Chromium 1280×900, **20:36:07–20:41:59 UTC**. Proces i nadrzędny runner zakończyły się kodem 0; source/build/runtime guards pozostały zgodne. Wszystkie 180 nawigacji zwróciło HTTP200, zachowało docelowy pathname i nie wywołało pageerror. Poprawiona etykieta KSeF na stronie głównej przechodzi regułę kontrastu. **88 ekranów ma incomplete wymagające oceny manualnej**; automatyka nie potwierdza wszystkich stanów, klawiatury ani screen reader. Zachowano 201 obserwacji sieciowych i22 console:8 anonymous auth401,179 przerwanych pilot DELETE podczas nawigacji i14 NBP502 w fixture blokującym zewnętrznych providerów. Sukces rzeczywistego NBP nie był sprawdzany. [Oczyszczony raport axe8](../2026-10-08/accessibility-routes-final8-candidate8.json) ma SHA-256 `79d64f16c176a02302c4c5712a05978313a3b5b7abb9fea3c5be596494f30a8f`; surowy prywatny raport ma odrębny hash `927a83b201b435ec77eb53cc846e2426047475b43344999764d1067ccfa63308`.

**Pierwsza próba pełnej macierzy: FAIL, 20:43:17–20:45:34 UTC 2026-10-10.** Retained proof zapisuje child i runner fazy z kodem 1 przy zgodnych hashach źródła, builda i harnessu. Oryginalny zewnętrzny unified-exec wait status jest po przerwie nieobserwowalny; nie przypisano mu kodu zakończenia. W Chromium przeszło 19 wczesnych scenariuszy prefetch/zgód/druku/focus. Następnie `ui-primitives-regression.mjs:280` oczekiwał CSS `clip: rect(0px, 0px, 0px, 0px)`, lecz odczytał `clip: auto`. Późniejszy focused probe potwierdził poprawne ukrywanie przez `clip-path: inset(50%)` w trzech silnikach; pierwotna asercja była zależna od starej postaci CSS. Wynik tej nieudanej próby pozostaje FAIL. Żaden silnik nie ukończył pełnej fazy; WebKit/Firefox, inventory tras i layout checks nie wykonały się. Zera w nieukończonym inventory nie oznaczają braku usterek. Zachowano [failed summary](../2026-10-08/browser-coverage-summary-final8-candidate8.json) oraz [execution proof](../2026-10-08/browser-execution-final8-candidate8.json); nieudana próba nie zastępuje oddzielnych PASS consent21/calculator54/axe180.

**Doprecyzowanie przyczyny asercji, 2026-10-11:** osobny focused probe z niezmienionym rzeczywistym Select i CSS wykazał w Chromium/WebKit/Firefox `clip: auto` oraz `clip-path: inset(50%)`. Native proxy ma1×1px, absolute/margin-1, aria-hidden i brak tab stop; dostępny custom combobox pozostaje jeden. Dokument zachowuje320px mimo wewnętrznych960px, wymagane puste pole blokuje submit, a prawidłowy wybór trafia do FormData; zero pageerrors. **Cały probe ma kod1**, ponieważ pomocnicza negatywna kontrola wymagała dokładnie czerwonego piksela: WebKit zwrócił254/62/63 przez antialiasing, pozostałe silniki255/0/0; clipped control we wszystkich trzech ma tło248/249/252. Nie przepisano tego runu jako PASS. Wyniki pozwalają sprawdzić zgodność asercji z nowym sposobem ukrywania Tailwind4; Root autoryzował wyłącznie zmianę testu akceptującą legacy zero-rect albo `clip-path: inset(50%)`, zachowując wszystkie guards. Planowany pełny retest ma odrębny label `final8-candidate8-rerun2` i nowy hash harnessu. Aplikacja/build8 pozostają takie same. Wcześniejsze gates/load/performance/consent/axe zachowują swój oryginalny, datowany harness; nie przypisujemy im wykonania nowej wersji testów. Późniejszy pełny rerun2 zakończył się FAIL na innym pageerror, opisanym poniżej. Probe SHA-256 `9aef23ce12501e087fd1ff48c6db9bafee5037ba13f082a7796e3a1dfe5b60e8`.

**Publikowana postać failed execution proof:** właściciel raportu zmienił wyłącznie mapy hashów na uporządkowane rekordy `{path, sha256}`:213/213 wpisów harnessu i3/3 runtime. Wszystkie ścieżki, hash bytes i kolejność są zachowane. Bieżący opublikowany plik ma hash `f5ad664c8550e291ad834a7df9e1d3877f8a84c6a1723a585b2e51b9852d9c8c`; oryginalny prywatny executed proof i wcześniejsza publikowana postać mają `88ccec1b70378c27fcddaa4c3074fdc9989fbd89835b2f79e855fc9f9c6bc678`. Format nie zmienia rzeczywistego wyniku failure ani runtime wrapperów. Finalny skan repozytorium nadal wymagany.

**Focused retest PASS i wersja harnessu:** osobny rerun1 zakończył się rzeczywistym owned exit0; wszystkie trzy silniki przeszły kontrole ukrywania, dostępności, walidacji, FormData i pikselowego negative control. Fixture port zamknięto, aktywnych przeglądarek nie ma. Pierwszy zbyt ścisły diagnostic1 pozostaje zachowany. Następnie zmieniono wyłącznie `scripts/audit/ui-primitives-regression.mjs`: zapisuje clipPath/overflow i akceptuje legacy zero-rect albo dokładne inset50, zachowując pozostałe asercje. **Źródła aplikacji, CSS i BUILD_ID8 nie zmieniły się.** Oryginalne gates/load/performance/consent/axe wykonano z fingerprintem scripts `5efdb143…`; nowy pełny matrix `final8-candidate8-rerun2` jest uruchomiony z `7a637490…`. Jego późniejszy wynik to FAIL opisany poniżej. Focused rerun SHA-256 `6f5a5c3e8293f866c92abeead1cea07d31a31e0190ac732f51c016cec6f969ea`; szczegóły zmiany i oba pełne fingerprints są w companion JSON.

**Pełna macierz rerun2: FAIL, 2026-10-11 07:44:15–08:01:37 UTC.** Child, runner fazy i rzeczywiście obserwowany owned session93638 zakończyły się kodem1; źródła/build8 i zrewidowany harness7a pozostały zgodne. Chromium ukończył fazę; WebKit zatrzymał się na końcowej asercji pageerror z komunikatem access-control dla same-origin `/api/invoices/search`. Firefox nie wykonał fazy. Zebrano **713 layout checks/0 layout failures**, **23 977 powtarzających się visible-control instances**, **164 scenariusze**, oraz raw **90 network/92 console observations**. Te liczby nie oznaczają23 977 odrębnych przycisków ani pełnego pokrycia stanów UI. Passive hydrated probe powiązał native pageerror ze starym dokumentem faktur podczas opuszczania strony:8 ms po beforeunload i32 ms przed pagehide tego samego dokumentu. W6 cyklach odnotowano1 native pageerror,0 DOMerror/0 unhandled i8 search requests. Probe zakończył się kodem0 jako diagnostyka, nie jako browser PASS; wąska poprawka lifecycle i jej retest pozostają wymagane. Pierwotnego failure nie pominięto ani nie przeklasyfikowano. [Oczyszczona diagnostyka lifecycle](../2026-10-08/invoice-navigation-lifecycle-candidate8-diagnostic.json) zachowuje również wcześniejszy niekonkluzywny probe i ograniczenia obserwacji Navigation API. Cleanup potwierdził brak aktywnych browser/Next/Mongo i zamknięty port. [Oczyszczony summary rerun2](../2026-10-08/browser-coverage-summary-final8-candidate8-rerun2.json) SHA-256 `0cf28699a91dbf5ea4954b226dd0eedd7238f047b7358c5cc29bf8e40c7cc07a`; [published execution](../2026-10-08/browser-execution-final8-candidate8-rerun2.json) ma `9be663db4cfda78089a02c30f7423471f120714c6c65262cbb1925adbe981e54`, raw executed proof `225f993d17facdc60f784b21b676e0cf6229d86c486493defc96ecb43de41bc0`.

**Prywatny dashboard ma większy koszt JS niż homepage.** Rzeczywiście wykonane moduły Chromium iWebKit mają po11 scenariuszy nawigacji/history/intent i12 checks,0 pageerrors we własnym zakresie. Dashboard initial/3-sekundowy settled baseline ma22 script paths, decoded1 103 724B i local gzip estimate **324 937B ≈317,32KiB**. To nie jest homepage116 668B, rzeczywisty CDN transfer ani dowód zysku latency z prefetch. Warmup formularza następuje po pointer/focus w normalnym trybie; SaveData/2G/slow-2G pomijają go w sprawdzonych browser overrides. Nie mierzono fizycznego wolnego łącza. Snapshot zawiera również starsze pliki Firefox, ale **nie używamy ich jako dowodu niewykonanej fazy Firefox**.

**Historyczne obciążenie8 i poprzedni cel <1 s — jeden proces aplikacji:** oba procesy testu zakończyły się kodem 0, hashe źródła/builda/harnessu pozostały zgodne, a cleanup potwierdził zamknięcie własnych procesów i portów. Wszystkie cztery etapy miały 0 błędów i 920/920/920 zgodnych create/faktur/claims.

| Wykonawcy | Żądania/s | p95 ms | Maksimum ms | Żądania ≥1 s | Każde żądanie <1 s |
| --- | ---: | ---: | ---: | --- | --- |
| 20 | 124,33 | 533,39 | 740,44 | 0/1887 | PASS w tej próbie |
| 50 | 119,06 | 2607,34 | 3070,60 | 189/1834 | UNMET |
| 100 | 129,02 | 5280,31 | 6567,91 | 249/2063 | UNMET |
| 200 | 121,20 | 8911,94 | 10 162,80 | 682/2093 (32,5848%) | UNMET |

Throughput przy 200 był o 33,98% wyższy niż historyczny baseline 90,46 RPS, lecz p95 również wzrosło. Bez powtórzeń i izolowanego eksperymentu nie przypisujemy różnicy pojedynczej poprawce. To model zamknięty, bez think time, 1000 syntetycznych tenantów ×30 początkowych faktur, 15 s na etap; aplikacja, Mongo i generator dzielą limit 2 CPU/8 GiB. Nie dowodzi obsługi 1000 równoczesnych użytkowników na Netlify. Nie wykonano osobnych serial/smoke/horizontal dla kandydata 8; historyczne błędy dwóch instancji z prób 5/6 zachowano osobno. Prywatny startup-only log ma 189 B i mode0600; brak wskazanych markerów błędów w tym logu nie jest audytem wszystkich błędów aplikacji.

Raport SHA-256 `92f78e149d1599a1e6a847f77865c2562f7115778ee4dd50726e7aff4a98aa9a`; cleanup `9c34a789eab1484cd868ee1b286a283867eb9838f583caf874ce66e2b023971a`. [Raport LOAD200](../../performance/LOAD200-2026-10-10.md) zawiera metodę, polecenie i zachowane historyczne próby.
## Historia bramek i prób 3–10

Poniższa tabela zachowuje wyniki i dawne cutoffs każdej próby. Aktualny kandydat jest opisany na początku raportu; historyczne PENDING zachowują swój datowany zakres.

| Kandydat / bramka | Wynik i zakres danej próby |
| --- | --- |
| Candidate3 build | **PASS, actual exit 0**, source przed/po `066a7cc7b7a9ccb747433e722be09372759f4728ed52b98c53f06725484d4b30`, BUILD_ID `8C3MSn2RY9Y0-3XzOlSZP` |
| Candidate3 typecheck i lint | **PASS, actual exit 0**, ten sam guard źródła/builda |
| Candidate3 pełne `npm test` | **FAIL / niedokończone**: pierwsza faza test:fixes 6/7; fixture nie miał updatedAt wymaganej przez nowy fence. Główna suite nie ruszyła; wrapper nie zapisał actual exit tej fazy. Nie oznaczamy całej suite jako PASS |
| Retest poprawionych fixture | Log ma **12/12 PASS**; osobny od candidate3 builda. Nie zastępuje pełnej unit suite; process exit/provenance do uzupełnienia |
| Nowe targeted payment / bank-account / invitation fences | Root potwierdził **actual exit 0**: payment **4/4 PASS**, bank/invitation **13 PASS** (5 parent + 8 nested). Nie zastępują pełnej suite/finalnego builda |
| Candidate3 LOAD200 | **NOT MEASURED**; nie istnieje wynik 200 przypisany temu kandydatowi |
| Candidate4 frozen source / BUILD_ID | **PASS:** source `7f9e779c5a527d32d3a3ceefb1b8ec016a170f5dff19a8ef1c0b95547edc6029`; BUILD_ID `DXSJr8TO7bilEwITdZy5X`; harness `9f16ba616a49b96dc4784e7d02dd420c721b40934af652db59d48f1e67464849` |
| Candidate4 build / typecheck / lint / unit / performance-unit / integration | **6/6 PASS, każdy actual exit 0**, zgodne source przed/po i harness guards; unit **7+427 PASS**, performance **11 PASS**; integration ukończona 12:46:25 UTC |
| Candidate4 HTTP audit | **PASS w opisanym smoke zakresie:** 135 routes, 193 methods, 442 checks, 0 failures; source/build zgodne. Generic status <500 nie dowodzi poprawnej autoryzacji ani sukcesu operacji biznesowej |
| Candidate4 świeży pełny npm audit | **PASS, actual exit 0**; info/low/moderate/high/critical =0, total0; osobny od testów aplikacji |
| Candidate4 LOAD200 | **FAIL, actual exit 1**, source/harness/build guards PASS; 200-stage **101,95 RPS**, p95 **6506,91 ms**, max **9884,69 ms**, **27 create500**, **1246/1640 ≥1000 ms (75,9756%)** |
| Candidate4 fixture integrity | **FAIL:** 719 successful create responses ≠721 persisted invoices =721 claims; exactlyOnce false. Przyczyna wymaga diagnozy; source test PASS jej nie rozstrzyga |
| Candidate4 dedicated serial / 2-/4-process / smoke | **NOT EXECUTED** — sekwencja przerwana po failed primary; probes zawarte w primary nie są osobnym serial collection-operation report |
| Candidate4 pełny ramp diagnostic | **FAIL, actual exit 1**, unchanged source/build, changed harness `333f…`; 200-stage **108,80 RPS**, p95 **6378,24 ms**, max **11 547,36 ms**, **56 create500**, **1005/1728 ≥1 s**; fixture **695/695/695 true**. Native transaction-expiry messages są zachowane, original mismatch cause nieudowodniony |
| Candidate5 frozen source / BUILD_ID | **PASS:** source `20f79c56358a0e5b3a98a2c6b9fa9188986d66e835cb8e46989ded7424c39106`; BUILD_ID `5HK8LamfTJr4EcCUK16nA`; harness `5911ffc896dcd16fe57b5195b2b782a67889de51f4899fa75d790cbba2b06d7e`; parent f9 |
| Candidate5 build / typecheck / lint / unit / performance-unit / integration | **6/6 frozen gates PASS, każde actual exit 0**, outer process actual exit 0 potwierdzony przez root; source/harness/build zgodne. Unit **7+480 named PASS**, performance helper **11 PASS**. Integration zakończona **19:09:51 UTC** |
| Candidate5 targeted native create / personal role / logging | Targeted route/admission **60/60 PASS, actual0** (35 POST +7 admission +18 existing audit/shared fence, cap4 freeze). Native create recovery **7 cases +1 parent TAP=8 PASS**, guarded actual exit 0. Osobne invoice edit/delete **43**, payment **8**, log safety/search **8** named PASS/actual exit 0; native invoice edit/delete **43** powtórzono również w passing frozen integration |
| Candidate5 fresh full dependency audit | **PASS:** 0 advisories wszystkich poziomów; actual exit 0 potwierdzony przez root; concrete lockfile/registry state |
| Candidate5 HTTP audit | **PASS:** routeCount **135**, methodCount **193**, checks **442**, failures **0**; osobny zachowany snapshot current builda. Generic status nie zastępuje named authorization/business proof |
| Candidate5 primary single-process LOAD200 | **PASS harness, actual exit 0**, guards PASS, fixture **910/910/910**; stage200 **118,65 RPS**, p95 **8603,23 ms**, max **10 908,17 ms**, **0 errors**, **782/2027 ≥1 s (38,5792%)**. Strict latency goal **UNMET** |
| Candidate5 serial | **PASS, actual exit 0**, guarded probes: bootstrap **12**, nextNumber **8**, full bootstrap **15**, list/search **3/3**, detail **6**, create **32**, cold/warm PDF **18/4** collection operations |
| Candidate5 horizontal smoke2 | **PASS, actual exit 0**; 2 workers, **76,87 RPS**, p95 **53,37 ms**, 0 errors, fixture **17/17/17**. Harness validation nie jest capacity proof |
| Candidate5 horizontal2 / whole sequence | **FAIL, actual exit 1**; whole sequence outer actual exit 1. Stage200 **105,85 RPS**, p95 **8296,73 ms**, max **15 012,15 ms**, **14 create client TimeoutError**, fixture **245 vs247/247**. Routing **897/897** requests; brak ustalonej przyczyny mismatch lub queue/active split |
| Candidate5 horizontal4 / browser | **NOT EXECUTED / PENDING:** sequence przerwana po horizontal2; browser held while new candidate is selected |
| Candidate6 frozen source / BUILD_ID | **PASS:** source `4e2adb9ebeeefc35f2d3a59b1872dcf00ad410cbaa9047e4f01821c2d0d00cbb`; BUILD_ID `Yww4B4-LjmnzXAIupuSe-`; harness `5911ffc896dcd16fe57b5195b2b782a67889de51f4899fa75d790cbba2b06d7e`; parent f9. Jedyna zmiana względem candidate5: default active admission **4→8**, queue256/wait10000ms bez zmiany |
| Candidate6 build / typecheck / lint / unit / performance-unit / integration | **6/6 PASS, każde actual exit 0**, outer process actual0 root-confirmed; source/harness/build zgodne. **7+480 named unit**, **11 performance**, HTTP **135 routes /193 methods /442 checks /0 failures**. Integration zakończona **19:21:35 UTC** |
| Candidate6 audit | Lockfile bez zmiany: świeży audit candidate5 ma 0 advisories, nie przypisano nowego audit-process exit candidate6 |
| Candidate6 primary single-process LOAD200 | **PASS harness, actual exit 0**, wszystkie guards stable, fixture **886/886/886**. Stage200 **122,54 RPS**, p95 **8716,51 ms**, max **9712,55 ms**, 0 errors, **692/2097 ≥1 s**. Strict goal **UNMET** |
| Candidate6 serial / smoke2 | **PASS/PASS, actual exits0**. Serial counts **12/8/15/3/3/6/32/18/4** (bootstrap/nextNumber/full/list/search/detail/create/coldPDF/warmPDF). Two-worker smoke **82,02 RPS**, p95 **48,56 ms**, max **65,13 ms**, 0 errors, fixture **17/17/17** |
| Candidate6 horizontal2 / whole sequence | **FAIL, actual exit1**, outer actual1; 200 workers **100,02 RPS**, p95 **7737,46 ms**, max **15 044,58 ms**, **11 create client TimeoutError**, **531/1736 ≥1 s**, fixture **230 vs233/233**. Routing **868/868**, 2000 PDF warmups. Startup-only logs; cause/activequeue split unproven |
| Candidate6 horizontal4 / final browser | **NOT EXECUTED / PENDING**: stopped after horizontal2; final browser/Lighthouse awaits chosen source |
| Candidate8 frozen source / BUILD_ID | Source `bb3bd5f9c2ef1713f0f37d20eba90a7ffe293df2bc4ecf5893d54645fedb5927`; BUILD_ID `xgSEexMkddck8HqP_WFBa`; scripts `5efdb143814b43138a64871feefd95cbd9762026e8f71277f2f18e24b98cd5ec`; parent f9. Dwie wąskie poprawki względem7; metric7 nie są pomiarem8 |
| Candidate8 bramki źródła / load / browser | **6/6 procesów i runner nadrzędny: kod 0**, zgodne app/scripts/build; **505 unit =7+498**, 11 performance-unit. Integration **20:22:06,675 UTC**. Primary, CDP3/Lighthouse3, consent21 i calculator54 ukończone; axe180 PASS automatyki; pełna macierz rerun2 FAIL na WebKit pageerror, przyczyna w analizie |
| Candidate8 primary-only LOAD200 | **PASS child/outeractual0**, stableguards/cleanup,0errorsallstages,fixture **920/920/920**.200workers **121,20RPS**,p95 **8911,94ms**,max **10 162,80ms**, **682/2093≥1s(32,5848%)**.StrictgoalUNMET; onlyobserved20all<1s.8serial/smoke/horizontalNOTEXECUTED |
| Candidate8 HTTP audit | **PASS135routes/193methods/442actual result rows/0failures**; exclusive snapshot source/build8. Generic status smoke nie certyfikuje każdego UI/business authorization |
| Candidate7 frozen source / BUILD_ID | **PASS:** source `0a5fa823bba37e4701f083e250a8f7b6995204c06d3300f74caa51888c5c8a4e`; BUILD_ID `gOz8TEtcgABlcnXr7DZDL`; harness `717af9f4f477371ca6125d2d5e3e22283ba1fc62f1bca821e65f86b0ba79f0ba`; parent f9 |
| Candidate7 build / typecheck / lint / unit / performance-unit / integration | **6/6 actualexit0 PASS**, outer actual0 root-confirmed; all source/harness/build guards stable. **7+496=503 named unit**, **11 performance**, HTTP **135 routes /193 methods /442 checks /0 failures**; native invoice edit/role **43**, HTTP security **42**, public SEO **46**. Integration ukończona **19:40:40 UTC** |
| Candidate7 własny primary LOAD200 | **PASS harness, child i outer actualexit0**, guards/cleanup PASS, fixture **919/919/919**, zero errors we wszystkich etapach. Stage200 **124,53 RPS**, p95 **8845,37 ms**, max **14 170,85 ms**, **532/2120 ≥1 s**; strict goal **UNMET** |
| Candidate7 serial / smoke / horizontal / browser | Serial, smoke2 i horizontal **NOT EXECUTED FOR7**. CDP3/Lighthouse3, consent21/calculator54 ukończono później; axe180 FAIL, pełnej macierzy7 nie wykonano. Próby5/6 zachowują własny zakres |
| Candidate4 przeglądarki, a11y, mobile, PDF/druk, LCP/transfer | **Historyczny cutoff: PENDING**; późniejsze próbki dotyczą wyłącznie ich własnych źródeł/buildów |
| Netlify / wdrożenie / trwałe limity użytkownika na kilku instancjach | **UNVERIFIED / PENDING**; lokalny harness i read-only produkcja tego nie dowodzą |

Parent Git buildów roboczych: `f9e1e106d7e61e21cefaa0487e116315fab2348e`. Parent nie identyfikuje zawartości zmienionego working tree ani opublikowanego finalnego commita. Dokumenty nie wchodzą do application fingerprint; fingerprint obejmuje src/public/schema/istotne konfiguracje/package/lock, ale nie zastępuje osobnego hasha test harness.

Uściślenie wcześniejszej notatki o błędzie Prisma cache: skuteczna powtórka otrzymała dodatkowe prawo zapisu do `/home/agent/.cache/prisma`. Nie przenoszono `HOME` ani katalogu cache. Historyczny raport pozostaje zachowany; jest to poprawka opisu warunku środowiskowego, nie aplikacji.

## Historia primary LOAD200 i diagnostyki

| Run, 1 process | Requests/s przy 200 | p95 ms | Maximum ms | Errors | Requests ≥1000 ms | Cel |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Baseline 2026-10-09 | 90,46 | 5333,37 | 6829,71 | 0 | Liczby nie zapisano; maximum potwierdza przekroczenie | UNMET |
| Candidate1 2026-10-09 | 109,08 | 5450,93 | 7759,82 | 0 | 1372/1725 (79,54%) | UNMET |
| Candidate2 2026-10-10 | **119,62** | **5708,69** | **7834,04** | 0 | **1211/1888 (64,14%)** | **UNMET** |
| Candidate4 2026-10-10 | **101,95** | **6506,91** | **9884,69** | **27 create500** | **1246/1640 (75,9756%)** | **UNMET / harness FAIL** |
| Candidate5 2026-10-10 | **118,65** | **8603,23** | **10 908,17** | **0** | **782/2027 (38,5792%)** | **UNMET / primary harness PASS** |
| Candidate6 2026-10-10 | **122,54** | **8716,51** | **9712,55** | **0** | **692/2097 (33,00%)** | **UNMET / primary harness PASS** |
| Candidate8 2026-10-10 | **121,20** | **8911,94** | **10 162,80** | **0** | **682/2093(32,5848%)** | **UNMET / primary harnessPASS** |
| Candidate7 2026-10-10 | **124,53** | **8845,37** | **14 170,85** | **0** | **532/2120 (25,0943%)** | **UNMET / primary harness PASS** |
| Candidate3 | Nie zmierzono | — | — | — | — | Brak dowodu |

**Historyczny candidate4 pozostał zablokowany w swoim przebiegu:** primary zakończył się 2026-10-10 12:49:53 UTC, actual exit 1, przy zgodnych source/harness/build before/after. Wszystkie 27 błędów wystąpiły w create (173 HTTP201 +27 HTTP500 spośród 200 create w etapie200); create p95 **8653,42 ms** i wszystkie 200 create trwało ≥1 s. Cały ramp ma 719 udanych create responses, lecz 721 persisted invoices i 721 claims. To wymaga diagnozy przed release; nie deklarujemy capacity ani exactly-once dla candidate4. Raport i proof są odrębnymi local-only inputs z zachowanymi hashami.

Candidate2 zwiększył throughput o **32,23% względem baseline** i 9,66% względem candidate1, lecz p95 względem baseline wzrosło. Cel jest ścisły: **każde żądanie <1000 ms**, również błędy; dokładnie 1000 ms nie przechodzi. `passed: true` harness oznacza zero błędów i integralność fixture, a nie przejście celu latency. Candidate2 spełnił ten cel wyłącznie w zaobserwowanym etapie 20 wykonawców.

**Oddzielna diagnostyka, bez naprawy aplikacji:** run tylko 200 workers przez 15 s z `--profile`, bez CPU profiler, zakończył się actual exit 0: **96,17 RPS**, p95 **6543,90 ms**, max **12 518,84 ms**, 0 errors i fixture 199/199/199. Nie odtworzył pierwotnych create500 / integrity mismatch i nie rozstrzyga ich przyczyny; nie zastępuje failed primary. Source/build candidate4 pozostają te same, lecz harness celowo zmieniono z `9f16…` na `333f0ad35ebcb223966b6d47bac3fc29159e243a888880beef36d8b52a4199ee` wyłącznie dla ograniczonego zachowania prywatnego server log. Zmierzono **1,9902 cores** application + Mongo + generator na limicie 2 CPU; to obserwacja profiled diagnostic, nie dowód przyczyny błędu. Log 349 B ma mode 0600, zawiera startup i handled CompanyMember initialization uniqueconstraint; nie zarejestrował native create error/P2028. W tym profiled 200-only run nie potwierdzono timeout; poniższa późniejsza full-ramp diagnostyka zapisała transaction expiry. Historyczny candidate4 po tej diagnostyce nadal miał status **BLOCKED**; nie jest to aktualny werdykt późniejszych kandydatów.

**Późniejsza oddzielna reprodukcja pełnego ramp, bez profilera:** 20/50/100/200 workers, 15 s/stage, 1 instance, source/build unchanged, intentionally changed logging harness `333f…`; completed **2026-10-10 13:03:24 UTC**, actual exit **1** i guards PASS. Przy 200: **108,80 RPS**, p95 **6378,24 ms**, max **11 547,36 ms**, **56 create HTTP500** (151/207 create HTTP201), **1005/1728 requests ≥1000 ms (58,1597%)**. Wszystkie 207 create przekroczyły 1 s; create p95 **10 352,48 ms**. Ramp integrity tym razem **695/695/695, exactlyOnce true**; nie odtworzył pierwotnego 719/721 mismatch.

Prywatny server log ma **24 686 B, mode 0600**; zachowuje **26** komunikatów `A query cannot be executed on an expired transaction` przy **24 auditLog.create +2 invoicePrintVersion.create**, oraz 26 rollback-failure log occurrences; timeout **5000 ms**, elapsed **5073–5255 ms**. To dowód obserwowanego transaction expiry w tej reprodukcji. Log nie zawiera literalnego kodu ORM; nie przypisujemy `P2028` ani nie klasyfikujemy każdego z 56 błędów bez jego osobnego trace. **Przyczyna pierwotnego mismatch 719/721 nadal nie jest udowodniona.** Log pozostaje lokalny i prywatny; report JSON zachowuje hash i tylko te oczyszczone metadane. Candidate5 zawiera admission bound i stable invoice ID, ma **6/6 frozen gates PASS**. Native guarded recovery proof ma **8 TAP PASS**; primary/serial/smoke2 candidate5 PASS, horizontal2 FAIL; candidate6 primary/serial/smoke2 PASS, horizontal2 FAIL; finalny browser pozostaje PENDING. Native test celowo wstrzykuje błąd potwierdzenia po prawdziwym commit oraz błąd przed zakończeniem callbacka dla rollback. Nie odtwarza naturalnie pierwotnego mismatch i nie ustala jego przyczyny.

**Candidate5, default admission cap4:** primary 20/50/100/200 jest guarded i zakończył się actual exit 0, bez błędów i z **910 successful create responses =910 invoices =910 claims**. Przy 200 ma **118,65 RPS**, p95 **8603,23 ms**, max **10 908,17 ms**, **782/2027 ≥1 s (38,5792%)**. Już przy 20 workers **1/1892** create przekroczył 1 s (max **1044,27 ms**); strict goal nie przechodzi żadnego z czterech etapów. Brak create500 w tej próbie i poprawna fixture nie potwierdzają pierwotnej przyczyny candidate4 mismatch ani produkcyjnego SLA.

Osobny guarded serial ma counts **bootstrap12, nextNumber8, fullBootstrap15, list3, search3, detail6, create32, coldPDF18, warmPDF4**; to concrete probes, nie licznik każdego requestu. Osobny two-instance smoke z **2 workers** przechodzi: **76,87 RPS**, p95 **53,37 ms**, 0 errors, fixture **17/17/17**.

**Oddzielny horizontal2 candidate5 FAIL:** 200 workers na dwóch application processes i wspólnym hostcie/bazie, **105,85 RPS**, p95 **8296,73 ms**, max **15 012,15 ms**; **14 create TimeoutError** to client deadline po 15 s, nie HTTP500. Successful responses **245** wobec **247 invoices/247 claims**, exactlyOnce false. Routing ma **897/897** requests i nie wyjaśnia błędów. Cztery retained private server logs z wszystkich runów mają tylko startup; nie zawierają ORM/application errors ani obserwowanego native transaction expiry. **Nie przypisano konkretnej przyczyny mismatch ani czasu active vs queue.** Outer sequence actual exit1; four-instance experiment nie ruszył. Candidate6 cap8 otrzymał własne 6/6 fresh frozen gates i primary PASS; horizontal2 także FAIL, finalny browser PENDING. Brak ostrzeżeń w logu nie dowodzi, że zapis nie nastąpił po klienckim timeout.

**Historyczny pomiar candidate6 cap8:** cały fresh ramp primary jest actual exit0, wszystkie guards stable, zero errors i fixture **886/886/886**. Stage 20/50/100/200 ma RPS **114,12 /113,21 /123,09 /122,54**, p95 **598,01 /2699,30 /5351,85 /8716,51 ms**, max **820,52 /3214,14 /6955,85 /9712,55 ms**. Odpowiedzi ≥1 s: **0/1724, 179/1742, 234/1957, 692/2097**. Tylko zaobserwowany stage20 spełnia ścisły limit; 200 nie spełnia. Throughput200 jest o **35,46%** wyższy od baseline przy tej samej metodzie lokalnej, lecz brak powtórzeń/statystyki i produkcyjnego pomiaru wyklucza prognozę SLA.

Guarded serial candidate6 ma counts **12/8/15/3/3/6/32/18/4**; two-worker smoke PASS: **82,02 RPS**, p95 **48,56 ms**, max **65,13 ms**, fixture **17/17/17**. Oddzielny horizontal2 FAIL: **100,02 RPS**, p95 **7737,46 ms**, max **15 044,58 ms**, **11 create client TimeoutError** po 15 s, **531/1736 ≥1 s**, **230 responses vs233 invoices/233 claims**. Routing **868/868** i **2000** worker PDF warmups nie ustalają przyczyny. Logs tylko startup, bez ORM code/application error/native expiry; **cause i active/queue split nieudowodnione**. Outer actualexit1, four-instance nie ruszył. Candidate7 ma confirmed source fixes, passing6/6 fresh frozen gates i własny primary PASS; strict latency200 nadal UNMET, finalny browser pozostaje PENDING. Historyczne failed statuses pozostają przypisane swoim source/build.

**Historyczny candidate7 cap8, primary-only:** pomiar **19:41:26–19:44:05 UTC** ma child/outer actualexit0, stabilne source/scripts/build/parent przed i po, cleanup PASS i **919 udanych create =919 zapisanych faktur =919 claims**. Nie zaobserwowano błędów w żadnym etapie.

| Wykonawcy | Requests/s | p95 ms | Maximum ms | Żądania ≥1 s | Ścisły limit <1 s |
| --- | ---: | ---: | ---: | --- | --- |
| 20 | 123,61 | 566,37 | 706,43 | 0/1872 | PASS w tej próbie |
| 50 | 117,67 | 2551,82 | 3249,16 | 192/1828 | UNMET |
| 100 | 125,65 | 5286,48 | 6756,48 | 246/2007 | UNMET |
| 200 | 124,53 | 8845,37 | 14 170,85 | 532/2120 (25,0943%) | UNMET |

Przy200 create ma p50 **8152,41 ms** i p95 **10 037,49 ms**; to całe HTTP, bez osobnego pomiaru czasu kolejki i aktywnej transakcji. Throughput jest o **37,66%** wyższy niż90,46RPS baseline, ale p95 jest wyższe i nie wykonano powtórzeń statystycznych. Nie przedstawiamy tego jako poprawy ogona opóźnień ani gwarancji produkcyjnej. Prywatny log **211B/mode0600** zawiera tylko startup; brak zarejestrowanego expiry/rollback/application_error nie jest dowodem pełnego braku błędów poza zakresem próby. Primary report SHA-256 `9204eb2e794beb675da125d2d12bad3bd4d518db1384feac115a6e1688006612`; cleanup record SHA-256 `b6065bb447a24fb97082c680939c6e6466bc14cdc6c1bb774a32683718136042`. Pełna tożsamość i oczyszczone metryki są w companion JSON. **Nie powtórzono7serial/smoke/horizontal**; historyczne wyniki5/6 nie zastępują tych prób.

Metoda porównania: świeża izolowana Mongo replica set; **1000 tenantów × 30 początkowych faktur**, **15 s** dla **20/50/100/200** wykonawców; **1 application process**, bez profilera; cykl `bootstrap, list×3, search, detail×2, create, PDF×2`, bez think time, warm PDF każdego tenanta/worker. Efektywne limity cgroup: **2 CPU** (`200000 100000`) i **8 GiB** (`8589934592`), Node 24.19.0. App/DB/generator na wspólnym hostcie; providers blokowane, brak internet RTT/CDN/serverless cold start. Integralność create/document/number claim: baseline 622/622/622, candidate1 755/755/755, candidate2 737/737/737.

To model zamknięty: następne żądanie jest wysyłane po odpowiedzi poprzedniego, a czas czekania przed wysłaniem jest pominięty (coordinated omission). Liczba seeded tenantów ani workerów nie potwierdza liczby równoczesnych realnych użytkowników lub produkcyjnego SLA stałego napływu żądań. Nie wykonano powtórzeń z confidence intervals. Profile CPU i próby 2/4 process muszą pozostać osobnymi eksperymentami; wyników z profilerem nie wolno zamieniać z primary.

Ostatni zmierzony backendowy primary kandydata 8 opisano w części historycznej. Powyższe próby 4–7 pozostają odrębnymi pomiarami; nie przepisano ich wyników do kandydata 8.

## Historia przeglądu autoryzacji zapisów

Poniżej są **konkretne ścieżki znalezione w pierwszym statycznym odczycie**, nie kompletny certyfikat pokrycia autoryzacji. Wtedy `requireCompanyAccess` występowało przed transakcją bez `companyWriteAccess` w callbacku. Poprawki są w zamrożonym candidate4 i mają przejście bramek źródła/unit/integration. W tamtym cutoff browser i poprawiony capacity proof były otwarte, a primary candidate4 miał FAIL. Historyczny kandydat 8 miał własne przejście bramek i primary; nie zmienia to zakresu historycznych native dowodów. Brak testu race na trasie nie dowodzi wykorzystywalności i nie pozwala rozszerzyć native proof shared helpera na callback bez tej kontroli.

| Metoda / trasa | Statyczny dowód w route.ts | Stan |
| --- | --- | --- |
| PATCH `/api/invoices/[id]/recurrence` | initial precheck 18/23; transaction 24; invoice write 25 | SOURCE FIXED; unit 427/427 PASS i frozen gates PASS |
| POST `/api/invoices/[id]/payments` | initial precheck 90; transaction 98; invoice claim 105 / payment create 114 | SOURCE FIXED: reread + `companyWriteAccess` w tx; targeted 4/4 PASS; frozen build/unit/integration PASS |
| POST `/api/invoice-settlements` | initial precheck 29; transaction 50; invoice create 56 | SOURCE FIXED; unit 427/427 PASS i frozen gates PASS |
| POST `/api/due-reminders` | initial precheck 21; retry transaction 24 / config transaction 36 | SOURCE FIXED; unit 427/427 PASS i frozen gates PASS |
| POST `/api/ksef/queue` | initial precheck 69; transaction 109; queue/invoice writes 117–119 | SOURCE FIXED; unit 427/427 PASS i frozen gates PASS |
| POST `/api/ksef/offline/issue` | initial permissions 53; transaction 78; invoice write 81 | SOURCE FIXED; unit 427/427 PASS i frozen gates PASS |
| POST `/api/ksef/sync-incoming` | initial helper precheck 58; import transaction 252; invoice create 254 | SOURCE FIXED; unit 427/427 PASS i frozen gates PASS |
| Company-scoped PUT `/api/workspace/preferences` | scope precheck 15; transaction 36; user preference write 42 | EXISTING USER-OWNED PREFERENCES: brak zmiany danych zewnętrznej firmy; nie przypisano shared permission guarantee |
| POST/PATCH `/api/companies/[id]/bank-accounts` | initial prechecks 72/161; transactions 110/170; helper company write 21 | SOURCE FIXED: helper używa `companyWriteAccess`; targeted bank/invitation 13 PASS; frozen build/unit/integration PASS |
| DELETE `/api/companies/[id]/bank-accounts` | initial precheck 191; direct delete 209 | SOURCE FIXED w root-owned patch; targeted bank/invitation 13 PASS; frozen build/unit/integration PASS |
| DELETE `/api/team/invitations/[id]` | initial precheck 32; direct update 40 | SOURCE FIXED: current row + `companyWriteAccess` w tx; targeted bank/invitation 13 PASS; frozen build/unit/integration PASS |

Numery wierszy oznaczone `initial` dotyczą pierwszego odczytu 2026-10-10 przed poprawkami i zmieniają się w toku pracy. `claimInvoiceQuota` wykonuje synchronizację billing, nie zastępuje autoryzacji. KSeF send/process przez `claimKsefTransmission` korzysta z `companyWriteAccess`; banking/import i accountant/portal także mają wywołanie wewnątrz callbacka. PUT/DELETE `/api/invoices/[id]` i MFA policy mają świeży native proof w ukończonej integracji candidate4. Katalog contractors/products również jest poprawiony w czterech routes; incoming KSeF ogranicza seller lookup do aktualnej firmy.

## Priorytety, efekt i wysiłek

Priorytetem source11 jest własny retest poprawionego prywatnego CLS, gotowości stron/sekcji ≤4 s i pełna macierz. Jego sześć bramek jest już ukończone. Własne sześć bramek jest ukończone. Ostatni load8 pokazuje odczyty API poniżej 2,30 s przy 200, ale nie pełne ładowanie UI; create i PDF raportujemy oddzielnie. Własne Lighthouse10 ma 99/99/99 z ostrzeżeniami niepełnego capture, a startup JS116 667 B przekracza pierwotny budżet100KB. Prywatny CLS ma potwierdzoną przyczynę i wymaga poprawki11 przed pełną macierzą. Historyczne axe8 ma PASS automatyki i 88 ekranów do oceny manualnej. Dawne horizontal2 próby 5/6 miały błędy o nieustalonej przyczynie, więc dokładanie procesów lub połączeń na tych samych 2 CPU nie ma potwierdzonego zysku. Zysku bezpieczeństwa nie wyrażamy w ms.

Same cztery `rootMainFiles` builda8 mają łącznie **102 712 B obliczonego gzip ≈100,3047 KiB**, jeszcze przed kodem landing/layout: usunięcie małych publicznych widgetów nie wystarcza do tego budżetu; trzeba ograniczyć także wspólny JS i zakres hydration. To konkretny wynik builda8, nie ogólna niemożliwość ani pomiar nowego builda.

Pozostałe zmiany poniżej są uporządkowane według jakościowej relacji efektu do wysiłku. Wysiłek oznacza złożoność zmiany i jej weryfikacji, nie pomiar roboczogodzin. Nie istnieje kontrolowany pomiar czasu każdej izolowanej zmiany, więc ranking nie jest wyliczonym ilorazem ms/roboczogodzina.

| Kolejność | Działanie | Zaobserwowany efekt / granica oczekiwania | Wysiłek |
| --- | --- | --- | --- |
| 1 | Wyłączenie preload optional fontów | Historycznie **59 132 B ≈57,75 KiB**, świeży candidate8 Chromium homepage oraz CDP3 **0 B fontów**, zero preload/request/transfer, computed systemfont body/H1 zachowany. Izolowany zysk LCP niezmierzony | Mały kod; transfer sprawdzony, izolowany LCP delta niezmierzony |
| 2 | Summary DTO i ID-only search facet | Final native fixture 72 faktur: raw DB **2 696 170→125 655 B**, response **2 647 266→158 314 B**, gzip **1 444 151→4899 B**. Search 28 cases=28 aggregates, page **18 065 584 B >16 MiB** bez jednego pełnego facet document | Średni: projection, page/count/cursor/filter/financial parity |
| 3 | Live identity i jednokomendowe permissions | Typowy identity fast path **6→1** komend DB; final native 22 reads=22 aggregates, company 1201 reads=1201 aggregates. **Zysk elapsed ms tego helpera niezmierzony** | Średni: BSON/default/null parity, żywe MFA/revoke, indexed joins |
| 4 | Immutable PDF bytes i same-tx seller reuse | Historyczny candidate2 warm PDF **4 collection operations**; stare serial diagnostic 14 miało słabszy source guard. Create 28 obejmuje inicjalizację okresu. Fresh candidate5 serial ma cold/warm PDF **18/4** i create **32** operations; pojedyncze count nie ustala zysku produkcyjnej latency | Średni: bounded LRU/copies, current auth/version hash, transaction context |
| 5 | Mały ekran kalkulatora i finalne browser gates | `min-w-0`, 1 kolumna i łamanie tekstu; candidate8, trzy silniki: **54 scenariusze PASS** z exact money i document/nested containment320/768/1280. Axe180 ma PASS automatyki,88 manual-review screens niesprawdzone; pełna macierz rerun2 ma FAIL na WebKit pageerror. **Brak forecastu ms** | Mały kod, średni zakres regresji |

Shared write authorization ma 11 shared +27 invoice +6 policy native przypadków z denial/rollback bez artefaktów w sprawdzonych race. Audit zależności ma **0 known advisories**, a input/quota proof obejmuje granice parsera/logo i VIES 15/min per authenticated subject. Production quota i prawdziwe integracje pozostają PENDING. Naprawa capacity odpowiada na wynik candidate4 **101,95 RPS**, p95 **6506,91 ms**, **27 create500**, **719 vs721/721**; bounded admission/stable-ID recovery w candidate5 mają primary PASS i horizontal2 FAIL; cap8 candidate6 ma healthy primary i horizontal2 FAIL, strict200 latency UNMET. Nie deklaruje się forecastu <1 s ani scaling gain.

Te wyniki opisują konkretne lokalne fixture/probes. Redukcja liczby komend lub bytes nie jest procentową prognozą produkcyjnej latency. Obecne0B fontów względem historycznych59 132B jest odrębną obserwacją, bez kontrolowanego pomiaru pojedynczej zmiany i zysku LCP.

## Gotowy kod i konfiguracja w repozytorium

Pełne implementacje są podlinkowane; poniżej krótkie literalne fragmenty istniejącego kodu, które pokazują zmianę. Nie wymagają dodatkowego kopiowania do aplikacji.

[Layout fontów](../../../src/app/layout.tsx): oba `localFont` mają poniższą opcję. Fonty pozostają dostępne dla stylów korzystających z `--font-sans`.

```ts
  display: "swap",
  preload: false,
  weight: "100 900",
```

[Live API identity](../../../src/lib/api-session-identity.ts) i [auth adapter](../../../src/lib/auth.ts): jedna indeksowana agregacja wybiera session/User/MFA bez profili/integration credentials; odczyt expiry i MFA odbywa się po tej samej odpowiedzi.

```ts
  const rows = await db.session.aggregateRaw({ pipeline: [
    { $match: { sessionToken: sessionTokenHash(token) } }, { $limit: 1 },
```

[Company permission aggregate](../../../src/lib/company-access-read.ts): scoped firma i minimalna projekcja poprzedzają indeksowane lookupy CompanyMember, CompanySecurityPolicy i UserMfa. [Shared write helper](../../../src/lib/company-write.ts) dodaje do tej autoryzacji konfliktujący zapis w tej samej transakcji.

```ts
    { $match: { _id: { $oid: companyId } } },
    { $limit: 1 },
    { $project: { _id: 1, userId: 1, companyName: 1, nip: 1 } },
```

```ts
  const updatedAt = new Date(Math.max(Date.now(), profile.updatedAt.getTime() + 1));
  await tx.companyProfile.update({ where: { id: companyId }, data: { updatedAt }, select: { id: true } });
```

[ID-only search facet](../../../src/lib/invoice-search.ts): poniższa branch przechowuje wyłącznie ID; pełny helper rozwija wiersze dopiero po `$unwind` przez indexed Invoice lookup i DTO projection.

```ts
      rows: [...selection, ...after, { $sort: { issueDate: -1, _id: -1 } }, { $limit: INVOICE_PAGE_SIZE + 1 }, { $project: { _id: 1 } }],
```

[Immutable PDF byte LRU](../../../src/lib/pdf/immutable-pdf-cache.ts) i [wybór aktualnej wersji](../../../src/lib/pdf/invoice-print.ts): cache ma oba ograniczenia; key/sourceHash i Buffer copies chronią wersję, a świeża autoryzacja pozostaje przed odczytem bytes.

```ts
export function createImmutablePdfCache(maxBytes = 64 * 1024 * 1024, maxEntries = 1024) {
```

```ts
      if (!entry || entry.sourceHash !== sourceHash) return undefined;
      entries.delete(versionId); entries.set(versionId, entry);
      return { ...entry, buffer: Buffer.from(entry.buffer) };
```

[Admission faktury](../../../src/lib/invoice-write-admission.ts) ma default cap8 także w zmierzonym kandydacie 8 ze świeżymi bramkami i własnym primary PASS. Historyczny candidate6 przy cap8 miał horizontal2 FAIL, a candidate5 używał cap4. Ogranicza kosztowne transakcje per process; kolejka nie posiada otwartej transakcji, limit używa monotonicznego `performance.now()`, a callback zawsze zwalnia slot w `finally`:

```ts
constructor(private readonly concurrency = 8, private readonly maxQueue = 256, private readonly waitMs = 10000) {
```

[POST faktury](../../../src/app/api/invoices/route.ts) generuje jedno serwerowe `randomBytes(12).toString("hex")` dla danego requestu; zapisuje to ID zarówno w Invoice, jak i InvoiceNumberClaim. Recovery po zakończonym callbacku wymaga exact ID + actor/company scope i zgodnego linked claim. Nie zapewnia idempotencji między osobnymi HTTP requestami i nie ponawia na ślepo niepewnego commit. Wszystkie quota/claim/invoice/print/audit writes pozostają atomowe w jednej transakcji. **Guarded native recovery i primary candidate5 PASS nie są certyfikatem two-process capacity; horizontal2 FAIL.**

[Bieżąca rola przy legacy personal payment](../../../src/app/api/invoices/[id]/payments/route.ts) i [edycji/usuwaniu faktury](../../../src/app/api/invoices/[id]/route.ts): kontrola odbywa się w transakcji zapisu.

```ts
const actor = await tx.user.findUnique({ where: { id: user.id }, select: { role: true } });
if (!actor || !["owner", "accountant"].includes(actor.role)) throw new ApiError(403, "Brak uprawnienia do zmiany faktury.");
```

[Prisma client](../../../src/lib/prisma.ts) używa `log: []`. [Bezpieczny reporter](../../../src/lib/error-report.ts) zachowuje diagnostyczny kod wyłącznie dla rzeczywistego typu Prisma i dokładnego formatu; treść błędu i metadata nie są serializowane:

```ts
const errorCode = error instanceof Prisma.PrismaClientKnownRequestError && typeof error.code === "string" && error.code.length === 5 && /^P\d{4}$/.test(error.code) ? error.code : undefined;
```

Konfiguracja kompilacji i compatibility pass: [package.json](../../../package.json), [postcss.config.mjs](../../../postcss.config.mjs), [tailwind-compat.config.cjs](../../../tailwind-compat.config.cjs). Zasady inputów: [logo-safety.ts](../../../src/lib/pdf/logo-safety.ts), [parsers.ts](../../../src/lib/parsers.ts), [VIES route](../../../src/app/api/vies/check/route.ts). Dodatkowe naprawione mutacje: [contractors](../../../src/app/api/contractors/route.ts), [contractor detail](../../../src/app/api/contractors/[id]/route.ts), [products](../../../src/app/api/products/route.ts), [product detail](../../../src/app/api/products/[id]/route.ts), [KSeF incoming sync](../../../src/app/api/ksef/sync-incoming/route.ts).

[Odporne odczytanie consent cookie](../../../src/components/legal/cookie-consent-banner.tsx):

```ts
try {
  return decodeURIComponent(match[3]);
} catch {
  return null;
}
```

[Bounded pola PNG text metadata](../../../src/lib/pdf/logo-safety.ts) są już w zamrożonym source8; targeted 9 PASS oraz 6/6 pełnych bramek kandydata 8 z kodem zakończenia 0. Jego własny load jest ukończony; pełna macierz rerun2 ma FAIL na WebKit pageerror, przyczyna w analizie. Każdy separator musi mieścić się w danych aktualnego chunk, przed CRC:

```ts
function pngTextMetadata(bytes: Uint8Array, start: number, end: number, international: boolean) {
  // The PDF decoder searches text separators without checking chunk/array bounds.
  // Keep every required separator inside this chunk's data, excluding its CRC.
  const separator = (position: number) => {
    for (let pos = position; pos < end; pos++) if (bytes[pos] === 0) return pos;
    return malformed();
  };
  const keywordEnd = separator(start);
  if (keywordEnd === start || keywordEnd - start > 79) malformed();
  if (!international) return;
  const flags = keywordEnd + 1;
  if (flags + 2 > end || bytes[flags] > 1 || bytes[flags + 1] !== 0) malformed();
  const languageEnd = separator(flags + 2);
  separator(languageEnd + 1); // Empty language/translated keyword/text are valid.
}
```

[Quota manualnego rescan](../../../src/app/api/documents/[id]/safety/route.ts) wykonuje auth/ID/lookup/access przed ograniczeniem użytkownika:

```ts
if (!(await rateLimitSubject(user.id, { max: 20, windowMs: 60000 }, "document-scan-user")).allowed) throw new ApiError(429, "Zbyt wiele skanowań. Spróbuj później.");
```

## Stack, sieć i sposób zmierzenia efektu

Sprawdzony stack: **Next.js 15.5.27 App Router, React 19.3, TypeScript, Tailwind 4.3.3, Prisma 6.19/MongoDB, Node.js**; hosting produkcyjny to Netlify. Nie przenoszono hostingu ani bazy. Poniższe ustawienia są już w [next.config.mjs](../../../next.config.mjs); pokazują istniejący mechanizm, nie nową deklarację pomiaru:

```js
compress: true,
httpAgentOptions: { keepAlive: true },
experimental: { inlineCss: true },
images: { formats: ["image/avif", "image/webp"], minimumCacheTTL: 86400 },
```

```js
{ source: "/api/:path*", headers: [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
  { key: "Netlify-CDN-Cache-Control", value: "private, no-store" },
] },
```

Next generuje hashowane pliki `/_next/static`; rzeczywiste nagłówki immutable należy sprawdzić na nowym deployu. Publiczne treści są statycznie renderowane, prywatne dokumenty pozostają dynamiczne. [Service worker](../../../public/sw.js) ogranicza cache do publicznych hashowanych zasobów; nie przechowuje API ani faktur. `compress: true` nie potwierdza Brotli na Netlify. **Brotli, HTTP/3 i 103 Early Hints zależą od infrastruktury i dla tego niewdrożonego wydania pozostają niezweryfikowane.** Nie dodaje się preconnect do nieużywanego zewnętrznego fontu ani preload do fontu, który nie jest renderowany.

Po ukończeniu builda i innych zadań CPU można powtórzyć zimne publiczne pomiary. Najpierw uruchom `npm run app:start -- --port 3001 --hostname 127.0.0.1`; w drugim terminalu, sekwencyjnie:

```sh
node scripts/performance/web-lab.mjs --url http://127.0.0.1:3001 --runs 3 --output artifacts/performance/web-lab.json
node scripts/performance/lighthouse-lab.mjs --url http://127.0.0.1:3001 --runs 3 --output artifacts/performance/lighthouse-mobile.json --raw-dir /tmp/faktura-lighthouse-raw
node scripts/performance/load-isolated.mjs --users 1000 --invoices-per-user 30 --seconds 15 --concurrency 20,50,100,200 --instances 1 --output artifacts/performance/load200-recheck.json
```

Generator tworzy własną świeżą izolowaną MongoDB; nie wskazuj mu produkcyjnych danych ani URL. Narzędzie Lighthouse instaluje się osobno zgodnie z [README pomiarów](../../performance/README.md). Tam są dokładne warunki CDP i ograniczenia metod; porównuj mediany tego samego profilu oraz source/build/harness, a nie samą nazwę wydania.

| Narzędzie | Weryfikacja |
| --- | --- |
| Lighthouse mobile | Trzy zimne próby, Performance, LCP, TBT, CLS, Treemap i render-blocking; wynik 100 dotyczy konkretnego profilu/próby |
| Chrome DevTools | Network: gzip/Brotli, cache HIT/MISS, protokół, fonty i zbędne pobrania; Performance/Coverage: długie zadania, interakcje i nieużywany kod |
| WebPageTest | Lokalizacja dla użytkowników w Polsce, mobile/Slow 4G, trzy first/repeat views; waterfall, cold/warm TTFB, LCP i TLS/CDN |
| PageSpeed Insights / CrUX | Lab i field oceniane osobno; field p75 wymaga rzeczywistych próbek. Jedno kliknięcie w lab nie potwierdza INP <100 ms |
| Matching staging | Osobny fixed-arrival test z limitem Netlify, regionem bazy, cold starts, CPU/memory/errors/queue; local closed-model nie potwierdza capacity Netlify |

**Historyczna regresja kalkulatorów candidate7, 20:05:46–20:06:29 UTC:** actualexit0, guards stable, **54 workflows** (Chromium/Firefox/WebKit ×18; widths320/768/1280). Sprawdzono cztery stawki VAT, net→gross/gross→net, polskie separatory, błędne/puste/negative/skrajne/markup inputy, exact wyniki, recovery, keyboard dropdown, reload/back oraz KSeF boundary. Document i nested grid/card/value nie overflowują w sprawdzonych przypadkach. Fresh Chromium homepage ma zachowany systemfont body/H1 i zero font preload/request/resource transfer. Raw0pageerrors,11network i23console observations zachowano; to obejmuje oczekiwane anonymous401, testblocked SW i navigation-aborted pilot requests, nie deklarację zerowego network/console. Report SHA-256 `3f640b01f628998557c8f929882bd7a6e2eb8097666abf0de3187ca58c77b4c3`; execution SHA-256 `793d476e76d348dd5107761cabf621db483a5af1439b95a74b1099ef298ee93f`. Nie potwierdza to wszystkich mikroelementów ani prawdziwego Safari/iOS. Pierwszy axe harness zakończył się actual1 **przed jakimkolwiek screenem** przez niezgodną nazwę cookie fixture; poprawiono wyłącznie `/tmp` wrapper i zachowano tę nieudaną próbę. To historyczny cutoff: późniejszy rerun axe7 ma FAIL opisany poniżej; pełnej macierzy7 nie wykonano.

## Historyczny axe candidate7 — przyczyna poprawki kontrastu

Pierwszy harness axe zakończył się actualexit1 **przed jakimkolwiek screenem** z powodu błędnej nazwy cookie fixture; poprawiono wyłącznie parser w `/tmp` wrapper. Oddzielny rerun1 wykonany **20:07:41–20:13:35 UTC** zakończył się **child/outer actualexit1**. Rzeczywisty axe **4.14.0**, Chromium1280×900,90routes×light/dark=**180screens**; wszystkie180 mają HTTP200 i finalny pathname zgodny, zero pageerrors, source/build/runtime guards stable.

W jasnym `/` badge „Faktury FA(3) i integracja z KSeF 2.0”, selector `.max-w-full > span`, ma fg **#047857**, bg **#d4e5ee**, font12px normal i contrast **4,24:1**, wobec wymaganego **4,5:1**. [Reguła rzeczywistego axe4.14](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI). To jedna failedscreen; **88screens** ma incomplete wymagające manual review. Raw22console i201network observations zachowano; zero pageerrors nie oznacza zerowego console/network ani screen-reader/keyboard certification.

Poprawka źródeł kandydata 8 ogranicza się do light `text-emerald-700→text-emerald-800`, bez zmiany dark400. **Build i bramki kandydata 8 ukończone; jego własny retest axe180 ma PASS automatyki. Pełnej macierzy7 nie wykonano** po znalezieniu błędu; wcześniej passing source/load/targeted checks nie zastępują końcowego matrix. Oryginalny local-only report SHA-256 `711400f31300f7e823072f894e1382f2fb7c60d18a65113ebd26b41a813a7aef`, execution `7d3a1ff9274647cbf56336a4820136a98b7286c2dd9e8ac7a3bb5b3887faad7b`. [Oczyszczona kopia raportu](../2026-10-08/accessibility-routes-final8-rerun1.json) ma odrębny SHA-256 `7e4137f17c28f8314fb0adbb3076b92b09bb910326bbb56b28978b0e28ce3ff3`: usunięto40synthetic capability-path occurrences (12invoice/12offer/16invitation), bez zmiany faktycznego wyniku1failed/180screens/88manual; raw pozostaje bez zmiany.14z201network observations toNBP502 pod celowo blokującym external-provider fixture guard; nie potwierdzono sukcesu rzeczywistego providera.

**Potwierdzenie przyczyny kontrastu w DOM:** directNode actualexit0, source/build unchanged; tymczasowa zamiana700→800 daje fg#065f46 i zeroaxe color-contrast violations/incomplete dla tego węzła, po czym przywrócono700. SHA-256 `454fc8b921850aeb4d80b62a68d3f694fb6f1bb71b1c7b2fd46d5a1a7c56d204`. Root zmienił light klasę w źródle; build8 i sześć bramek ukończono, a jego własny retest axe180 ma PASS automatyki. Eksperyment DOM nie potwierdza nowego builda.

**Cykl życia fixture7:** finally guard source/build/runtime PASS, ownedNext/Mongo nieaktywne/nieobecne, port45737zamknięty. Oryginalny orphaned outer wait status jest **UNKNOWN**, nie przyjmujemy exit0. Finally proof SHA-256 `de728c4e6c2c7477909243b48fa10e006cae32a7fb79737810e7aec1140df346`; niezależna kontrola zamknięcia `91805896f34a71c5ede4e99efc7b4c2ecb99f5e83255ec74112b385c5ff5239a`.

## PNG ancillary text — przyczyna i sprawdzona poprawka8

Rzeczywisty shared validator zaakceptował **82B, CRC-valid,1×1 PNG z pustym iTXt**. W zainstalowanym `embedPng/UPNG` `nextZero` może czytać poza końcem bufora, ponieważ `undefined !=0` nadal jest true. Bounded proof wstawia **wyłącznie EOF guard** w oryginalną funkcję i zatrzymuje się przed niebezpieczną iteracją: scanstart74→EOF82. **Oryginalnej nieograniczonej pętli nie uruchomiono**; dalsze synchroniczne skanowanie wynika z obserwowanej granicy i statycznego warunku, nie z pomiaru faktycznego infinitehang.

Child/outer actualexit0, signalnull, **360ms przy deadline1000ms/heap128MiB**; normalPNG/tEXt/iTXt controls embed. Input SHA-256 `2d17be992d4e17bc5b67881de17e550830e355cb1e54715b0be4fd779dfeb776`; baselineproof `2eb7abac7b89835a5c87796aebecde0a9141290a2b082f8118bf8cb94c2b5ba7`. Wąska walidacja pól `tEXt/iTXt` jest napisana i zamrożona w candidate8. Targeted9 named PASS actualchild/outer0, source/test stable:10normalnych metadata controls rzeczywiście embedują,28malformed przypadków (14wariantów×2pozycje) są odrzucane przed embedder, stored/remote-mock bytes również nie dochodzą doembedder. Build i bramki kandydata 8: **6/6 PASS, procesy zakończone kodem 0**, 505 unit/11 performance/442 HTTP. Własny load, CDP/Lighthouse, zgody i kalkulatory są ukończone; axe180 PASS automatyki; pełna macierz rerun2 FAIL na WebKit pageerror, przyczyna w analizie. Nie deklarujemy bezpieczeństwa każdego decode path ani IDAT inflation. Wcześniejsze limity pikseli/bytes i427passing unit nie obejmowały tego malformed ancillary text przypadku.

## Historyczne pomiary strony głównej candidate7

Root wykonał sekwencyjnie **3 zimne próby CDP i3 Lighthouse mobile**, **20:01:06–20:04:09 UTC**; każdy child i outer zakończyły się actualexit0, source/build before/after zgodne. To loopback i lokalny build; parent Git f9 nie jest dowodem wdrożenia ani źródłem mierzonej zawartości working tree.

| Cel | Wynik historycznego builda candidate7 | Status / zakres |
| --- | --- | --- |
| TTFB <100 ms | CDP median **11,60 ms**, origin probe **27,56 ms**; Lighthouse server-response median **11 ms** | Spełniony tylko w tych lokalnych próbach; globalny/Netlify TTFB niezweryfikowany |
| LCP <1 s | CDP median **456 ms** (528/440/456); Lighthouse median **1862,84 ms** (1862,84/1857,95/1885,36) | CDP local PASS; Lighthouse **UNMET**, odmienne profile nie są zamienne |
| INP <100 ms | Jeden scripted cookie-reject: EventTiming max **32/40/40 ms**, median40 | Lab sample; field INP **UNVERIFIED** |
| CLS =0 | CDP i Lighthouse wszystkie próby **0** | PASS w tych próbach |
| Lighthouse Performance100 mobile | **99/99/99**, median TBT **83 ms** | **UNMET**, wszystkie3 mają warning niepełnego capture |
| Startup JS <100 KB gzip | **7 modern scripts /116 668 B ≈113,93 KiB**, computed gzip9; po obserwacji9scripts/117 636B | **UNMET** zarówno dla100000B jak100KiB; nominalne Brotli99 406B nie potwierdza budżetu gzip ani deployed encoding |
| Brak render-blocking zasobów | **0 external stylesheets**, 0 resource entries oznaczonych blocking w każdej próbie CDP | PASS w zaobserwowanym publicznym profilu; inline CSS zwiększa HTML |
| Fonty | **0 B/0 requests** w CDP3, fresh computed systemfont Chromium zachowany | Historycznie59 132B; bez izolowanego A/B zysku LCP |

CDP konfiguracja:390×844, CPU×4, ustawiony network latency150ms/download200000B/s/upload93750B/s, cache disabled, service workers blocked. Lighthouse13.5 używa osobnego profilu mobile simulated throttling412×823/CPU×4. **Każdy z3 Lighthouse raportów ma warning: „The page loaded too slowly to finish within the time limit. Results may be incomplete.”** Wyniki zachowano z tym ograniczeniem; actualexit0 nie usuwa ostrzeżenia i nie jest niekwalifikowanym PASS pełnego benchmarku. Nie zmieniano progów ani ustawień, aby ukryć wynik. Nie potwierdzono, dlaczego capture nie skończył się w limicie.

Computed gzip9/Brotli11 liczymy z decoded source, więc to potencjalne rozmiary kompresji, nie dowód rzeczywistego CDN transferu. Modern startup budget wyklucza osobno zachowane `nomodule`; obserwowane później9scripts nie są liczbą startup7. `/_next/static` ma lokalnie immutable/roczny cache, origin HTML `x-nextjs-cache:HIT`; production cache/HTTP3/Brotli/103 pozostają osobne. HTML raw **322 300B**, computed gzip **54 919B**, Brotli **28 613B**. Surowe raporty są local-only; companion JSON zachowuje trzy zestawy metrics/method/exit/guard/hash i wszystkie ostrzeżenia.

Web report SHA-256 `1688f3faaa54e87e364701832b324b1536a32d02c34856e55766ded2c2f81eb2`; Lighthouse report `f6cfaf3e4b37d0e39f76a888ead63e1080c41e2c9a2803f6e7e39c64a49965fb`; execution `55095af22e2ae172cff520385f18def13ac166b8fedc082944370b84ee1252ff`. Nie przenosimy wyników tego historycznego candidate7 na obecny candidate8 i nie deklarujemy fieldINP, produkcyjnego SLA ani wpływu pojedynczej poprawki w ms.

## SEO, GEO/AEO i eksport Search Console

Historyczna frozen integration kandydata 8 ponownie sprawdza **46 publicznych tras**: renderowany HTML, metadane, H1, canonical, JSON-LD tam gdzie właściwe, wykrywalność/sitemap/`llms.txt` i noindex prywatnych stron. To lokalny kontrakt konkretnego builda, a nie pomiar pozycji Google lub cytowań AI. Szczegóły wcześniejszych zmian i ich własnych buildów zachowuje [audyt SEO](../2026-10-08/seo-review.md).

[Odczyt przekazanych CSV](../2026-10-08/search-console-export.json) ma **0 wskazanych critical/noncritical problem rows** i historyczny punkt **2026-10-04: 2 zaindeksowane strony, 0 niezaindeksowanych, 0 wyświetleń**. Puste wcześniejsze komórki pozostają nieznane. Eksport nie podaje adresów tych stron, wybranego canonical Google, zapytań, kliknięć ani pozycji. Nie potwierdza obecnego pokrycia całej witryny, wysłania sitemap ani TOP 5. `/llms.txt` pomaga odczytać katalog materiałów; nie jest potwierdzonym czynnikiem rankingu ani gwarancją cytowania.

Po odnowieniu limitu Netlify i wdrożeniu należy sprawdzić rewizję, publiczny `/cennik` bez logowania, sitemap i reprezentatywne URL przez Inspekcję URL w Search Console. Następnie porównywać zapytania/strony/CTR/pozycje w Polsce osobno dla mobile/desktop oraz zbierać field CWV. Widoczność AI wymaga powtarzalnych rzeczywistych odpowiedzi z datą, pytaniem, platformą i źródłami. **TOP 5 i obecność w odpowiedziach AI pozostają niepotwierdzone; poprawki techniczne nie gwarantują tych wyników.**

## Read-only produkcja — ograniczony aktualny odczyt

Root wykonał **pięć GET przez skonfigurowany HTTPS proxy** 2026-10-10 12:29:35 UTC; wszystkie procesy curl zakończyły się actual exit 0. Nie wykonywano zapisów, logowania ani production load. Zachowane wejście lokalne: `/tmp/faktura-production-readonly-final8-curl.json`; istotny odczyt i jego hash są w companion evidence.

| GET | Obserwacja |
| --- | --- |
| `/` | HTTP 200; TTFB **1,849405 s przez proxy**; nie jest to pomiar direct edge ani capacity |
| `/cennik` | HTTP 307 → `/login?next=%2Fcennik` |
| `/sitemap.xml` | HTTP 200; **43 URL** |
| `/robots.txt` | HTTP 200 |
| `/api/health` | HTTP 200; `ok: true`, `db: "ok"`, `env: "production"` |

Żadna odpowiedź nie zawierała `x-release-revision` ani `x-app-revision`; health również nie podawał rewizji. **Dokładny deployed commit/build pozostaje nieweryfikowalny.** Root ocenia zachowanie jako zgodne z wcześniejszą wersją; sam odczyt nie identyfikuje wdrożonej rewizji i nie stanowi dowodu wdrożenia najnowszych lokalnych zmian. Wcześniejszy bezpośredni Node TLS probe zatrzymał się na `ECONNREFUSED`; skonfigurowany proxy był wymagany w tym środowisku. Nie jest to dowód niedostępności publicznej aplikacji.

Nowsze pięć read-only GET, **2026-10-10 19:30:46 UTC**, również zakończyło się actual curl exit0, przez HTTPS proxy, bez redirect-follow/write/load. Local-only input: `/tmp/faktura-production-readonly-final8-resume-curl.json`. Root **200/TTFB1,918662 s**, `/cennik` **307→login**, sitemap **200/43URL**, robots **200**, health **200/dbok**. Żaden odczyt nie zawiera release/app revision; **brak proof nowego deployu**. Obserwowane gzip dotyczy odpowiedzi przez proxy, nie potwierdza Netlify Brotli/HTTP3/103. Poprzedni read-only input12:29 pozostaje zachowany jako oddzielny pomiar.

**Historyczna regresja consent candidate7, 19:59:34–20:00:06 UTC:** **21 planned =21 attempted =21 executed**, zero failures, actualexit0; po7 przypadków w Chromium/Firefox/WebKit. Przed/po zgodne source/build/component/wrapper/preload/browser manifest; homepage HTTP200/H1 i wybór zgód/recovery poprawne, zero pageerrors. Raw console/network są zachowane lokalnie: odnotowano anonymous `/api/auth/me`401, ostrzeżenie o blokowaniu service worker przez Playwright oraz aborted pilot requests podczas nawigacji. Nie deklarujemy zerowych console/network observations. Firefox korzysta z jawnego test-only `MOZ_DISABLE_CONTENT_SANDBOX=1`. Targeted raport SHA-256 `80bab5dd9c6f43c9b22809f78a07d826cb8d70e4ff8f762773e47c163aaa9d4a`; execution SHA-256 `8f3305163c1ae71f239bff0a0ab57ee3f8591584fc0ad36c9b39b75f92d4a349`. To weryfikuje naprawę cookie, nie wszystkie mikroelementy UI ani realny Safari/iOS. To historyczny cutoff: później dla7 ukończono kalkulator54/CDP3/Lighthouse3 i axe180 FAIL; pełnej macierzy7 nie wykonano. To własny historyczny wynik kandydata 8.

Firefox environment sprawdzono oddzielnie na `about:blank`, bez aplikacji/bazy/providerów. Baseline actualexit1 zatrzymał się na bounded newPage10s przez uid_map EROFS i rendererSIG11; identyczny readiness runner z wyłącznie testowym **`MOZ_DISABLE_CONTENT_SANDBOX=1`** ma actualexit0 dla launch/context/newPage/evaluate/cleanup. Nie zmieniono ustawień bezpieczeństwa aplikacji. To **readiness**, nie app browser PASS; końcowe komendy Firefox i ich proof mają zapisać ten warunek środowiskowy.

## Jawne ograniczenia i wymagane uzupełnienia

- Candidate4 ma zamrożoną tożsamość i sześć ukończonych bramek build/source/unit/integration, ale LOAD200 **FAIL** z27 create500 i niespójną fixture integrity. Późniejszy full ramp ma native expiry przy limicie5000ms, bez literalnego ORMcode; pierwotny mismatch cause nadal nieudowodniony. Candidate5 ma primary PASS i horizontal2 FAIL; candidate6 ma fresh6gates/primaryPASS/horizontal2FAIL. Historyczny candidate7 ma własne6gates/primaryPASS i axe180 FAIL; jego pełnej macierzy nie wykonano. Własny bieżący kandydat 14 jest opisany na początku; wyniki 3–13 zachowują swoje tożsamości i zakresy.
- Native proofs shared fence, invoice PUT/DELETE i MFA policy opisują kontrolowane sprawdzone ścieżki; nie są certyfikatem każdej trasy. W teście MFA policy collision dla implicit engine clock jest wstrzykiwany tylko gdy timestamp był pominięty, co odtwarza no-op baseline; finalna trasa zawsze jawnie zwiększa updatedAt. Same transakcyjne odczyty oraz no-op update nie tworzą tego dowodu.
- Dzisiejszy audyt pakietów dotyczy znanych registry advisories, a nie pełnego testu bezpieczeństwa aplikacji. Starsze przeglądarki niż Safari 16.4 / Chrome 111 / Firefox 128 nie są wspieranym dowodem migracji.
- Targeted candidate5 personal-role proof ma actual exit 0 (43 invoice edit/delete +8 payment), a log proof ma 8 named PASS (6 focused +2 search regressions). Są to odrębne testy bez whole-source before guard. Candidate5 ma frozen build/type/lint/unit/performance/integration PASS, w tym native edit/delete43; primary jest ukończony, horizontal2 FAIL; candidate6 ownload jest ukończony (primaryPASS,horizontal2FAIL); finalny browser pozostaje wymagany. Native log proof używa wyłącznie syntetycznego argumentu i nowej loopback bazy; report nie publikuje argumentu, raw logów, wiadomości błędów ani credentials.
- Native testy używają syntetycznych loopback danych. Nie potwierdzają rzeczywistych VIES/KSeF/płatności/email ani trwałego quota per użytkownik między instancjami Netlify.
- Warm PDF load nie mierzy rozkładu cold PDF i realnych logo/providerów. Cache bytes jest per worker; wymaga osobnego warmup każdej instancji. Cache nie jest cache uprawnień, lecz końcowe HTTP race/security check nadal wymaga świeżego dowodu.
- Historyczne serial query counts opisują konkretne probes; stary baseline serial miał słabszy guard working source, create obejmuje inicjalizację AccountingPeriod, a cursor może dodać anchor query. Nie są gwarantowanymi licznikami każdego requestu ani dowodem capacity.
- CPU profile dotyczy jednego wątku V8 i ma overhead; sampled self-time nie obejmuje całej CPU Prisma native worker/Mongo/generatora. Candidate2 zmierzył około 1,9801 core sumarycznie na limicie 2 CPU; nie zapisano delta throttling. Memory exhaustion nie udowodniono. Korzyści native-driver migration i późniejszych poprawek alokacji nie są zmierzone.
- Nie ma pomiaru produkcyjnego/staging na porównywalnym środowisku, fixed-arrival SLA ani powtórzeń statystycznych; candidate4 dedicated serial/2-/4-process/smoke przerwano przed wykonaniem. Przed zwiększeniem ruchu potrzebne są oddzielne pomiary tego środowiska.
- Font transfer candidate7 sprawdzono na jednym świeżym Chromium homepage, kalkulator54workflows na trzech silnikach PASS. Nie zmierzono izolowanego font-LCP zysku, nie przenosi się historycznych metryk final7 na bieżący build. Production GET przez proxy nie zastępuje tych bramek ani nie identyfikuje deployed revision.
- `artifacts/` jest ignored, `/tmp` nie jest publikowany. Companion JSON zachowuje sprawdzone istotne wyciągi i SHA-256; te dokumenty nie udostępniają raw logs/reports/profile files w GitHub. Publikacja/wdrożenie nie zostały wykonane w tym podzadaniu.

**Stan tej migawki przed publikacją:** kandydat 14 ma własne sześć bramek z kodem procesu testowego i zaobserwowanego nadrzędnego 0: 577 testów jednostkowych, 11 helperów wydajności, 442 sprawdzenia HTTP. PNG 68, kontrast/naciśnięcie, lifecycle 24, private readiness 6 i szczegółowe UI 42 / axe 16 mają własne zakończone dowody. Panel i faktury były gotowe w 2,69–3,54 s z CLS = 0. Publiczny CDP 14 ma LCP median 504 ms / CLS = 0. Pełna macierz wszystkich 3 silników ma rzeczywisty proces testowy 0, zgodne guards i świeże raporty; pierwotny outer 7723 pozostaje UNKNOWN, a odrębna kontrola po wznowieniu ma kod 0. Raw 132 network / 93 console i dwa komunikaty o niepotwierdzonej przyczynie pozostają jawne. Początkowy JS 116 669 B computed gzip przekracza budżet 100 KB, prywatny LCP przekracza 1 s. Nie przeniesiono czasów 13; Lighthouse 10 to osobne historyczne 99/99/99 z ostrzeżeniami niepełnego pomiaru, a LOAD200 8 osobny backend. Wszystkie stany UI, pełne UI ≤4 s przy LOAD200, realne providery, fizyczne Safari/iOS, field INP, globalny TTFB, pełne bezpieczeństwo i TOP 5 są niezweryfikowane. Finalny skan dokładnego zamrożonego zestawu pozostaje warunkiem publikacji; wynikowy commit i GitHub CI mają odrębne późniejsze potwierdzenie. Netlify czeka na odnowienie limitu.
