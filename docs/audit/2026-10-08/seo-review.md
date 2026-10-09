# Audyt SEO, GEO/AEO i publicznych kalkulatorów — 8 października 2026

**Końcowy przebieg final6:** BUILD_ID `21f_lBaQA8Ww--YiYgN1t`; SHA-256 źródeł `14e1b8e0f3850b795ad5d8e7c183edb335b0f40f275e16ce710c6e456e62a3fc`. Build, TypeScript, lint i 282 testy PASS; pełny HTTP (442 kontrole katalogu) oraz cała macierz Chromium/WebKit/Firefox zakończone w dwóch zgodnych przebiegach w opisanym zakresie (Chr/WK z pierwszego, pełny nowy FF z drugiego; zatrzymanego FF nie zaliczono). Axe: 90 tras/180 ekranów, zero automatycznych naruszeń, 86 ekranów nadal wymaga oceny ręcznej. Kanoniczne dowody: [runtime-release-evidence.json](runtime-release-evidence.json), [http-audit.json](http-audit.json), [browser-coverage-summary.json](browser-coverage-summary.json) i [accessibility-routes.json](accessibility-routes.json). Nie jest to potwierdzenie wdrożenia produkcji ani wszystkich mikroelementów.

Historyczny final5 po poprawkach cookies przeszedł swoje HTTP/axe/print i układ36, lecz pełna macierz zatrzymała się w WebKit na pięciu błędach RSC prefetch. Final6 ogranicza automatyczny prefetch linków i ma świeży ukończony przebieg; szczegóły poniższych starszych pomiarów zachowują własne buildy i fingerprinty.

Commit bazowy: `0c4c726`; gałąź docelowa `main`. Sprawdzono kod metadanych, canonical, robots, sitemap, indeksowanych tras, JSON-LD, linków wewnętrznych, dat, cen, autorstwa i cytowanych źródeł. Final5 dla buildu `ZjS2_AKTU791vZrYv_n4s`, SHA-256 źródeł `ce3665de428fedf36757ee40757cdeb4ac903d3c10f3e3b10934402ced89f417`, zaliczył build i lint i cały zestaw 282 testów bez pominięć. Do ostatecznego wyniku uruchomienia całego serwisu służy [RAPORT.md](RAPORT.md); poniżej rozróżniono dowody źródłowe, testy oraz starszą produkcję.

## Co faktycznie zawierają eksporty Search Console

| Plik | Odczytana zawartość | Znaczenie i ograniczenie |
|---|---|---|
| Problemy krytyczne.csv | Wyłącznie nagłówki: przyczyna, źródło, weryfikacja, strony. | Eksport nie zawiera zgłoszonych pozycji do naprawy. Nie dowodzi poprawności każdego adresu witryny. |
| Problemy niekrytyczne.csv | Wyłącznie te same nagłówki. | Brak wskazanych problemów nie jest obietnicą wysokiej pozycji. |
| Metadane.csv | `Sitemap: Wszystkie znane strony`. | To zakres raportu, nie wykaz adresów sitemap ani konfiguracja serwera. |
| Wykres.csv | 30 września–3 października: puste liczby indeksowanych/nieindeksowanych, wyświetlenia 0. Dnia 4 października: zindeksowano 2, nie zindeksowano 0, wyświetlenia 0. | Historyczny punkt raportu wskazuje 2 zaindeksowane strony; nie zawiera ich adresów, zapytań, kliknięć, CTR ani pozycji. Nie jest pomiarem aktualnej widoczności wszystkich stron. |

Na podstawie tych plików nie można obliczyć pozycji, wskazać fraz prowadzących na stronę ani potwierdzić TOP 5. Indeksacja jest warunkiem możliwości pojawienia się w wynikach, a nie gwarancją pozycji.

## Problemy i poprawki

| Element | Problem | Przyczyna | Poprawka u źródła | Status / dowód |
|---|---|---|---|---|
| 5 stron prawnych | Brak canonical; tytuły zawierały markę przed ponownym dodaniem jej przez główny szablon. | Osobne obiekty metadanych pomijały wspólny helper. | `publicMetadata` definiuje absolutny tytuł, własny canonical, indeksowanie, Open Graph i Twitter. Treść dokumentów prawnych pozostaje taka sama. | Naprawione; test metadanych 5 stron przeszedł. Kontrola renderowanego HTML włączona do wspólnego audytu SEO. |
| Sitemap — katalog porównań | Data katalogu była 2 października mimo artykułów dodanych/zmienionych 3 października. | Stała data katalogu ignorowała daty kart, które faktycznie renderuje katalog. | `contentModifiedAt` wybiera najpóźniejszą rzeczywistą datę katalogu i jego artykułów. Po poprawieniu źródła Betterfly jest to 8 października. Strony bez znanej daty nie dostają zmyślonej daty bieżącego wdrożenia. | Naprawione; test sitemap i wyłączenia prywatnych tras przeszedł. |
| `/llms.txt` | Część wpisów miała etykiety surowych slugów, np. `kody-qr` i `dla-jdg`; ręczna lista i ceny mogły rozjechać się z poradnikami. | Oddzielny plik utrzymywany ręcznie. | Statyczna trasa podczas budowania generuje katalog wszystkich 29 artykułów z ich tytułami, opisami, datami i canonical oraz cenami ze wspólnej definicji planów. Uwzględnia odnowienie subskrypcji, ograniczenia demo i autorstwo porównań. | Naprawione; test kompletności i treści przeszedł. Nie jest to miernik obecności w odpowiedziach AI. |
| Źródło porównania Comarch Betterfly | Link opisany jako oferta Betterfly prowadził do ogólnej strony korporacyjnej Comarch. | Zbyt ogólny adres źródła. | Oficjalny adres produktu znaleziony w nawigacji Comarch, następnie zweryfikowany: `https://www.comarchbetterfly.pl/`. Zmieniono odnośnik i rzeczywistą datę sprawdzenia; nie wymyślono ceny ani funkcji. | Naprawione; GET 200 i tytuł produktu zapisane w `seo-source-links.json`. |
| Nawigacja i karty poradników | Domyślne pobieranie z wyprzedzeniem mogło pobierać wiele stron, mimo że odwiedzający czyta tylko jedną. | Publiczne komponenty nie ustawiały `prefetch={false}` tak jak strona główna. | Wyłączono automatyczny prefetch wspólnego nagłówka, kart, powiązanych tematów i CTA. Normalna nawigacja i serwerowe linki pozostają dostępne. | Naprawione w źródle. Nie przypisano niezmierzonego zysku w milisekundach. |
| Kalkulator VAT — duże wartości | Dla `60071992547000.15` PLN i 23% VAT wynik był o grosz za duży: VAT `13816558285810.04`, brutto `73888550832810.19`. | Mnożenie bezpiecznych całkowitych groszy przez stawkę przekraczało dokładność `Number`; formatowanie przez dzielenie przez 100 także gubiło grosze. | Dokładne parsowanie dziesiętne, obliczenia pośrednie `BigInt`, zaokrąglenie do grosza i formatowanie bez konwersji dużej kwoty na zmiennoprzecinkowe złote. Prawidłowo: VAT `13816558285810.03`, brutto `73888550832810.18`. | Naprawione; regresja konkretnych wartości i wszystkich 4 stawek w obu kierunkach przeszła. |
| Kalkulator VAT — zakres wyniku | Akceptowana kwota wejściowa mogła dawać wynik spoza dokładnego zakresu groszy. | Sprawdzano wyłącznie wejście, nie wynik dodawania/mnożenia. | Odrzucane są wejścia i wyniki powyżej `Number.MAX_SAFE_INTEGER` groszy; komunikat i `aria-invalid` wskazują błąd. | Naprawione; test granicy i przepełnienia przeszedł. |
| Walidacja publicznych kalkulatorów | Błędne pola nie ogłaszały stanu niepoprawnego i nie łączyły go z objaśnieniem. | Brak atrybutów dostępności przy walidacji. | Dodano `aria-invalid`, opis formatu i zakresu oraz powiązanie komunikatu błędu. Limit długości wejścia ogranicza przetwarzanie nieprawidłowych skrajnie długich wartości. | Naprawione; regresja matematyczna przechodzi, pełny test DOM dodany do macierzy przeglądarek. |
| Kontrakt audytu SEO | Pomijał pięć indeksowanych stron prawnych i kompletność katalogu AI. | Ręczna lista testowanych tras była krótsza od sitemap. | Wszystkie 46 indeksowanych tras podlegają kontroli HTML, metadanych, canonical, H1, wykrywalności i sitemap. Dodano zgodność dat oraz wpisów `/llms.txt`. JSON-LD pozostaje wymagane dla stron produktu, narzędzi i artykułów; dokumenty prawne nie muszą mieć sztucznego oznaczenia artykułu. | PASS rzeczywistego HTML wszystkich 46 tras w pełnym przebiegu HTTP builda `ZjS2_AKTU791vZrYv_n4s`. |

## Sprawdzone bez dodawania zbędnych zmian

- Canonical i Open Graph pozostałych publicznych stron odnoszą się do `https://fakturaprosto.pl`. Roboty mogą odczytać publiczne treści oraz zasoby Next; prywatne strony i API są chronione oraz wyłączone z sitemap.
- Publiczne artykuły mają krótką odpowiedź, rzeczywiste autorstwo redakcji, datę, przykład, ograniczenia, linki do powiązanych tematów i źródła. JSON-LD zawiera artykuł i breadcrumbs; FAQ na pomocy jest zgodne z widocznymi odpowiedziami.
- `SoftwareApplication` ma ceny zgodne z planami, bez zmyślonej oceny, recenzji i liczby klientów. Nie dodano `LocalBusiness` ani fikcyjnego adresu działalności.
- Odczytano 21 różnych adresów cytowanych w poradnikach, następnie zweryfikowano właściwy adres Betterfly. Wszystkie zwróciły HTTP 200 po przekierowaniach. Produkcyjny cennik trafił jednak na logowanie, co odnotowano jako problem starszego wdrożenia. HTTP 200 sam nie potwierdza działania obcej aplikacji ani aktualności wszystkich zdań podatkowych.
- Sprawdzono aktualną publiczną odpowiedź MF dla limitu 10 000 zł: dokładna granica, faktura przekraczająca limit, brak przywrócenia wyjątku w kolejnym miesiącu i przejściowość do końca 2026 r. są zgodne z opisem i kalkulatorem. Inne przepisy nadal należy weryfikować dla konkretnej transakcji.

## Regresje i sposób pomiaru

W tej części audytu przeszło 6 przypadków testowych:

```sh
node scripts/tests/seo-discovery.test.cjs
node scripts/tests/public-calculator-math.test.cjs
```

ESLint dla zmienionych plików SEO i kalkulatorów oraz `git diff --check` przeszły. Audyt renderowanego HTML `auditSeoContracts` przeszedł dla 46 publicznych tras na buildzie `ZjS2_AKTU791vZrYv_n4s`, SHA256 źródeł `ce3665de428fedf36757ee40757cdeb4ac903d3c10f3e3b10934402ced89f417` (`/tmp/faktura-qa-http-final5.log`). Sprawdził metadane, H1, canonical, obrazy, JSON-LD, sitemap, `/llms.txt` i noindex stron prywatnych. Historyczne final2/final3 zachowano w [runtime-release-evidence.json](runtime-release-evidence.json); nie przypisano ich późniejszym źródłom. Samodzielnie:

```sh
npm run test:seo -- http://127.0.0.1:3000
```

`scripts/public-calculator-browser-checks.mjs` eksportuje `auditPublicCalculators(page)`. Macierz końcowa uruchamia go w Chromium, Firefox i WebKit. Każda przeglądarka sprawdza 18 scenariuszy w szerokościach 320/768/1280: wszystkie stawki, oba kierunki, polski format, puste i błędne wartości, markup, dokładność dużych kwot, przepełnienia, poprawę błędu, klawiaturę, odświeżenie, powrót i granice KSeF. Wynik nie jest deklarowany przed przejściem tego przebiegu.

## Niezweryfikowane i wymagające wdrożenia

| Obszar | Powód / dalsza weryfikacja |
|---|---|
| Produkcyjne działanie nowych poprawek | Publiczna produkcja nadal zawiera starszy build; limit Netlify uniemożliwia obecnie nowe wdrożenie. Kod repozytorium i starsza strona nie są tym samym wynikiem testu. |
| Aktualne URL-e i problemy indeksacji w GSC | Dołączone CSV nie zawierają przykładów URL, inspekcji, wybranego canonical Google ani nowszych danych. |
| TOP 5, ruch i frazy | Brak eksportu wyników wyszukiwania z zapytaniami, stronami, krajem, urządzeniem i pozycjami. Nawet kompletna poprawa techniczna nie daje gwarancji pozycji. |
| Cytowania i widoczność w Google AI, ChatGPT, Gemini i innych systemach | Brak niezależnego, powtarzalnego pomiaru rzeczywistych odpowiedzi. `/llms.txt` jest katalogiem pomocniczym, nie oficjalnym czynnikiem rankingu Google ani gwarancją cytowania. |
| Produkcyjne CWV i zachowanie pod obciążeniem | Wymagają pomiarów aktualnie wdrożonego buildu i odpowiedniej próbki rzeczywistych użytkowników. Lokalna responsywność nie dowodzi produkcyjnego INP. |

Po odnowieniu limitu Netlify należy zweryfikować, że cennik ma 200 bez logowania, nowe porównania mają 200, nieistniejący adres ma rzeczywiste 404, a sitemap zawiera 46 aktualnych publicznych adresów. Następnie w Search Console ponownie odczytać `sitemap.xml` i sprawdzić wybrane reprezentatywne adresy poprzez Inspekcję URL. Monitorować zapytania i strony przez kolejne tygodnie, porównując kraj i urządzenie; nie mylić indeksacji z pozycją.

Google opisuje [wymagania techniczne indeksowania](https://developers.google.com/search/docs/essentials/technical), [wybór canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [daty sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) oraz [obecność w funkcjach AI](https://developers.google.com/search/docs/appearance/ai-features). Obowiązują zwykłe zasady wyszukiwarki: dostępny, indeksowalny serwis i użyteczne, wiarygodne treści. Dostępność wyników FAQ/HowTo w Google jest ograniczona; samo schema nie daje dodatkowego wyniku ani wyższej pozycji.
