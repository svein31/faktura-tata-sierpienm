# Kontynuacja audytu — 2 października 2026

Punktem odniesienia jest main `2179d7262c693a07eb991826a094802565efda7a`. Przejrzano sześć commitów po wcześniejszym `09ff3a8`: pakiet SaaS (#21), poprawki mobilne i usunięcie SMS (#22), audyt funkcjonalny (#24), SEO/GEO (#23), produkt/bezpieczeństwo/SEO (#25) oraz kontrolę produkcji. Raport pierwotnego zakresu: [audyt SaaS](2026-09-30-saas-audit.md); aktualne rozszerzenia: [produkt i bezpieczeństwo](../product-security-2026-10-02.md). Starsza odtworzona gałąź pozostaje checkpointem i nie jest przeznaczona do scalenia ponad nowszym main.

## Potwierdzony stan zastany

GitHub Actions dla `2179d72`: [Verify](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/37036529205), [Security](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/37036529386) i [kontrola produkcji](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/37036529266) zakończone powodzeniem. Log Verify: 7 testów wymaganych poprawek, 149 pozostałych testów jednostkowych, 42 dodatkowe kontrole HTTP produktu/bezpieczeństwa i 556 kontroli układu mobilnego Chromium/WebKit bez błędów. Są to wyniki SHA sprzed niniejszej poprawki.

Osiem sekcji, RBAC/portal księgowy, bankowość, motywy, landing, OCR, przypomnienia e-mail, prognozy, audyt i wiele firm są już na main. Późniejszy pakiet usunął SMS; ta kontynuacja zachowuje ten stan. Native ERP, kompletna deklaracja JPK_V7, certyfikacja wszystkich banków i rzeczywiste środowisko MF pozostają ograniczeniami wskazanymi w wcześniejszych raportach. Nie uruchamiano produkcyjnej migracji, nie zmieniano dokumentów klientów i nie wysyłano wiadomości.

## Poprawione przypadki brzegowe

- MT940 RC/RD oraz camt.053 RvslInd są rozpoznawane jako storno. Operacja pozostaje w historii bankowej z `matchSignals: ["reversal"]`; nie tworzy nowej płatności, zarówno przy imporcie, jak i ręcznym przypisaniu. Widok pokazuje wyjaśnienie. Pominięcie po sprawdzeniu pozostaje dostępne; cofnięcie wcześniejszej płatności wymaga osobnego rozliczenia.
- Numer FV/1 nie identyfikuje FV/1/2, FV/1-2, FV/1.2 ani FV/1_2. NIP nie jest dopasowywany jako fragment dłuższego ciągu cyfr.
- Podgląd nie dopasowuje nadpłaty ani częściowej wypłaty do wydatku, którego rejestr obsługuje pełną zapłatę. Faktury nadal mogą otrzymywać częściowe płatności.
- Eksport przelewów odrzuca ułamki grosza i nie zmienia przekazanego obiektu z danymi przelewu.
- XML camt.053 odrzuca zerową kwotę operacji.

Nie zmieniono schematu bazy. Flaga storna korzysta z istniejącego pola matchSignals. Starsze już zaimportowane storna nie są automatycznie reklasyfikowane ani odwracane: takiej historii nie można bezpiecznie zmienić bez wyciągów i kontroli księgowej.

## Weryfikacja poprawki

Dodano trzy testy jednostkowe i scenariusz HTTP: podgląd/import storna, brak płatności, pusta lista kandydatów, odrzucenie ręcznego przypisania i jawne pominięcie. Końcowe wyniki dotyczące nowego SHA znajdują się w PR i jego Verify; nie należy przypisywać mu wcześniejszych wyników tylko na podstawie wspólnego zakresu funkcji.
