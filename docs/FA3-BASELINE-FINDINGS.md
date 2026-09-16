# Zgodność istniejącego generatora FA(3)

Walidacja zwykłej faktury VAT z `buildFa3Xml` (PLN, jedna pozycja 23%, termin 14 dni, bez wpłaty) oficjalnym XSD wykazała błędy istniejące przed wdrożeniem nowych rodzajów dokumentów:

- `Podmiot2`: brak obowiązkowych znaczników `JST` i `GV`.
- `Adnotacje/P_PMarzy`: schemat wymaga elementu `PMarzy`.
- `Platnosc/DoZaplaty`: taki element nie występuje w schemacie FA(3).
- W tej samej sekcji kolejność powinna umieszczać `TerminPlatnosci` przed `FormaPlatnosci`, a `TerminOpis` wymaga struktury (`Ilosc`, `Jednostka`, `ZdarzeniePoczatkowe`), nie tekstu swobodnego.
- Dla wariantu `Zaplacono` schemat wymaga również `DataZaplaty`; nie wolno podstawiać daty wystawienia zamiast rzeczywistej daty.

Źródło: https://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd oraz jego oficjalne zależności. Walidator użyty do diagnozy: libxml2 poprzez `lxml.etree.XMLSchema`. Obecny `validateFa3Xml` jest kontrolą strukturalną/tekstową i nie wykrywa tych błędów.

Sekcja `Platnosc` pozostaje poza autoryzowanym zakresem zmian w płatnościach. Przed uznaniem eksportu za zgodny z całym XSD potrzebna jest osobna zgoda na minimalną korektę serializacji tej sekcji: usunięcie niedozwolonego elementu, prawidłowa kolejność i struktura danych oraz użycie rzeczywistej daty dla znacznika zapłaty. Nie wymaga to obsługi przelewów, operatora płatności ani modyfikowania rejestru wpłat. Nie należy deklarować pełnej zgodności KSeF na podstawie obecnych testów strukturalnych.
