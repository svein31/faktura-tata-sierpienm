# Diagnoza WebKit podczas nawigacji — final6

Build aplikacji: `21f_lBaQA8Ww--YiYgN1t`. SHA-256 źródeł: `14e1b8e0f3850b795ad5d8e7c183edb335b0f40f275e16ce710c6e456e62a3fc`. Kod aplikacji nie został zmieniony w ramach diagnozy.

Surowy test ruchu zachowuje 1 komunikat WebKit `Fetch API cannot load ... due to access control checks.`; Chromium i Firefox miały 0. Nie nadpisano tego wyniku jako 0 błędów. Przy pierwotnym komunikacie brak pasującego `requestfailed` dla wyszukiwania faktur, więc samo powiązanie czasowe z innymi anulowaniami nie wystarczało do wyjaśnienia.

Niezależny test na lokalnym serwerze tego samego pochodzenia odtworzył dokładnie ten komunikat przy rozpoczęciu `fetch` w wychodzącym dokumencie. Wywołanie wracało prawidłowo; odrzuconą obietnicę obsłużył `.catch`. Dodanie synchronicznego `try/catch` nie usunęło komunikatu i nie przechwyciło żadnego wyjątku. Zachowanie występuje również bez przechwytywania żądań przez Playwright.

| Próba | Dokładny komunikat dostępu | DOM error bez sentinela | DOM unhandledrejection bez sentinela | Wykryte błędy kontrolne |
| --- | ---: | ---: | ---: | ---: |
| Aplikacja:12 cykli | 7 | 0 | 0 | 0 |
| Aplikacja:3 cykle+sentinele | 3 | 0 | 0 | 2 |
| Minimalny test zamykania dokumentu | 71 | 0 | 0 | 2 |
| Minimalny test:none | 12 | 0 | 0 | 2 |
| Minimalny test:instant-route-continue | 13 | 0 | 0 | 2 |
| Minimalny test:route-continue-after100ms | 12 | 0 | 0 | 2 |

Playwright WebKit w `node_modules/playwright-core/lib/coreBundle.js:49836` zamienia każdy wpis konsoli `level=error`, `source=javascript` na `pageerror`. Taki wpis nie musi być nieobsłużonym wyjątkiem DOM. Minimalny test zachowuje surowy komunikat, jego stos, tożsamość dokumentu utworzenia żądania oraz późniejszą obsługę odrzucenia.

W samej aplikacji 12 cykli odtworzyło 7 komunikatów między rozpoczęciem przejścia z faktur a utworzeniem nowego dokumentu dashboardu, bez zdarzeń DOM error/unhandledrejection. Oddzielne 3 cykle w tej samej karcie aplikacji z dwoma celowymi błędami kontrolnymi potwierdziły działanie rejestratora: obsłużył zarówno zdarzenie DOM error, jak i unhandledrejection oraz odpowiadające im pageerror. Minimalny zwykły test anulowania potwierdził ponadto, że nieobsłużone odrzucenie jest wykrywane i że nie należy ignorować wszystkich anulowanych żądań.

Wniosek dotyczy wyłącznie dokładnie odtworzonego komunikatu przy tworzeniu żądania podczas zamykania dokumentu. Nie zmieniono globalnych kontroli błędów pełnej macierzy ani kodu aplikacji. Pozostałe pageerror, błędy aktywnej strony, prawdziwe CORS, DOM error i nieobsłużone obietnice nadal wymagają reakcji.

Nie instrumentowano wewnętrznego catch hooka aplikacji, więc nie twierdzimy, że jego wykonanie zostało bezpośrednio zaobserwowane. Same zdarzenia DOM mogą zniknąć przy niszczeniu dokumentu; wniosek wynika także z niezależnej, dokładnej reprodukcji oraz reguły adaptera konsoli. Testowano Playwright WebKit 26.6 na Linuxie; Safari na rzeczywistym iPhonie nie jest objęte tym dowodem. Pomiary czasu mają charakter diagnostyczny, bez deklaracji wydajności produkcyjnej.

Dane, znaczniki czasu, krótkie osie zdarzeń, sumy kontrolne surowych artefaktów i ograniczenia są w [webkit-navigation-causal-final6.json](webkit-navigation-causal-final6.json). Wszystkie własne przeglądarki i lokalne serwery diagnostyczne zostały zamknięte; serwer QA należący do procesu głównego pozostał uruchomiony. Nie wykonano zapytań do usług zewnętrznych ani zapisów produkcyjnych.
