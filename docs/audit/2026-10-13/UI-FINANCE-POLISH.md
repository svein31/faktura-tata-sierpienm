# Dashboard i terminarz — dopracowanie UI, 13 października 2026

Baza zmian: `2d4bba5ef2f920c5090314e5550b2d4c8ad3044a`. Zakres obejmuje warstwę prezentacji i obsługę klawiaturą; obliczenia kwot, terminy podatkowe, zapis faktur i integracja KSeF pozostają poza zakresem zmian.

## Poprawki

- Wspólny `Card` i panele dashboardu korzystają z jednej powierzchni: neutralna krawędź, cienki gradient obramowania, wewnętrzny refleks oraz miękki cień. Dekoracja nie przechwytuje kliknięć i nie wymaga przycinania zawartości ani menu.
- Warianty finansowe skupiają delikatną poświatę przy ikonie: zieleń wpływów, róż wydatków, fiolet bilansu i niebieski urzędów. Zamiast jaskrawych kwot wprowadzono semantyczne kolory dopasowane oddzielnie do jasnego i ciemnego motywu. Ostrzeżenia o terminie mają czytelny odcień bursztynu.
- Naprawiono brakujące odstępy i cienie. Terminarz używa rzeczywistego paddingu 20–24 px; konfiguracja udostępnia także używane w innych widokach `4.5`, `shadow-2xs`, `shadow-xs` i `shadow-apple-*`.
- Ujednolicono nagłówki stron, odstępy powłoki aplikacji, przejścia przycisków i widoczny fokus w nawigacji. Liczby mają cyfry o stałej szerokości; opisy i etykiety finansowe mają 12–14 px. Długie nazwy podatków i dokumentów zawijają się.
- Terminarz przechodzi do czterech widgetów i układu kalendarz/szczegóły dopiero przy `xl`. To uwzględnia miejsce zajęte przez boczne menu. Na telefonie kontrolki i filtry zawijają się, a komórki dat zachowują dostępny wymiar zamiast wymuszać szerokość 44 px na każdej z siedmiu kolumn.
- Dashboard ma spójne panele spraw do załatwienia, przychodów, KSeF i ostatnich dokumentów oraz bezpośredni skrót do terminarza. Doprecyzowano hierarchię kwot, wierszy i statusu dostępności bramki.
- Hover widgetów rozjaśnia krawędź i unosi kartę o 2 px wyłącznie na urządzeniach z precyzyjnym wskaźnikiem i obsługą hover. Preferencja ograniczenia ruchu wyłącza przesunięcia.
- Filtry i daty ujawniają stan przez `aria-pressed`; daty mają pełne etykiety i obsługę strzałek, Home oraz End. Dolne akcje terminarza są pojedynczymi linkami, bez zagnieżdżonych przycisków i dodatkowych punktów fokusu.

## Walidacja

Wyniki kompilacji, analizy statycznej, regresji i pomiarów przeglądarkowych zostaną dopisane po zakończeniu uruchomionych kontroli. Pomiary UI używają rzeczywistych komponentów i syntetycznych danych w izolowanym środowisku; nie są odczytem danych produkcyjnych.
