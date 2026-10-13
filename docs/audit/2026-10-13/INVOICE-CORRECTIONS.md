# Korekty starszych faktur KSeF — 13 października 2026

Migawka sprawdzonych zmian przed publikacją, bazująca na `c4389e84a14a2c774e42f14bdb91f03756b02def`. Użytkownik zgłosił brak przycisku „Wystaw korektę” na starszej wersji. Zrzut nie ustala surowych pól jego faktury. Przycisk dodano wcześniej, 9 października; odczyt produkcji w tej sesji potwierdził już bazowy `c4389e8`. Dalsza analiza odtworzyła niezależny błąd zgodności starszych danych w obecnym kodzie.

| Element | Problem | Przyczyna | Poprawka | Status lokalny |
| --- | --- | --- | --- | --- |
| Widok przyjętej faktury KSeF | Brak przycisku korekty, jeśli dawne `status` nadal jest `draft` | Widoczność oparta na statusie szkicu, mimo utrwalonego numeru KSeF | Wspólny warunek rozpoznaje przyjęty oryginał na podstawie numeru zapisanego na fakturze | Przycisk i kliknięcie przeszły w trzech silnikach |
| Formularz korekty | Starsza przyjęta faktura była odrzucana jako szkic | Osobna, sprzeczna walidacja źródła po stronie UI | Formularz stosuje ten sam warunek kwalifikacji i sprawdza firmę oryginału | Wczytanie i zapis przeszły |
| API źródła korekty | `409` dla przyjętej faktury ze starymi polami `draft` | Odrzucenie surowych pól zamiast sprawdzenia dowodu przyjęcia lub znanego wydania | Ta sama kwalifikacja po odczycie uprawnionego rekordu; pobranie `issuedAt` dla istniejącej normalizacji | Unit i rzeczywiste preflight/POST przeszły |
| Referencja oryginału w XML | Numer zapisany tylko w dawnym `ksef.number` ginął | Resolver pobierał wyłącznie nowe scalar `ksefNumber` | Ścisły odczyt tekstowej referencji z rekordu: scalar ma pierwszeństwo, potem legacy JSON | Pobierane XML wskazują numer oryginału w KSeF |
| Granice dostępu i dokumentów | Korekta musi dotyczyć uprawnionego, właściwego oryginału | Różne warunki mogły pomijać dawny status anulowania | Anulowanie ma pierwszeństwo; szkice bez numeru, zakupy, proformy i rozliczenia zaliczek blokowane; zachowane kontrole firmy, uprawnień, dat, waluty i samej siebie | Testy pozytywne i negatywne przeszły |
| Integralność oryginału | Korekta musi być osobnym dokumentem | Ryzyko pozostawienia tożsamości poprzednio edytowanej faktury | Zachowany reset draftu i odrębny POST; regresja porównuje cały zapis oryginału | Oryginały niezmienione, nowe ID, PDF i XML działają |

Walidacja przed publikacją: build, TypeScript, lint oraz **586 testów jednostkowych (7 + 579)** zakończone kodem 0. **27 rzeczywistych scenariuszy przeglądarkowych (9 na silnik)** przeszło w Chromium, WebKit i Firefox na szerokości 390 px. Zawierają istniejącą zwykłą korektę i trzy dodatkowe warianty przyjęcia KSeF: bieżące pola, oba dawne statusy `draft`, oraz przyjęcie zapisane tylko w JSON.

Każda nowa korekta: widoczny przycisk → wczytanie oryginału → niezerowa różnica `-0.5` → preflight → jawne zatwierdzenie → osobny zapis → odświeżenie → pobrany XML FA(3) ze źródłowym numerem KSeF → PDF. Sprawdzono sumy netto `-50`, VAT `-11.50`, brutto `-61.50`, pełne dane źródła oraz ścisłą niezmienność całego surowego oryginału. Asercje błędów JavaScript i braku mutujących żądań KSeF przeszły.

Środowisko: produkcyjny build lokalny, izolowana baza MongoDB z 22 migracjami i dane syntetyczne. Wszystkie zewnętrzne połączenia serwera były blokowane. Znaczniki przyjęcia KSeF ustawiono wyłącznie w bazie testowej; nie jest to rzeczywista transmisja do MF. WebKit używał istniejącego silnika z bibliotekami testowymi w `/tmp`, bez zmiany systemu czy aplikacji. Procesy testów, Next i Mongo zostały zatrzymane, port zamknięty; aplikacja i build nie zmieniły się w czasie testów.

Źródła SHA-256: `6d5842ef22ab81d4895e690923ab56bcbd6125c1fbd3a0e8893df1097b6040ba`; build `WTmR6lbj3N9v733xg_xdj`. [Dowody lokalne](INVOICE-CORRECTIONS.evidence.json).

Niesprawdzone w tej migawce: surowe pola rzeczywistej faktury użytkownika, fizyczne Safari/iOS, wysyłka korekty do MF oraz przyszłe CI i wdrożenie nowego commitu. Dane produkcyjne nie zostały zmienione przez audyt.
