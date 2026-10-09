# Wydajność po aktualizacji zależności — final7, 9 października 2026

Rzeczywisty build **EtIKJoZ6X52nNorRlxheE**, SHA źródeł **202ad9a2ba265177355cbaf5318a9a91837744b89727ebc42f8fdaa49588a716**; Next.js 15.5.27, sharp 0.35.5 i source-map-js 1.2.2. Pomiary przeprowadzono kolejno po zakończeniu pozostałych testów, ze sprawdzeniem tożsamości przed i po każdej serii. [Pełne dane i profile](results-final7-2026-10-09.json) oraz [regresja i bezpieczeństwo](../audit/2026-10-08/dependency-followup-final7.md).

| Pomiar | Wynik final7 | Granica dowodu |
| --- | --- | --- |
| Dokument TTFB | Mediana lokalna 11,2 ms | Loopback; zadane CDP 150 ms nie odtwarza rzetelnie RTT dokumentu. Internet, edge i cold-start nieweryfikowane |
| CDP LCP | 588 / 652 / 644 ms, mediana 644 ms | Chromium 390×844, CPU 4×, zadane 1,6 Mb/s i 150 ms, zimne konteksty |
| Lighthouse Mobile | 97 / 95 / 95, mediana 95/100 | Lighthouse 13.5.0, domyślny profil mobile simulated; inny profil niż CDP |
| Lighthouse LCP | 2044,78 / 2432,1 / 2446,33 ms, mediana 2432,1 ms | Cel<1s: niespełniony w tym profilu |
| CLS | 0 / 0 / 0 / 0 / 0 / 0 | Tylko sześć prób lab; field nieweryfikowany |
| Początkowy JS | 116 653 B / 113,92 KiB gzip | Szacunek z rozkodowanych odpowiedzi; cel<100000B niespełniony, nomodule osobno |
| EventTiming | 56 / 40 / 56 ms | Jedna zaprogramowana interakcja na próbę; nie jest INP |
| Obciążenie | 1317 żądań, 0 błędów; maks. 20 wykonawców | 1000 kont × 30 faktur w bazie nie oznacza1000 równoczesnych użytkowników |
| API przy 20 wykonawcach | 89,46 req/s, p95 538,5 ms, p95 TTFB 538,26 ms | Zamknięty model lokalny, 6 s na etap, rozgrzane PDF, ta sama maszynaDB/aplikacja; brak SLA |

| Etap load | Żądania | req/s | p95 całości | Błędy |
| --- | ---: | ---: | ---: | ---: |
| 1 wykonawca | 232 | 38,6 | 49,84 ms | 0 |
| 5 wykonawców | 535 | 88,24 | 110,57 ms | 0 |
| 20 wykonawców | 550 | 89,46 | 538,5 ms | 0 |

Integralność zapisów sprawdzono po zakończeniu: exactlyOnce=true; pełne liczniki i indeksy są w JSON. W tej poprawce zmieniono wersje zależności, więc nie przypisujemy jej fikcyjnego zysku czasu ani KB. Różnice między seriami mogą wynikać ze zmienności pomiarowej.

[Poprzedni szczegółowy raport](WYNIKI-2026-10-09.md) zachowuje historyczne pomiary final6, gotowe fragmenty kodu/cache/prefetch/fontów i komendy Lighthouse, WebPageTest, PageSpeed Insights oraz DevTools. Nie przypisuje się jego metryk final7. Po wdrożeniu Netlify potrzebne są ponowne pomiary Polski/mobile, first/repeat, protokołów i rzeczywistych użytkowników. Netlify nadal nie wdrożył tego snapshotu; INP rzeczywistych użytkowników i gotowość na tysiące jednoczesnych osób pozostają nieweryfikowane.
