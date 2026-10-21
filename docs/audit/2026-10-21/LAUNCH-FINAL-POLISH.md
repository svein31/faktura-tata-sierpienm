# Lista faktur, plakat i kontrola wydania

Data: 2026-10-21. Baza zmian: `e13251b`. Raport rozdziela poprawki kodu, diagnostykę oraz dowody z usług produkcyjnych.

## Zmiany

Na desktopowej liście faktur status płatności mógł znikać pod przyklejonymi akcjami. Płatność jest teraz ostatnią kolumną danych, bezpośrednio przed akcjami, i pozostaje przyklejona razem z nimi. Szerokość akcji jest przekazywana do CSS z tej samej stałej co szerokość kolumny. Wolną szerokość tabeli przejmuje elastyczna kolumna, dzięki czemu kolumny przyklejone nie rozsuwają się na większych ekranach. Dłuższe statusy płatności zawijają tekst we własnej komórce.

Domyślny układ pokazuje kontrahenta, termin płatności, kwotę, KSeF i płatność. Data wystawienia pozostaje pod numerem dokumentu; osobną kolumnę nadal można włączyć. Nie usuwamy zapisanych preferencji ani widoków. Domyślna tabela mieści się przy 1440 px, a zapisane rozbudowane zestawy zachowują czytelną płatność przy przewijaniu. Filtry mają osobny wiersz pod wyszukiwaniem i pełne etykiety.

Odtwarzacz otrzymał osobny, jasny plakat WebP 1600 × 900, 46 264 B, przedstawiający aktualny pulpit na odizolowanych danych demonstracyjnych. Nowa nazwa pliku omija pamięć starej miniatury. Film MP4 pozostaje wcześniejszym nagraniem, ładowanym dopiero po kliknięciu; zachowano sterowanie, napisy i transkrypcję. Skrypt `scripts/media/render-product-poster.mjs` pozwala odtworzyć plakat z aktualnego zrzutu syntetycznego konta.

Nie zmieniono autoryzacji, ról, izolacji firm, Stripe, transmisji KSeF, zapisów finansowych, podatków ani generatora PDF.

## GitHub Actions

- Kontrola wdrożenia czeka na dokładny SHA do 30 minut zamiast 10; timeout zadania wynosi 45 minut, aby po oczekiwaniu zostało miejsce na test przeglądarkowy. Poprzednie wdrożenie Netlify zajęło około 20 minut, więc wcześniejszy limit mógł zgłaszać fałszywą porażkę wdrożenia.
- `Verify application` można uruchomić ręcznie po naprawie konfiguracji konta, bez pustego commitu.
- Monitor dostępności zapisuje podsumowanie z datą, rewizją i wynikiem odczytu WWW/bazy. Podsumowanie jasno oddziela dostępność od kopii, odtworzeń, dostawców oraz ludzkiego odbioru alarmu.
- Oficjalny actionlint 1.7.12 sprawdził wszystkie workflowy bez błędów. Nie wyłączono żadnej kontroli.

Po informacji właściciela, że Actions działa, zlecono ponowne wykonanie weryfikacji i osobny świeży `workflow_dispatch` monitora. API przyjęło zlecenia, lecz monitor `39647757593` zakończył się `startup_failure`, z zerem zadań i bez nowych adnotacji. Próba odtworzenia `39649320616` również zakończyła się `startup_failure` przed startem. Ten stan nie jest udanym testem. Stara adnotacja wskazywała rozliczenia, ale przyczyny nowych nieudanych startów API nie ujawniło. Nie przypisujemy jej automatycznie nadal do rozliczeń. Właściciela poproszono o dokładny komunikat z nagłówka świeżego przebiegu.

## Hydratacja React — wynik diagnostyki

Zachowano pierwotne pojedyncze zgłoszenie React #418 z poprzedniego audytu. W bieżącej pracy wykonano:

- 25 nawigacji na osobnej kopii aplikacji w trybie deweloperskim, przy CPU ×4, szerokościach 390/768/1440 i zmianach motywu;
- 90 nawigacji na odizolowanej kopii pierwotnego produkcyjnego builda, przy CPU ×4, zmianach motywu/szerokości, skanach axe i zrzutach. Wyłącznie ta diagnostyczna kopia miała dodatkowy odczyt stosu komponentów w miejscu zgłaszania #418; warunek błędu i jego propagacja pozostały aktywne. Tego instrumentowania nie publikujemy.

Obie próby zakończyły się kodem 0 i bez błędów. **Przyczyna pierwotnego zdarzenia pozostaje niepotwierdzona. Nie oznaczamy go jako naprawionego.** Nie dodano filtrowania błędów, kolejnych `suppressHydrationWarning` ani wyłączenia SSR. Dalszy jednoznaczny wniosek wymaga ponownego zdarzenia ze stosem komponentów.

## Weryfikacja

- Build produkcyjny, TypeScript i ESLint: PASS.
- 704/704 testy jednostkowe i osobne 7/7 testów wymaganych poprawek: PASS, bez pominięć.
- Pełna integracja: kod procesu 0; 139 tras API, 197 metod, 448 kontroli HTTP bez failures; osobno 42 kontrole bezpieczeństwa, 57 workflow, 35 startu, 37 importu/księgowości i 15 scenariuszy przeglądarkowych. Obejmują rzeczywisty lokalny PDF i kontrolowany SMTP, nie prawdziwe usługi dostawców.
- Dedykowane przeglądarki Chromium i WebKit: po cztery grupy PASS, po cztery skany axe WCAG 2.2 AA bez wykrytych naruszeń. Obejmują pełne etykiety filtrów, domyślne kolumny, zachowanie daty, długi status częściowej płatności, zapisane zestawy kolumn, trzy położenia przewijania przy 800/1024/1280/1440/1920, jasny/ciemny motyw, telefon 390 px, dekodowanie plakatu i odtwarzanie po kliknięciu. Procesy kończą się kodem 0, bez `pageerror` i bez wywołań zewnętrznych dostawców.
- Granica 768 px w WebKit może korzystać z kart mobilnych, gdy klasyczny pasek przewijania pomniejsza viewport zapytań CSS. Macierz przewijanej tabeli zaczyna się od 800 px; układ kart jest sprawdzany osobno. Nie traktujemy prawidłowo ukrytej tabeli jako niedziałającej.
- Dodatkowa istniejąca regresja `invoice-power-only`: po dziewięć grup Chromium i WebKit, oba procesy z kodem 0, bez błędów strony ani wywołań dostawców. Sprawdzono zapisane widoki i preferencje firmy, zaznaczenia z różnymi walutami/korektą, podgląd przez granice stron, retry/odmowę dostępu, przyklejenie nagłówków i akcji oraz wszystkie kolumny ukryte/przywrócone i zablokowane localStorage.
- Pierwsze próby jednostkowe/integracji nie miały wskazanego lokalnego MongoDB, a pierwsza integracja przeglądarkowa wskazywała nieobecną wersję Chromium. Zachowano błędne logi, poprawiono konfigurację poleceń i powtórzono kontrole. Dedykowany test wykrył też rzeczywisty błąd położenia środkowej kolumny; poprawka umieszcza płatność bezpośrednio przed akcjami i przeszła pełną macierz. Nie usuwano asercji.

Wyniki pełnej integracji i kontroli opublikowanej rewizji są zapisywane w roboczych dowodach wydania. Nie należy utożsamiać lokalnych wyników z zielonym CI ani z testem prawdziwych dostawców.

## Nadal wymagane dowody produkcyjne

Szczegóły zawiera [PRODUCTION-ACCEPTANCE.md](PRODUCTION-ACCEPTANCE.md). Kopia zewnętrzna, rzeczywiste odtworzenie, odebrany alarm i pełny przebieg rzeczywistych integracji pozostają niezweryfikowane. Nie wystawiono fikcyjnych faktur do rzeczywistego MF ani nie wykonano rzeczywistej płatności.

Dowody robocze: `/workspace/artifacts/launch-fixes-20261021/`. Zrzuty końcowe i wyniki znajdują się w `chromium-complete/` i `webkit-complete/`; diagnostyka w `diagnosis/` i `race/`.
