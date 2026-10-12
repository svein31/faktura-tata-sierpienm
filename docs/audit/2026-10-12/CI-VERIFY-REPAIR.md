# Naprawa kontroli CI — 12 października 2026

Migawka po lokalnej regresji, przed publikacją poprawki. Dwie nieudane kontrole dotyczą różnych problemów: przepełnienia kalkulatora w WebKit oraz produkcji bez potwierdzonego wdrożenia aktualnego kodu. Punktem wyjścia jest commit [`6b3b942`](https://github.com/svein31/faktura-tata-sierpienm/commit/6b3b942bb4e6ba16a4f41775acdb66f0f430f27b).

| Element | Problem | Przyczyna | Poprawka | Status tej migawki |
| --- | --- | --- | --- | --- |
| Kalkulator progu KSeF, WebKit, 320 px | Długa odpowiedź „Tak, w tym lub wcześniejszym miesiącu” rozszerza dokument do 342 px. | Mobilny grid miał niejawny tor i etykiety z `min-width: auto`. Minimalna szerokość tekstu zależna od fontu powiększała kolumnę. | Jawna pojedyncza kolumna `grid-cols-1`, `min-w-0` na gridzie, etykietach i polach; od `sm` pozostają trzy kolumny. Wspólna struktura kalkulatora VAT otrzymuje tę samą poprawkę. | Naprawione: 57 przepływów w Chromium, WebKit i Firefox przeszło; brak błędów `pageerror`. |
| Test kalkulatorów | Porównanie z `innerWidth` nie uwzględniało szerokości zajętej przez scrollbar; brakowało przypadku szerszego fontu. | Test nie pokrywał różnic metryk fontów między środowiskami. | Porównanie ze zmierzonym `documentElement.clientWidth`, kontrola kontenera wyniku i dodatkowy scenariusz dwóch rodzin fontów przy 320 px. Sprawdzane są również pełny `title`, rzeczywista wartość `select` i niezmieniony komunikat wyniku. | 19 przepływów na silnik przeszło, w tym oba fonty zastępcze przy 320 px. |
| Produkcyjny smoke test | Po 30 odczytach `/api/health` nadal zwracał nieznaną rewizję zamiast oczekiwanego `6b3b942…`. | Kontrola nie otrzymała potwierdzenia wdrożenia badanego commitu. Wyczerpanie limitu Netlify zgłosił użytkownik; nie zweryfikowano tego w panelu. | Po odnowieniu limitu wdrożyć najnowszy `main`, potwierdzić dokładną rewizję w health i ponowić smoke test. | Zablokowane do wdrożenia. Kontrola nie została osłabiona ani wyłączona. |

[Verify application: run 38207461238, job 114674011492](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/38207461238/job/114674011492) zakończył się błędem WebKit po około 17 minutach. Wcześniejsze build, typy, lint, **577 testów jednostkowych i integracja** przeszły w tym przebiegu. Nie oznacza to udanego całego CI ani wyniku dla nowej poprawki.

Izolowany pomiar A/B w rzeczywistym silniku WebKit odtworzył przyczynę: przy `DejaVu Sans` dokument miał **342 px** przy dostępnych **314 px**, a etykieta/przycisk **304,56 px** w gridzie szerokości **240 px**. Po ograniczeniu toru i minimalnej szerokości etykiet, bez zmiany fontu, dokument miał **314 px**, etykieta i przycisk **240 px**, bez `pageerror`. To dowód mechanizmu błędu, nie zastępstwo końcowej regresji poprawionego kodu.

[Production smoke: run 38207461258, job 114674011557](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/38207461258/job/114674011557) zakończył się błędem po około 10 minutach. Odczyt produkcji potwierdził działającą bazę, lecz nie rewizję wdrożenia; `/cennik` nadal zwracał przekierowanie `307` do logowania. Nie zmieniono limitu czasu ani warunku zgodności rewizji.

Nowy pełny CI, faktyczne wdrożenie Netlify oraz fizyczne Safari/iOS pozostają niezweryfikowane w tej migawce. Dwa wcześniejsze komunikaty konsoli o niepotwierdzonej przyczynie zachowano w [poprzednim raporcie](../2026-10-10/RELEASE-FINAL8.md); ta poprawka nie rozstrzyga ich przyczyny i nie stanowi deklaracji braku wszystkich błędów.

## Weryfikacja poprawki przed publikacją

Build, TypeScript i lint zakończyły się kodem 0. Produkcyjny build `hxc_SUSGo1QMLDJ7NAvPR` odpowiada źródłom SHA-256 `d9f4f5048d706fe2c05f710a635aa8d7d395439aecadce3ecc75501804d4161d`; skrypty testowe mają SHA-256 `f26c6a7f36c42b7cbb72f4007011d0e31ac0aab12a64bde5bdd3eba985c10675`.

Rzeczywiste testy UI przeszły w trzech silnikach: **19 × 3 = 57 przepływów** na szerokościach 320, 768 i 1280 px, bez `pageerror`. Pokryły VAT, zaokrąglenia, duże kwoty, walidację, klawiaturę, odświeżenie, powrót w historii i próg KSeF. Dodatkowa regresja wymusza szerszy font i sprawdza długą odpowiedź przy 320 px. Chromium i WebKit używały emulacji dotyku/mobile; Firefox zwykłego kontekstu z tymi samymi szerokościami. To silniki automatyzacji, nie fizyczne Safari/iOS.

Testy działały na izolowanej bazie z 22 migracjami i syntetycznymi danymi. Zasoby zatrzymano: właścicielski proces zakończył się kodem 0, wszystkie jego procesy i porty zostały sprawdzone jako zamknięte. Źródła i build pozostały niezmienione przez testy. [Dowody lokalne](CI-VERIFY-REPAIR.evidence.json) zawierają wyniki i skróty plików, bez danych sesji.

Zdalny pełny Verify będzie oceniony dla opublikowanego commitu. Ten dokument opisuje stan przed publikacją i nie przypisuje przyszłemu CI wyniku. Produkcyjny smoke pozostaje zależny od rzeczywistego wdrożenia przez Netlify.
