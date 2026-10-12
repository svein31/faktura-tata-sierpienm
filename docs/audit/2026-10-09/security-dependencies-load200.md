# Zależności bezpieczeństwa i kontekst testu 200 wykonawców — 2026-10-09

Pełny `npm audit` dla obecnego lockfile wykazał **0 znanych advisories**, również w zależnościach developerskich. Migracja usunęła podatny toolchain Tailwind 3. Kompatybilność CSS potwierdzono na opisanych fixture Chromium; pełna regresja aplikacji na nowym buildzie oraz końcowy wynik testu 200 wykonawców pozostają **pending** w tym dokumencie. Wynik audytu pakietów nie oznacza braku wszystkich możliwych luk aplikacji.

Zwięzłe, maszynowe dowody z SHA-256: [security-dependencies-load200.evidence.json](security-dependencies-load200.evidence.json). Raporty historyczne final7 pozostawiono bez zmian.

## Naprawione zależności

| Element | Problem i przyczyna | Poprawka | Status |
| --- | --- | --- | --- |
| Next | Advisories cache poisoning SSG/ISR w wersjach przed 15.5.27 | Next **15.5.27**, zgodne binaria SWC | Brak advisory w aktualnym audycie |
| sharp / librsvg | Advisory `GHSA-wq5f-xc86-pv6w` dla sharp przed 0.35.5 | sharp **0.35.5** i odpowiadające binaria/libvips | Brak advisory w aktualnym audycie |
| source-map-js | `GHSA-68fv-2mgg-jv7q`, możliwość blokowania event loop | **1.2.2** | Brak advisory w aktualnym audycie |
| braces → micromatch/chokidar/fast-glob → Tailwind 3 | `GHSA-vfj7-8cjw-p6xm`; brak poprawionej opublikowanej wersji braces w sprawdzonym registry | Rzeczywista migracja do **tailwindcss 4.3.3** i **@tailwindcss/postcss 4.3.3**; stary łańcuch usunięty z lockfile | Brak tych pakietów i advisory w aktualnym lockfile |
| postcss-selector-parser → postcss-nested → Tailwind 3 | `GHSA-rj75-hqrm-r3gf`, CPU exhaustion przy parsowaniu selektorów | Usunięcie starego łańcucha kompilatora przez tę samą migrację | Brak tych pakietów i advisory w aktualnym lockfile |
| Scalanie klas | Stary adapter klas nie obejmował semantyki Tailwind 4 | **tailwind-merge 3.7.0**; React pozostał **19.3.0** | 9 zapisanych kombinacji daje identyczny wynik |

Nie obniżono progów CI i nie wyciszono advisories. Nie zastosowano override maskującego podatne pakiety. Usunięte z lockfile: `braces`, `micromatch`, `fast-glob`, `postcss-selector-parser`, `postcss-nested`.

## Weryfikacja zależności

| Polecenie | Kod wyjścia | Wynik |
| --- | --- | --- |
| `npm ci --ignore-scripts` | 0 | Czyste odtworzenie zależności zgodnie z CI |
| `npm audit --audit-level=low --json` | 0 | Wszystkie zależności: 0 info, low, moderate, high, critical |
| `npm audit --omit=dev --audit-level=low --json` | 0 | Produkcyjny graf: 0 advisories na każdym poziomie |

Dokładne raporty npm, SHA-256 lockfile, konfiguracji, logów i fixture są w pliku dowodowym. Pomiar dotyczy stanu z czasu uruchomienia poleceń. Registry może później opublikować nowe advisories; audyt trzeba powtarzać w CI.

`--ignore-scripts` nie generuje klienta Prisma. Późniejszy etap `npm run build` wykonuje `prisma generate`; testowanie pomiędzy `npm ci` a tym etapem może dać brak `.prisma/client/default`, co nie stanowi dowodu usterki aplikacji.

## Zachowanie wyglądu podczas migracji

Zachowano wcześniejsze deklaratywne kolory, skale fontów, odstępów, promieni, cieni, blur i ring oraz dotychczasowy reset CSS. Reset zawiera jego licencję MIT. Wykorzystywany jest rzeczywisty plugin Tailwind 4; kod dawnego kompilatora nie jest ładowany.

Ograniczony [tailwind-compat.config.cjs](../../../tailwind-compat.config.cjs) koryguje zmiany wykazane przez porównanie starego i nowego CSS:

- `space-y-*`: wcześniejszy wybór kolejnych elementów `:not([hidden]) ~ :not([hidden])` oraz fizyczne margin-top/bottom.
- `outline-none`: dotychczasowy przezroczysty outline 2 px z offsetem 2 px.
- Istniejące `bg-gradient-to-*`: wcześniejsza interpolacja sRGB. Trzy nowe rejestracje typowanych kolorów gradientu powodowały mierzalną kwantyzację 1/255; dla obecnych gradientów przywrócono zwykłe zmienne CSS. Jeśli pojawią się jawnie nowe `bg-linear-*`, ten fragment pozostawia ich rejestracje v4.
- Globalny reduced-motion: osobne `translate`, `rotate` i `scale` są resetowane razem z `transform`. Produkcyjny optimizer scalał te deklaracje, przez co osobny translate nadal działał; pass odtwarza wyłącznie istniejącą globalną regułę `.001ms` po optymalizacji.

Aplikacja i helper QA używają tej samej kolejności: Tailwind 4 → compatibility pass → autoprefixer. Zmieniono wyłącznie adapter kompilacji helpera `ui-primitives-regression.mjs`; jego scenariusze i asercje pozostają niezmienione.

Rzeczywiste porównanie **production-optimized CSS** objęło **24 fixture × 8 profili = 192 porównania** w **Chromium 153.0.8010.12**: szerokości 320/1024 px, light/dark i motion/reduced-motion. **0 zmienionych pikseli oraz 0 różnic geometrii** w tym zakresie. Zachowano surowe różnice serializacji computed CSS: np. rgba/oklab, dodatkowe przezroczyste składowe box-shadow oraz osobny translate zamiast macierzy transform. Nie opisujemy ich jako identycznych tekstowo computed styles.

To porównanie izolowanego CSS i synthetic HTML. Nie stanowi dowodu przejścia każdej podstrony, interakcji ani każdej przeglądarki aplikacji. Zmierzonych rozmiarów starego nieoptymalizowanego CSS i nowego zoptymalizowanego CSS nie przedstawiamy jako porównywalnego zysku transferu; finalne zasoby wymagają pomiaru z rzeczywistego builda.

**Minimalne wersje przeglądarek dla Tailwind 4: Safari 16.4, Chrome 111, Firefox 128.** Obsługi starszych silników nie potwierdzono. Chromium fixture nie zastępuje testów Safari/WebKit i Firefox.

## Nowy build oraz otwarte bramki QA

Root potwierdził ukończenie nowego builda candidate1. Pierwsza próba zatrzymała się na `EROFS` katalogu cache Prisma w środowisku; powtórka z poprawioną lokalizacją cache ukończyła build. Oba logi mają oddzielne SHA-256 w dowodach. Zaobserwowany BUILD_ID nowego kandydata: `QZm5xjoNRpOoWOMTL_PiO`.

| Bramka | Stan w chwili utworzenia tego dokumentu |
| --- | --- |
| Instalacja i pełny audyt zależności | PASS w opisanym zakresie |
| Izolowana kompatybilność CSS Chromium | PASS w 192 opisanych porównaniach |
| Budowanie candidate1 | PASS, potwierdzone przez root; ten agent nie uruchamiał builda |
| Pełna regresja aplikacji/API na nowym buildzie | **PENDING** — nie można przenieść wyników final7 na zmieniony stack |
| Nowy przebieg WebKit | **PENDING** — poprzedni CI WebKit nie przeszedł; wymagany świeży przebieg root |
| Docelowe opóźnienia i przepustowość przy 200 wykonawcach na nowym buildzie | **PENDING** — wynik wymaga oddzielnego pomiaru root |
| Rzeczywiste środowisko produkcyjne, integracje zewnętrzne i starsze przeglądarki | Nie zweryfikowano w tym raporcie |

## Kontekst wcześniejszego baseline 200

Historyczny baseline z `artifacts/performance/load200-baseline.json` dotyczy wcześniejszego builda `EtIKJoZ6X52nNorRlxheE`, rewizji `f9e1e106d7e61e21cefaa0487e116315fab2348e`, ukończonego 2026-10-09 o 21:08:15 UTC. To nie wynik obecnego kandydata.

| Równoległe wykonawcy | Żądania | Błędy | Żądania/s | p95 pełnego czasu odpowiedzi |
| --- | ---: | ---: | ---: | ---: |
| 20 | 1463 | 0 | 96,17 | 488,18 ms |
| 50 | 1424 | 0 | 93,05 | 1372,76 ms |
| 100 | 1386 | 0 | 88,36 | 2686,33 ms |
| 200 | 1473 | 0 | 90,46 | **5333,37 ms** |

Przy 200 wykonawcach wcześniejszy baseline nie spełniał celu odpowiedzi poniżej 1 s. Zero błędów HTTP i integralność danych nie oznaczają spełnienia celu czasu odpowiedzi.

Model był zamknięty, bez think-time: wykonawca wysyła kolejne żądanie po ukończeniu poprzedniego. Baza i aplikacja działały na tym samym hostcie, bez CDN, internetowego RTT i cold start serverless; zewnętrzne providery były blokowane. Seed: 1000 syntetycznych kont × 30 początkowych faktur, rozgrzane PDF. Baseline potwierdził 622 odpowiedzi create = 622 zapisane dokumenty = 622 claims numeracji. Nie jest to dowód obsługi 1000 równoczesnych rzeczywistych użytkowników ani produkcyjnego SLA o stałym napływie żądań.
