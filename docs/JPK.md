# Eksport JPK

JPK_FA(4): wystawione faktury sprzedaży wybranej firmy/waluty według daty wystawienia. Kwoty w walucie dokumentu, VAT walutowy również PLN wg zapisanego kursu; korekty ze znakami wartości zapisanych pozycji. Proformy, szkice i anulowane dokumenty pomijane. Faktury zaliczkowe są ujmowane jako `ZAL` z sekcją `Zamowienie`, a dokumenty końcowe zachowują referencje `FakturaZaliczkowa` i pozycje rozliczenia. Adres podatnika uzupełniany jawnie, bez zgadywania podziału ulicy i numeru. Brak migracji.

JPK_VAT: część ewidencyjna JPK_V7M(3), od lutego 2026, bez deklaracji VAT. Plik przeznaczony do księgowości, NIE kompletny pierwotny JPK_V7M do złożenia. Okres według daty wystawienia; księgowość musi uzgodnić go z okresem obowiązku podatkowego i odliczenia. Dokument nie jest automatycznie podpisywany ani składany do MF.

Zakres podstawowy: transakcje krajowe z NIP, stawki 23/8/5/0/zw, brak szczególnych procedur/adnotacji. Eksport wymaga jawnego potwierdzenia tego zakresu; pozostałe przypadki blokowane. Zwolnienie w FA wymaga podstawy prawnej. Ewidencja VAT wymaga potwierdzenia braku GTU/procedur oraz pełnego odliczenia zakupów niestanowiących środków trwałych. Oznaczenie BFK/OFF/DI dla dokumentów bez numeru KSeF wybiera księgowość. Eksport nie zastępuje klasyfikacji podatkowej brakującej w istniejącym modelu aplikacji.

Kontrola dostępu: bieżące canExport wybranej firmy, trwały audit. Limit 10000 dokumentów, bez cichego ucinania. Sumy kontrolne, kod urzędu, wymagane dane i daty sprawdzane. Testy generowanych plików używają oficjalnych XSD (lxml). Kopie schematów w scripts/schemas/jpk usuwają wyłącznie dokumentację XML i komentarze, zachowując definicje walidacji i lokalne odwołania do zależności.

Źródła: https://www.gov.pl/attachment/aaa27be2-3663-46cd-bf53-f8925f0170b3 (JPK_FA4); https://crd.gov.pl/wzor/2025/12/19/14090/schemat.xsd (JPK_V7M3); https://www.podatki.gov.pl/aktualnosci/nowe-wzory-struktur-jpk_vat-dostepne-na-epuap .

Ręcznie: role export/viewer, izolacja firmy, XML z polskimi znakami, EUR/USD, korekta ujemna, różne stawki, pomijanie proform/szkiców, błędny NIP/kurs/numer KSeF, osoba fizyczna/niefizyczna. Uzgodnić sumy i klasyfikację z księgowością przed użyciem podatkowym.
