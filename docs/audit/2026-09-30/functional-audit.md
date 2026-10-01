# Audyt funkcjonalny — FakturaProsto

Aktualizacja: 1 października 2026 r.

## Zakres i dowody

Repozytorium: svein31/faktura-tata-sierpienm. Zmiany i aktualne wyniki CI: [PR #24](https://github.com/svein31/faktura-tata-sierpienm/pull/24).

Zinwentaryzowano 121 tras API / 175 metod i 60 plików stron. Lista tras: scripts/feature-route-inventory.json.

- **83c97c0**, [audyt API 36818690992](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/36818690992): build, TypeScript, lint, 146 testów jednostkowych oraz 395 kontroli HTTP bez niepowodzeń.
- **83c97c0**, [test UI 36818694701](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/36818694701): wszystkie siedem scenariuszy formularzy zaliczone bez błędów JavaScript. Audyt mobilny wykrył przepełnienie tablicy zleceń z dokumentem przy 320 px (strona rozszerzała się do 372 px) i utrudnione zamknięcie okna. Siatka, kolumny i akcje kart mają teraz ograniczoną szerokość oraz zawijanie.
- **1162c38**, [test przeglądarkowy 36818189512](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/36818189512): potwierdzone wystawienie szkicu z ilością 0,004, oba kalkulatory, zapis i edycja produktu, zapis kosztu, płatność oraz eksport CSV. Kolejny błąd dotyczył odczytu niezużytej odpowiedzi zapisu zlecenia.
- **c04a4e6**, [pełny wcześniejszy przebieg 36718744031](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/36718744031): 454 kontrole układu Chromium/WebKit bez wad ekranów. Ten historyczny wynik nie obejmuje późniejszych zmian aplikacji.
- Aktualny Verify wykonuje wszystkie scenariusze formularzy i pełny audyt mobilny. Dodatkowo zapis produktów, kosztów, zleceń, czasu i ofert działa w teście przy szerokości 390 px; sześć otwartych formularzy jest sprawdzanych pod kątem wychodzenia elementów poza ekran i zbyt małej czcionki pól. Wynik aktualnego commita należy odczytać z jego kontroli CI.

W testach odtworzono zatrzymanie Playwright przy odczycie body odpowiedzi POST kosztu i zlecenia, mimo HTTP 201 oraz zamknięcia formularza. Formularze odczytują teraz potwierdzony dokument i aktualizują listę bez natychmiastowego ponownego pobierania całego zbioru. Koszty, zlecenia i oferty zachowują dane przy odmowie API oraz ignorują spóźnione odpowiedzi po zmianie firmy. Zmiana firmy zamyka też okno logowania czasu.

Dane faktur testowych korzystają z bieżącej daty; zmiana miesiąca nie powoduje fałszywego błędu analityki. Testy kontraktu NBP korzystają lokalnie z PLN, a kursy walut obcych, daty publikacji i awarie dostawcy są sprawdzane na kontrolowanych odpowiedziach.

Netlify buduje aplikację standardowym npm run build. Tymczasowy skrypt audytu podglądu i diagnostyczne skróty testów zostały usunięte. Pełna weryfikacja działa w GitHub Actions na izolowanych MongoDB i SMTP. Sukces builda Netlify sam nie dowodzi zaliczenia scenariuszy biznesowych.

**Publikacja:** pełny Verify aktualnego kodu jest warunkiem scalenia. Bieżący status scalenia i wdrożenia jest dostępny w PR oraz kontrolach produkcyjnych; raport nie zastępuje monitorowania działającego serwisu.

## Naprawione problemy

| Obszar | Błąd | Zachowanie po zmianie |
|---|---|---|
| KSeF XML/UPO | odczyt dokumentów bez logowania lub poza firmą; globalna sesja KSeF; wymyślony dokument przy błędzie | dostęp ograniczony do firm i canExport, tylko rzeczywiste XML/UPO, 409 dla niegotowego dokumentu, kontrolowany błąd MF |
| Identyfikatory API | błędny ObjectId powodował 500 | kontrolowany 400 przed zapytaniem |
| Koszty | ujemne/niespójne kwoty, nieprawidłowe daty i statusy | wspólna walidacja POST/PUT/PATCH, brak zapisu błędnych danych |
| Zlecenia | wartość zero zastępowana poprzednią; ujemny/ułamkowy czas; nieprawidłowe statusy | zachowanie zera, czas w pełnych minutach, kontrola statusów i CAS |
| Konwersja | zafakturowane zlecenie pokazywane jako zakończone | status billed i blokada zmian źródła |
| Formularze | błędy API ignorowane, niezużyta odpowiedź zapisu, możliwy wielokrotny zapis i spóźnione zmiany firmy | potwierdzony dokument z API, widoczny komunikat, zachowanie formularza, blokada podwójnego zapisu i kontrola firmy |
| Usuwanie firmy | możliwe osierocenie kosztów, ofert, zleceń i innych danych | 409, jeśli istnieją dokumenty biznesowe |
| Portal płatności | niepoprawne daty i nieatomowy komentarz | walidacja daty i transakcja; deklaracja nie oznacza opłacenia |
| Historia e-mail | księgowa nie widziała historii współdzielonej faktury; surowe błędy bazy | dostęp członków firmy, odcięcie po odebraniu roli, bez szczegółów bazy |
| E-mail | nieescapowane dane użytkownika w HTML | escapowanie pól i zachowanie łamania wierszy |
| Wysyłanie e-mail | brak spójnej kontroli uprawnień i zmiana szkicu na wysłany przy wysyłce wiadomości | kontrola firmy i canIssueInvoices, zachowanie statusu szkicu, kontrola historii |
| VAT i oferty | UI akceptował oo, którego API odmawiało; rozbieżne zaokrąglenia ofert | spójny zestaw stawek oraz precyzja ilości/cen przed konwersją |
| Czas i daty | 31 minut odrzucane po konwersji na godziny; 30 lutego normalizowany do marca | tolerancja wyłącznie szumu obliczeń i walidacja rzeczywistego dnia kalendarza |
| Webhook Stripe | żądanie bez podpisu zwracało 500 przy braku konfiguracji | 400 dla braku podpisu, 503 dla braku konfiguracji |
| Kwoty faktur | małe ilości zaokrąglane do zera, 1,005 do 1,00; brak limitów | sześć miejsc ilości w API i kreatorze, half-up ceny, limity pozycji i wartości |

## Macierz funkcjonalna

Kontrola wszystkich metod bez zalogowania i wszystkich GET po zalogowaniu jest kontrolą granic HTTP; sama nie dowodzi poprawności wszystkich wariantów biznesowych. Poniższe scenariusze uzupełniają tę macierz.

| Moduł | Scenariusze |
|---|---|
| Konto | rejestracja, logowanie, wylogowanie, MFA/recovery, reset hasła, współdzielony limit prób, wygasła sesja |
| Firmy i zespół | wielofirmowość, izolacja, role i odebranie dostępu, blokada ostatniego właściciela, odmowa usuwania firmy z danymi |
| Faktury | CRUD, paginacja/wyszukiwanie, wystawianie i korekty, niezmienność dokumentu wysłanego, sumy VAT, fractional quantity, half-up, granice kwot |
| KSeF | FA(3), demo lifecycle, kolejka, pojedyncza wysyłka, wyścigi, niejednoznaczny wynik, archiwalne XML/UPO, izolacja eksportu |
| Koszty i OCR | import, deduplikacja, zatwierdzanie, niezmienność źródła, kolejka OCR, retry/lease/stary worker, ręczna korekta |
| Bank | CSV preview, match wpłat/wypłat, waluta, duplikaty, atomic rollback nadpłaty, paczki przelewów |
| Księgowość | zatwierdzanie/księgowanie/komentarze, braki dokumentów, przypisania, zamknięcie i uzasadnione ponowne otwarcie okresu |
| Eksport/PDF | ZIP dla biura, XLSX, XML/CSV, wersje PDF i hash, zachowanie danych sprzedawcy/nabywcy i szablonu |
| Magazyn | uprawnienia, przyjęcia/wydania/zwroty, MM, blokada rezerwacji, inwentaryzacja, współbieżność i rollback |
| Projekty | przypisanie dokumentów, czas, materiały, waluty bez sumowania różnych walut, blokada archiwum |
| Oferta → zlecenie → faktura | publiczna akceptacja, stale version, mieszane VAT, zakaz ponownej konwersji |
| E-mail/przypomnienia | lokalny SMTP, historia zespołu, escapowanie HTML, zdarzenia przypomnień i deduplikacja |
| Kalkulatory | netto/brutto VAT, niepoprawne dane, próg KSeF dokładnie 10 000 i przekroczenie o grosz, wcześniejsze przekroczenie |
| UI/RWD | nawigacja, drawer, wyszukiwanie, zmiana firmy, bank, formularz faktury, tablica zleceń z dokumentem; Chromium/WebKit, pełna macierz układu |
| Publiczne strony | wszystkie URL z sitemap, strona główna, demo, pricing, pomoc, poradniki i narzędzia |

Nowe testy przeglądarkowe dodatkowo wykonują zapis ułamkowej ilości z formularza faktury, zapis i edycję produktu, zapis kosztu / zmianę płatności / CSV, zapis zlecenia / czas / konflikt zapisu / konwersję oraz zapis oferty.

## Odtworzenie

1. Node 22, npm ci --ignore-scripts.
2. python3 -m pip install lxml==6.0.2.
3. npx playwright install --with-deps chromium webkit.
4. RUN_ALL_MOBILE_CHECKS=1 RUN_WEBKIT_CHECKS=1 npm run verify.
5. Raport HTTP: artifacts/functional/http-audit.json. Logi: feature-audit-summary, feature-controls-summary, mobile-audit.

Integracja tworzy własną replikę MongoDB oraz lokalny SMTP. Nigdy nie korzysta z odziedziczonego DATABASE_URL. Polecenie build Netlify nie uruchamia integracji.

## Granice weryfikacji

Testy MF, Stripe, NBP/GUS/VIES i OCR sprawdzają logikę oraz kontrolowane odpowiedzi; nie potwierdzają wszystkich rzeczywistych produkcyjnych konfiguracji dostawców. Nie wysłano rzeczywistych dokumentów podatkowych ani przelewów i wiadomości do klientów. Bankowe pliki należy dodatkowo potwierdzić importem w docelowym banku; kontrola parserów nie oznacza przetestowania każdego wariantu plików każdego banku.

Brak niepowodzeń w zestawie testów nie jest gwarancją braku wszelkich przyszłych błędów. Publikacja wymaga ukończonej weryfikacji aktualnego commita. Status wdrożenia trzeba odczytać po scaleniu, a nie wnioskować z samego push.
