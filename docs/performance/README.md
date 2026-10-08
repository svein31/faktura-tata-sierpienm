# Pomiary wydajności i obciążenia

Stack: Next.js 15 App Router, React 19, Tailwind CSS, Prisma 6 z MongoDB, Node.js; hosting produkcyjny Netlify. Faktury, sesje i kolejki są danymi prywatnymi: odpowiedzi uwierzytelnionych API zachowują `Cache-Control: no-store`.

Uruchamiaj pomiary sekwencyjnie, po ukończeniu builda/linta/testów; równoległe zadania CPU zniekształcają wyniki na tym samym hoście.

## Uruchomienie pomiarów

Najpierw zbuduj aplikację. Pomiar nie uruchamia builda i zapisuje jego `BUILD_ID`, aby uniknąć porównywania przypadkowego `next dev` z produkcją.

```sh
npm ci
npm run build
npm run app:start -- --port 3001 --hostname 127.0.0.1
```

W drugim terminalu:

```sh
node scripts/performance/web-lab.mjs --url http://127.0.0.1:3001 --runs 3 --output artifacts/performance/web-lab.json
node --test scripts/performance/metrics.test.mjs
node scripts/performance/load-isolated.mjs --users 10 --invoices-per-user 300 --seconds 6 --concurrency 1,5,20 --output artifacts/performance/load-isolated.json
```

Opcjonalny Lighthouse na Linux/CI, bez dodawania biblioteki do aplikacji:

```sh
npm install --prefix /tmp/faktura-performance-tools --ignore-scripts --no-package-lock --no-audit --no-fund lighthouse
node scripts/performance/lighthouse-lab.mjs --url http://127.0.0.1:3001 --runs 3 --output artifacts/performance/lighthouse-mobile.json --raw-dir /tmp/faktura-lighthouse-raw
```

Wrapper używa Chrome z Playwright i profilu mobile Lighthouse z symulowanym throttlingiem. Pełne raporty pozostają w wskazanym katalogu, a zwarty JSON zapisuje wszystkie wyniki, wersję narzędzia, warunki i medianę. To inny profil niż rzeczywiste throttling CDP w `web-lab.mjs`; porównuj wyniki tej samej metody. Lighthouse działa jako narzędzie poza zależnościami produkcyjnymi. `--binary` pozwala wskazać instalację narzędzia na innym systemie.

Generator obciążenia zawsze tworzy nową lokalną replikę MongoDB, nadpisuje `DATABASE_URL`, blokuje wywołania zewnętrznych dostawców w procesie aplikacji i wyłącza dane dostawców. Nie ma opcji wskazania produkcyjnego URL ani bazy. Wszystkie rekordy są syntetyczne. Skrypt nie wysyła faktur do MF ani e-maili, nie obciąża Stripe i sprząta własne procesy/bazę w `finally`. `--read-only` usuwa wystawianie faktur z mieszanki ruchu.

Większa lokalna próba, po upewnieniu się, że masz wolne zasoby:

```sh
node scripts/performance/load-isolated.mjs --users 100 --invoices-per-user 1000 --seconds 30 --concurrency 5,20,50 --output artifacts/performance/load-large.json
```

Limity narzędzia: maksymalnie 200 000 dokumentów, 500 pracowników i 60 sekund na etap. To ograniczenia bezpieczeństwa lokalnego eksperymentu, nie deklarowana pojemność produkcji.

## Co mierzymy

`web-lab.mjs` używa pustego kontekstu Chromium, telefonu 390×844, CPU spowolnionego 4×, ustawień CDP 1,6 Mb/s pobierania i 150 ms opóźnienia, wyłączonego cache i service workera. Zapisuje TTFB, LCP, CLS z oknami sesji, długie zadania, timing zasobów i rozmiary JS/CSS. Rozmiary gzip/Brotli liczymy z rozkodowanych plików; wdrożone kodowanie trzeba sprawdzić osobno w nagłówku `Content-Encoding`.

Nowoczesne przeglądarki pomijają `nomodule`: ten polyfill jest raportowany oddzielnie. `initialDocumentScripts` obejmuje skrypty referencjonowane w pierwszym HTML. `loadedDuringObservationJavaScript` obejmuje także pobrany później kod, np. prefetch następnych stron. Sama mała paczka strony nie wystarczy, gdy prefetch pobiera ciężkie ekrany.

`maxObservedInteractionDurationMs` to wynik jednej zaprogramowanej interakcji z banerem cookies. Nie jest produkcyjnym INP. Brak wpisu EventTiming o czasie ≥16 ms daje wartość 0 i nie oznacza zerowego kosztu interakcji. INP oraz LCP p75 należy mierzyć na prawdziwych urządzeniach, po uzyskaniu właściwej zgody na pomiar.

`load-isolated.mjs` uruchamia lokalny produkcyjny serwer i realistyczny zestaw: bootstrap, listę 30 faktur, wyszukiwanie po numerze/kontrahencie, szczegóły, wystawianie i zapisany PDF. Osobne sondy mierzą pełny bootstrap z 300 fakturami, małą podpowiedź numeru i pierwszy PDF. Brak podpowiedzi w starym buildzie jest oznaczony w raporcie. Raport zawiera p50/p95/p99, TTFB, req/s, kody odpowiedzi, błędy, indeksy, plany zapytań oraz liczbę połączeń Mongo. Integralność sprawdza jeden zapis faktury i rezerwacji numeru na każdą udaną odpowiedź utworzenia.

To model zamknięty: pracownik wysyła następną prośbę po zakończeniu poprzedniej, bez czasu namysłu. Wynik nie uwzględnia oczekiwania przed kolejnym wysłaniem (coordinated omission). Baza i aplikacja są na tej samej maszynie, PDF w rampie jest rozgrzany. Wynik nie obejmuje sieci, edge/CDN Netlify, zimnych startów funkcji, rzeczywistych dostawców ani nie dowodzi obsługi tysięcy równoczesnych użytkowników.

## Pomiar po wdrożeniu

1. Lighthouse: tryb mobile, cache pusty, trzy pomiary, porównuj mediany i zakładki *Diagnostics / Treemap*. Zapisz wersję Lighthouse, urządzenie i warunki; wynik 100 jest wynikiem konkretnego uruchomienia.
2. Chrome DevTools: *Network* z wyłączonym cache i wolnym LTE; sprawdź JS, CSS, fonty, inicjatorów pobrań oraz `Cache-Control`, `Content-Encoding` i protokół. *Performance* pokaże długie zadania, koszt renderowania i interakcje. Testuj także stary telefon fizyczny.
3. PageSpeed Insights: porównuj osobno dane laboratoryjne i CrUX. Nowa strona może nie mieć jeszcze dostatecznej liczby danych rzeczywistych. CrUX/raport Core Web Vitals w Search Console agreguje zwykle okres 28 dni.
4. WebPageTest: lokalizacja bliska użytkownikom w Polsce, mobile/Slow 4G, trzy powtórzenia, first/repeat view; analizuj waterfall, połączenia TLS, cold/warm TTFB, LCP i pobrania przed pierwszą interakcją.
5. Staging o takim samym planie hostingu, regionie bazy i limitach połączeń: osobny test stałej częstotliwości napływu żądań, stopniowy wzrost, mierzenie błędów, CPU, pamięci, kolejki połączeń i kosztów. Ten skrypt celowo nie przyjmuje jego URL; zatwierdź osobną konfigurację obciążenia przed użyciem narzędzia typu k6 na stagingu.

TTFB <100 ms przez internet zależy od odległości i zimnego startu. Lokalny TTFB nie potwierdza tego celu dla użytkownika w Polsce. HTTP/3, Brotli i 103 Early Hints kontroluje infrastruktura Netlify; wpis w `next.config` nie włączy ich na platformie. Weryfikuj faktyczny protokół/nagłówki po publikacji. Prywatne dokumenty nie mogą trafiać do wspólnego cache CDN ani offline cache service workera.

## Samodzielny audyt telefonu

Po buildzie uruchom `npm run test:mobile`. Runner tworzy własną lokalną MongoDB i serwer, blokuje połączenia dostawców i wykonuje scenariusze przeglądarkowe oraz pełny audyt Chromium/WebKit. Zainstaluj ich binaria i wymagane biblioteki przez `npx playwright install --with-deps chromium webkit`. `RUN_WEBKIT_CHECKS=0` wyłącza wyłącznie Safari/WebKit, gdy środowisko go nie obsługuje; raport musi wskazać ten brak. Testy układu czekają na hydratację, bootstrap, fonty i dwa renderowane klatki, nie na ustanie ruchu w tle.
