# Zgodność istniejącego generatora FA(3)

Walidacja zwykłej faktury VAT z `buildFa3Xml` (PLN, jedna pozycja 23%, termin 14 dni, bez wpłaty) oficjalnym XSD wykazała błędy istniejące przed wdrożeniem nowych rodzajów dokumentów:

- `Podmiot2`: brak obowiązkowych znaczników `JST` i `GV`.
- `Adnotacje/P_PMarzy`: schemat wymaga elementu `PMarzy`.
- `Platnosc/DoZaplaty`: taki element nie występuje w schemacie FA(3).
- W tej samej sekcji kolejność powinna umieszczać `TerminPlatnosci` przed `FormaPlatnosci`, a `TerminOpis` wymaga struktury (`Ilosc`, `Jednostka`, `ZdarzeniePoczatkowe`), nie tekstu swobodnego.
- Dla wariantu `Zaplacono` schemat wymaga również `DataZaplaty`; nie wolno podstawiać daty wystawienia zamiast rzeczywistej daty.

Źródło: https://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd oraz jego oficjalne zależności. Walidator użyty do diagnozy: libxml2 poprzez `lxml.etree.XMLSchema`. Obecny `validateFa3Xml` jest kontrolą strukturalną/tekstową i nie wykrywa tych błędów.

Sekcja `Platnosc` została objęta wyłącznie zatwierdzoną minimalną korektą serializacji: usunięto niedozwolony element, ustawiono prawidłową kolejność i użyto rzeczywistej daty zapłaty. Nie wymaga to obsługi przelewów, operatora płatności ani modyfikowania rejestru wpłat. Pełna zgodność KSeF nadal wymaga testu konkretnego dokumentu i środowiska MF.

## Zastosowana poprawka

`FA3-PROPOSED-FIX.patch` dokumentuje zakres zastosowanej zmiany. Kod obejmuje JST/GV dla zwykłego odbiorcy, PMarzy, poprawne oznaczenia oryginalnej faktury KSeF przy korekcie oraz minimalne poprawki serializacji Platnosc: usunięcie DoZaplaty i swobodnego TerminOpis, kolejność TerminPlatnosci/FormaPlatnosci, rzeczywistą datę zapłaty z istniejących wpłat. Nie edytuje wpłat, rachunków ani operatora płatności.

Kandydat sprawdzony poza kodem aplikacji przez lxml z oficjalnym FA(3) XSD: zwykła faktura, opłacona z rzeczywistą datą (Europe/Warsaw), korekta bez numeru KSeF i korekta z numerem KSeF — wszystkie 4 poprawne. Wariant opłacony bez daty zgłasza czytelny błąd; wymaga uzupełnienia faktycznej daty w istniejącym rejestrze, nie podstawia daty wystawienia. Ta zmiana zachowania wymaga uwzględnienia przy wdrożeniu. Pełny przegląd procedur szczególnych FA(3) pozostaje osobnym zakresem.
