# Audyt funkcjonalny — 30 września 2026

## Zakres i dowody

Repozytorium: svein31/faktura-tata-sierpienm. PR: [#24](https://github.com/svein31/faktura-tata-sierpienm/pull/24).
Zinwentaryzowano 121 tras API / 175 metod i 60 plików stron. Lista tras jest w scripts/feature-route-inventory.json.

**Ostatni potwierdzony pełny przebieg:** [Verify application 36718744031](https://github.com/svein31/faktura-tata-sierpienm/actions/runs/36718744031), commit c04a4e68db23d22bc4b370de77b94d90e73d0fe0.
Build, TypeScript, ESLint, 7 testów requested-fixes, 133 testy jednostkowe, 370 kontroli HTTP bez niepowodzeń oraz 454 kontrole układu Chromium/WebKit bez wad ekranu.

Równoległy przebieg API 36718743968 miał jedno niepowodzenie: 15-sekundowy timeout starego endpointu pobierania KSeF. Analiza wykazała brak kontroli dostępu i fikcyjny XML/UPO jako fallback. Endpoint został następnie przepisany i pokryty dodatkowymi testami.

Commit 8d5ae6d7c101b92e2aa801fbf1d8b2bf9de123a1 przeszedł wszystkie trzy buildy Netlify. GitHub Actions dla tego commita kończyły się przed pierwszym krokiem, bez przydzielonego runnera i logów; retry również nie wystartował. To blokada środowiska, a nie potwierdzony wynik testów kodu.
Najnowsza korekta zaokrąglania cen i dodatkowe testy wymagają ponownego pełnego przebiegu. Przygotowano alternatywną weryfikację w preview Netlify wyłącznie tej gałęzi, z pominięciem produkcyjnych sekretów.

## Naprawione problemy

| Obszar | Błąd | Zachowanie po zmianie |
|---|---|---|
| KSeF XML/UPO | odczyt dokumentów bez logowania lub poza firmą; globalna sesja KSeF; wymyślony dokument przy błędzie | dostęp ograniczony do firm i canExport, tylko rzeczywiste XML/UPO, 409 dla niegotowego dokumentu, kontrolowany błąd MF |
| Identyfikatory API | błędny ObjectId powodował 500 | kontrolowany 400 przed zapytaniem |
| Koszty | ujemne/niespójne kwoty, nieprawidłowe daty i statusy | wspólna walidacja POST/PUT/PATCH, brak zapisu błędnych danych |
| Zlecenia | wartość zero zastępowana poprzednią; ujemny/ułamkowy czas; nieprawidłowe statusy | zachowanie zera, czas w pełnych minutach, kontrola statusów i CAS |
| Konwersja | zafakturowane zlecenie pokazywane jako zakończone | status billed i blokada zmian źródła |
| Formularze | błędy API ignorowane; możliwy wielokrotny zapis | widoczny komunikat, zachowanie formularza, blokada podwójnego zapisu |
| Usuwanie firmy | możliwe osierocenie kosztów, ofert, zleceń i innych danych | 409, jeśli istnieją dokumenty biznesowe |
| Portal płatności | niepoprawne daty i nieatomowy komentarz | walidacja daty i transakcja; deklaracja nie oznacza opłacenia |
| Historia e-mail | księgowa nie widziała historii współdzielonej faktury; surowe błędy bazy | dostęp członków firmy, odcięcie po odebraniu roli, bez szczegółów bazy |
| E-mail | nieescapowane dane użytkownika w HTML | escapowanie pól i zachowanie łamania wierszy |
| Webhook Stripe | żądanie bez podpisu zwracało 500 przy braku konfiguracji | 400 dla braku podpisu, 503 dla braku konfiguracji |
| Kwoty faktur | małe ilości zaokrąglane do zera, 1,005 do 1,00; brak limitów | sześć miejsc ilości, half-up ceny, limity pozycji i wartości |

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
| UI/RWD | nawigacja, drawer, wyszukiwanie, zmiana firmy, bank, formularz faktury; Chromium/WebKit, 454 kontrole układu |
| Publiczne strony | wszystkie URL z sitemap, strona główna, demo, pricing, pomoc, poradniki i narzędzia |

Nowe testy przeglądarkowe dodatkowo wykonują zapis i edycję produktu, zapis kosztu / zmianę płatności / CSV, zapis zlecenia / czas / konflikt zapisu / konwersję oraz zapis oferty.

## Odtworzenie

1. Node 22, npm ci --ignore-scripts.
2. python3 -m pip install lxml==6.0.2.
3. npx playwright install --with-deps chromium webkit.
4. RUN_ALL_MOBILE_CHECKS=1 RUN_WEBKIT_CHECKS=1 npm run verify.
5. Raport HTTP: artifacts/functional/http-audit.json. Logi: feature-audit-summary, feature-controls-summary, mobile-audit.

Integracja tworzy własną replikę MongoDB oraz lokalny SMTP. Nigdy nie korzysta z odziedziczonego DATABASE_URL. Alternatywa Netlify dodatkowo przekazuje procesom testowym tylko minimalne zmienne systemowe.

## Granice weryfikacji

Testy MF, Stripe, NBP/GUS/VIES i OCR sprawdzają logikę oraz kontrolowane odpowiedzi; nie potwierdzają wszystkich rzeczywistych produkcyjnych konfiguracji dostawców. Nie wysłano rzeczywistych dokumentów podatkowych ani przelewów i wiadomości do klientów. Bankowe pliki należy dodatkowo potwierdzić importem w docelowym banku; kontrola parserów nie oznacza przetestowania każdego wariantu plików każdego banku.

Brak niepowodzeń w zestawie testów nie jest gwarancją braku wszelkich przyszłych błędów. Publikacja wymaga ukończonej weryfikacji aktualnego commita. Status wdrożenia trzeba odczytać po scaleniu, a nie wnioskować z samego push.
