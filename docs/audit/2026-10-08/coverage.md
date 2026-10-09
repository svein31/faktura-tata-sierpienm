# Zakres audytu 2026-10-08

Generowanie: `node scripts/qa-inventory.mjs`. Wersja źródeł: `0c4c726fb109ee209026e77541e8caf08a02c1fa`; SHA-256 zawartości: `14e1b8e0f3850b795ad5d8e7c183edb335b0f40f275e16ce710c6e456e62a3fc`. Po zmianach trzeba wygenerować ponownie.

| Obiekt | Liczba | Status samego spisu |
|---|---:|---|
| Wzorce stron | 65 | odkryte w źródłach |
| Konkretne publiczne ścieżki, wszystkie slugi | 51 | odkryte w źródłach |
| Wzorce API | 135 | odkryte w źródłach |
| Metody API | 193 | odkryte w źródłach |
| Pliki komponentów | 75 | odkryte w źródłach |
| Szablony mikroelementów UI | 1730 | odkryte w źródłach |

Każdy szablon ma lokalizację plik/wiersz, atrybuty, powiązane strony i osobne statusy akcji, hover, focus, disabled, loading, error, empty, walidacji, odświeżenia i wstecz. Status `source-discovered` ani obecność atrybutu nie oznacza poprawnego działania. Wszystkie niewykonane kontrole pozostają `unverified`. Pętle oraz warunki JSX wymagają osobnych żywych obserwacji; sam spis nie dowodzi przeklikania wszystkich wariantów.

Audyt przeglądarkowy zapisuje osobny raport `artifacts/audit/browser-coverage.json`: rzeczywiście odwiedzone ścieżki, silniki, rozmiary ekranu, widoczne kontrolki i wykonane kontrole. Nie wpisuje sukcesu dla nieklikniętych działań. Aktualizacja raportu po zmianie kodu wymaga ponownego przebiegu. Raport produkcyjny jest osobny: lokalna baza i odcięte integracje nie dowodzą działania Netlify, prawdziwej poczty, Stripe, MF/KSeF, GUS, VIES ani NBP.

Trasy z identyfikatorem/tokenem wymagają prawidłowych izolowanych danych: faktura, portal faktury/oferty i zaproszenie. Nieprawidłowe/wygasłe tokeny oraz 404 są odrębnymi przypadkami. Testy destrukcyjne wolno wykonywać wyłącznie na izolowanej bazie testowej.

Spis obejmuje także 1 publiczną trasę HTTP poza API, 5 tras metadanych, 2 widoki systemowe oraz źródła middleware/konfiguracji routingu. Pliki pomocnicze komponentów są oznaczone osobno od JSX.

Po pełnym przebiegu uruchom `node scripts/qa-inventory.mjs --runtime artifacts/audit/browser-coverage.json`. Uzupełnienie wymaga zgodnego SHA-256 źródeł, stylów, zasobów, schematu oraz konfiguracji/dependencji. Dopasowanie DOM do JSX stosuje tylko dokładną, jednoznaczną nazwę i typ kontrolki w osiągalnych źródłach danej strony. Nie przenosi sukcesu na podobny przycisk lub niewidoczny wariant. Programmatic focus jest odrębny od klawiatury i wyglądu obramowania. Obserwacja disabled/loading nie dowodzi prawidłowego zakończenia działania. Wyniki komponentów syntetycznych mają osobny zakres i nie zastępują rzeczywistych operacji aplikacji.

Uzupełnienie z przebiegu: `applied-exact-unambiguous-matches`. {"status":"applied-exact-unambiguous-matches","buildId":"21f_lBaQA8Ww--YiYgN1t","matchedObservations":12815,"focusObservations":11358,"templatesObserved":273,"templatesWithExplicitActions":2,"checkedScenarioRecords":246}

Dowody API: `--api-runtime artifacts/functional/http-audit.json` (domyślny plik). Wymagają zgodnego hasha źródeł, identyfikatora builda i katalogu metod. Każdy dowód jest przypisany do dokładnej metody i ścieżki; literalna trasa ma pierwszeństwo przed parametrem. Test ogólny `HTTP < 500` jest wyłącznie obserwacją smoke, nie potwierdza autoryzacji ani powodzenia operacji. Sprawdzone kategorie oznaczają wyłącznie jawnie podane przypadki/statusy, nie wszystkie warianty endpointu.

Uzupełnienie API: `applied-exact-method-route-evidence`. {"status":"applied-exact-method-route-evidence","buildId":"21f_lBaQA8Ww--YiYgN1t","sourceSha256":"14e1b8e0f3850b795ad5d8e7c183edb335b0f40f275e16ce710c6e456e62a3fc","routeCatalogSha256":"089a01c63c6dd3fb68f13f560a3c0cd95475bd090d703c256c8c1d1e5eb045eb","reportChecks":442,"matched":396,"smokeObservations":268,"targetedStatusChecks":128,"failedRequests":0,"unmatched":46,"reportFailures":0,"routesObserved":135,"routesWithTargetedChecks":40,"scope":"A checked category proves only listed cases/methods; a generic response below 500 proves no access boundary or successful business operation."}
