# Dashboard, terminarz i nawigacja — dopracowanie UI, 13 października 2026

Baza zmian: `2d4bba5ef2f920c5090314e5550b2d4c8ad3044a`. Zakres obejmuje warstwę prezentacji i obsługę klawiaturą; obliczenia kwot, terminy podatkowe, zapis faktur i integracja KSeF pozostają poza zakresem zmian.

## Poprawki

- Wspólny `Card` i panele dashboardu korzystają z jednej powierzchni: neutralna krawędź, wewnętrzny refleks oraz miękki cień. Oznaczone karty finansowe dodatkowo mają cienki gradient obramowania. Dekoracja nie przechwytuje kliknięć i nie wymaga przycinania zawartości ani menu.
- Warianty finansowe skupiają delikatną poświatę przy ikonie: zieleń wpływów, róż wydatków, fiolet bilansu i niebieski urzędów. Zamiast jaskrawych kwot wprowadzono semantyczne kolory dopasowane oddzielnie do jasnego i ciemnego motywu. Ostrzeżenia o terminie mają czytelny odcień bursztynu.
- Naprawiono brakujące odstępy i cienie. Terminarz używa rzeczywistego paddingu 20–24 px; konfiguracja udostępnia także używane w innych widokach `4.5`, `shadow-2xs`, `shadow-xs` i `shadow-apple-*`.
- Ujednolicono nagłówki stron, odstępy powłoki aplikacji, przejścia przycisków i widoczny fokus w nawigacji. Liczby mają cyfry o stałej szerokości; opisy i etykiety finansowe mają 12–14 px. Długie nazwy podatków i dokumentów zawijają się.
- Terminarz przechodzi do czterech widgetów i układu kalendarz/szczegóły dopiero przy `xl`. To uwzględnia miejsce zajęte przez boczne menu. Na telefonie kontrolki i filtry zawijają się, a komórki dat zachowują dostępny wymiar zamiast wymuszać szerokość 44 px na każdej z siedmiu kolumn.
- Dashboard ma spójne panele spraw do załatwienia, przychodów, KSeF i ostatnich dokumentów oraz bezpośredni skrót do terminarza. Doprecyzowano hierarchię kwot, wierszy i statusu dostępności bramki.
- Hover widgetów rozjaśnia krawędź i unosi kartę o 2 px wyłącznie na urządzeniach z precyzyjnym wskaźnikiem i obsługą hover. Preferencja ograniczenia ruchu wyłącza przesunięcia.
- Filtry i daty ujawniają stan przez `aria-pressed`; daty mają pełne etykiety i obsługę strzałek, Home oraz End. Dolne akcje terminarza są pojedynczymi linkami, bez zagnieżdżonych przycisków i dodatkowych punktów fokusu.
- Wielkość kwot 20–26 px zależy od dostępnej szerokości karty. Duże kwoty zawijają się pomiędzy grupami cyfr, a jednostka `zł` pozostaje w całości. Zachowano klasę `bg-card` wspólnego komponentu, aby utrzymać zgodność jego istniejących konsumentów i audytu kontrastu.
- Po pełnym audycie WebKit przywrócono zwykłym kartom statyczne pozycjonowanie z wersji bazowej. Warstwa gradientowa i jej pozycjonowanie dotyczą wyłącznie oznaczonych kart finansowych, aby dekoracja nie zmieniała bloków odniesienia ukrytych elementów formularzy. Nie dodano globalnego przycinania strony ani menu.
- W górnej nawigacji strony głównej skrócono „Piaskownica Demo” do „Demo”, także w stopce. Etykiety KSeF, instrukcji i programu do faktur pozostają w jednej linii; linki mają wspólną wysokość 44 px, wyrównanie i widoczny fokus. Odstępy uwzględniają przyciski logowania, które są wyrównane do prawej. Pełne menu jest dostępne od 1120 px.
- „Bez logowania” jest tekstowym akcentem przy „Demo”, wyrównanym do linii bazowej. Usunięto tło i ramkę plakietki. Hover oraz fokus rozjaśniają tekst i dodają subtelne podkreślenie bez przesuwania elementów.

## Walidacja

- **69/69 kontroli UI zakończonych sukcesem**: rzeczywiste komponenty dashboardu, terminarza i wspólnej karty w Chromium, w izolowanym środowisku z danymi syntetycznymi. Obejmuje to 24 kombinacje dwóch widoków, dwóch motywów i szerokości 320, 390, 768, 1024, 1280 oraz 1440 px. Sprawdzono brak poziomego overflow, padding, obramowania, kontrast tekstów finansowych i statusów co najmniej 4,5:1, pełny tytuł terminu urzędowego oraz wyrenderowany wykres.
- Interakcje: nawigacja dat strzałkami/Home/End, filtry, miesiące, waluty, otwieranie dokumentów, status KSeF, unoszenie karty dokładnie o 2 px na desktopie, brak unoszenia na dotyku i przy ograniczeniu ruchu. **Brak błędów JavaScript i konsoli.**
- **Dwa dodatkowe przypadki dużych kwot zakończone sukcesem** przy 1280 px: `1 234 567,89 zł` oraz `999 999 999 999 999,90 zł`. Rzeczywiste formatery liczników zachowują całą walutę i mieszczą zawartość kart; ekstremalna kwota zajmuje dwie linie.
- Lokalny lint całego projektu zakończył się kodem 0; po końcowych poprawkach ponowny lint zmienionych komponentów również zakończył się kodem 0.
- Pełny CI migawki finansowej `d9f7265`: build, TypeScript, lint, **586 testów jednostkowych (7 + 579)**, integracje, pomiary regresji oraz audyt wszystkich widoków i interakcji w Chromium, WebKit i Firefox zakończyły się sukcesem. Kontrole bezpieczeństwa i oba podglądy Netlify także przeszły. Bieżący wynik pełnych kontroli gałęzi oraz podglądy Netlify są dostępne w [PR #40](https://github.com/svein31/faktura-tata-sierpienm/pull/40).
- Dodatkowa poprawka nawigacji: lokalny TypeScript i pełny lint przeszły; **80/80 wariantów układu** rzeczywistej strony Next.js w Chromium i WebKit, w obu motywach, dla użytkownika zalogowanego i anonimowego, przy szerokościach 320, 390, 640, 768, 1024, 1119, 1120, 1240, 1280 i 1440 px. Brak poziomego przepełnienia, zawijania widocznych etykiet menu i kolizji z przyciskami. Cztery kontrole hover/fokusu potwierdziły przezroczyste tło, podkreślenie bez przesunięcia i widoczny fokus klawiatury. Brak błędów JavaScript. Odpowiedź sesji podstawiono danymi syntetycznymi na lokalnym serwerze; pomiary nie korzystają z danych produkcyjnych.

[Dowody pomiarów UI](UI-FINANCE-POLISH.evidence.json) · [Przypadki dużych kwot](UI-FINANCE-POLISH.large-amounts.json)

Pomiary i poniższe zdjęcia pokazują rzeczywiste komponenty w izolowanej powłoce z danymi syntetycznymi. Nie są odczytem danych ani zdjęciem sesji produkcyjnej. Pełna powłoka aplikacji i wcześniejsze przepływy finansowe są dodatkowo objęte istniejącym CI.

[Terminarz — komputer](UI-CALENDAR-DESKTOP.png) · [Terminarz — telefon](UI-CALENDAR-MOBILE.png) · [Dashboard — komputer](UI-DASHBOARD-DESKTOP.png)

[Nawigacja — komputer](UI-LANDING-HEADER-DESKTOP.png) · [Nawigacja — telefon](UI-LANDING-HEADER-MOBILE.png)
