# Audyt i refaktoryzacja FakturaProsto — 30 września 2026

## Podstawa i zakres dowodów

Przejrzano historię main: 161 commitów od startu projektu do 09ff3a890f36e8f158af8c55a9ae9d4c9088c987 oraz różnicę dzisiejszego checkpointu 244edc5e1f58c7f4bc1211702f04ffcf46a02716. Zmiany rozwijają checkpoint na codex/saas-audit-20260930. Historia pokazuje migrację SQLite/Turso/PostgreSQL do Prisma/MongoDB, kilka iteracji autoryzacji, integrację KSeF, izolację firm, rozliczenia zaliczek, magazyn i późniejsze poprawki numeracji/rachunków. Obecną architekturą jest Next.js 15, React 19 i MongoDB; instrukcje starszych wdrożeń SQLite nie są aktualnym modelem produkcyjnym.

Historia commitów nie jest sama w sobie dowodem poprawności. Przegląd kodu i testy dotyczą funkcji opisanych poniżej. Nie wykonano niezależnego pomiaru produkcyjnych Core Web Vitals, testu każdego polskiego banku ani operacji na rzeczywistym środowisku MF. Istniejące dokumenty STATUS.md i FA3-BASELINE-FINDINGS.md opisują starsze stany.

## Nawigacja: osiem głównych pozycji

| Pozycja | Widoki |
| --- | --- |
| Pulpit | Podsumowanie, analityka, terminarz |
| Dokumenty | Faktury, proformy/zaliczki, oferty, cykliczne, przypomnienia, KSeF |
| Wydatki | Koszty, skrzynka/OCR, obieg, bank i rozliczenia |
| Kontrahenci | Katalog i historia współpracy |
| Magazyn i usługi | Produkty/usługi, magazyn |
| Projekty i czas | Zlecenia/czas, rentowność |
| Zespół i księgowość | Portal, zamknięcie/eksport, JPK, prognoza podatków, zespół, audyt |
| Ustawienia | Firmy/rachunki, wygląd, PDF, NBP, integracje, zdrowie systemu, konto, pomoc |

Księgowa widzi pięć grup ze skróconym zestawem widoków. Nawigacja UI nie zastępuje autoryzacji API. Tokeny i integracje wymagają osobnego nadania canManageIntegrations. Przełącznik firm zachowuje kontekst wybranej firmy, a odpowiedzi formularzy bankowych są ignorowane po zmianie firmy. Linki prawne i preferencje cookies są w Pomocy i stopce strony publicznej.

## Zaimplementowane zmiany

- Administrator i dział sprzedaży obok właściciela, pracownika, księgowej i podglądu; walidacja nadawania uprawnień, nieznane role odrzucane, transakcyjne zaproszenia i zmiany zespołu.
- Portal /accountant/portal: weryfikacja, uwagi, masowe akceptacje kosztów i oznaczanie zaksięgowania. Wersje dokumentów, aktualne członkostwo, blokady zamkniętego miesiąca oraz audyt dzielą transakcję. Dokument w obiegu kosztów wymaga decyzji w swoim obiegu.
- ZIP dokumentów: zestawienie CSV, PDF faktur, zapisany XML KSeF i UPO. Profile Optima/Rachmistrz/Symfonia/Enova wskazują cel paczki; CSV służy do mapowania kolumn. Nie jest to natywny, certyfikowany format producenta.
- CSV, MT940 i XML camt.053: operacje przychodzące/wychodzące, kierunek, daty, waluta, namespace i kwoty. Odrzucanie nieprawidłowych danych, DTD i nieobsługiwanych agregatów. IBAN wyciągu musi należeć do wybranej firmy.
- Dopasowanie po numerze dokumentu lub NIP z dokładnym saldem. Kwota i nazwa bez jednoznacznej identyfikacji nie wystarczają do automatycznego rozliczenia. Remisy pozostają nierozliczone. Saldo, płatność i audyt zapisywane atomowo; wydatek wymaga pełnej zapłaty, faktura może mieć częściową płatność.
- Import: podgląd nie zużywa klucza; hash pliku niezależny od nazwy, trwałe identyfikatory operacji i pomijanie nakładających się operacji. Dla wyciągów bez bankowego identyfikatora identyczne operacje mają numer wystąpienia; pełne rozróżnienie takich wierszy w nakładających się wyciągach wymaga identyfikatorów banku.
- Paczki kosztowe pain.001.001.03 XML, CSV i krajowy Elixir-O. Kwoty pobierane z serwera, walidacja IBAN, jedna waluta i limit 100 dokumentów. Eksport nie oznacza zapłaty. Przelewy podatkowe, MPP i korekty wymagają osobnego profilu bankowego i są wyłączone z automatycznej paczki.
- Motywy jasny/ciemny/system, własne tło per tryb i akcent, reagowanie na OS i synchronizacja kart. Generowane tokeny tekstu mają testy kontrastu minimum 4,5:1; nie jest to certyfikat WCAG całej aplikacji.
- Publiczny landing pozostaje statycznie renderowany. Interaktywny podgląd ma jawnie demonstracyjne dane; cennik korzysta ze wspólnej definicji planów. Zachowane metadane, canonical, OpenGraph, schema.org, robots i sitemap. Nie dodano fikcyjnych opinii klientów: publikacja social proof wymaga rzeczywistych wypowiedzi i zgody autorów.
- XLSX jako rzeczywisty OOXML; CSV z BOM, bezpiecznym cytowaniem i ochroną przed formułami. Osobne wartości w walucie dokumentu i PLN; kontrola canExport.
- Prognoza JDG (skala/liniowy/ryczałt), klasyczny CIT 9/19%, VAT i składki. Dane wybranej firmy, deduplikacja kosztów KSeF, jawne założenia, ręczne informacje o zaliczkach/składkach. Jest to scenariusz, nie deklaracja lub indywidualna kwalifikacja podatkowa.
- Przypomnienia e-mail i opcjonalne SMS przez Twilio: osobny klucz zdarzenia dla kanału, wyłączenie po zapłacie/cofnięciu dostępu, pojedyncza próba dostawcy, niepewny wynik wymaga sprawdzenia przed ponowieniem. SMS ma opłaty dostawcy; sent oznacza przyjęcie, nie doręczenie.
- Zapis/odczyt GTU, procedur i MPP; FA(3) poprawnie ustawia P_18A. Podstawa zwolnienia dla stawki zw jest wymagana przy wystawieniu i walidowana w XML. MPP i podstawa zwolnienia trafiają do archiwalnej migawki PDF.
- PDF używa dołączonych fontów Unicode z polskimi znakami. Zmieniono wersję layoutu, aby aktualny wydruk nie zwracał starszej, zapisanej wersji ASCII; wcześniejsze archiwalne wersje pozostają dostępne.

## Istniejące funkcje i praktyczne granice

| Obszar | Stan |
| --- | --- |
| OCR | Istniejące OCR.space, trwała kolejka, ręczna korekta źródła, hash i wykrywanie duplikatów. Klucz i zewnętrzny dostawca wymagają konfiguracji. Nie deklarujemy pełnej skuteczności AI na każdym skanie. |
| KSeF | Istniejący FA(3), szyfrowanie, sesje, kolejka/idempotencja, reconcile verify_needed, UPO i offline z certyfikatem. Testy XSD i integracje izolowane; rzeczywiste MF i certyfikaty wymagają testu wdrożeniowego. |
| NBP | Istniejąca walidacja pochodzenia kursu, właściwa data i autorytatywne kwoty PLN na serwerze. Przeliczenie w prognozie pomija dokumenty bez wartości PLN. |
| GUS/Biała Lista | Istniejące pobieranie BIR/MF i walidacja NIP. Dostępność i produkcyjny klucz GUS nie są potwierdzone samymi testami kodu. |
| JPK | Istniejący JPK_FA(4) i część ewidencyjna JPK_V7M(3) dla obsługiwanego podzbioru transakcji, ze sprawdzaniem XSD. Brak kompletnej deklaracji do złożenia; procedury specjalne są odrzucane. |
| Prognoza VAT | Koszty faktur przyjmują pełne odliczenie; procentowe ograniczenia wydatków są respektowane. Korekty okresów, import i procedury szczególne wymagają księgowości. |
| Banki | Implementacja standardów i testy reprezentatywnych danych, nie certyfikacja wszystkich wariantów mBank/PKO/ING/Santander/Alior/Millennium/Pekao/BNP. Konkretny bank może wymagać własnej wersji XML, kodowania lub pól. |

## Znalezione i naprawione błędy

1. Menu obejmowało kilkadziesiąt stale widocznych linków i dodatkowe linki prawne.
2. Niedokończony checkpoint miał odnośniki do nieistniejącego portalu księgowego i prognozy podatków.
3. Bank importował tylko dodatnie wpłaty; matching opierał się na właścicielu konta i nie uwzględniał waluty.
4. Numer faktury FV/1 mógł dopasować tytuł z FV/10; przy remisie wygrywał pierwszy dokument.
5. Import nie utrwalał wszystkich operacji i nie miał audytu powiązanego z zapisem płatności.
6. Eksport faktur omijał uprawnienie canExport, nie chronił wszystkich pól CSV i opisywał kwoty walutowe jako PLN.
7. Akceptacja faktur sprawdzała role przed transakcją; brakowało zapisu zdarzeń akceptacji w audycie.
8. Ogólny DTO zaproszeń serializował token. Teraz lista nie zawiera tokenów; link po utworzeniu dostępny wyłącznie zarządzającemu zaproszeniem.
9. Parser faktur pomijał GTU, procedury i MPP; XML zawsze zawierał P_18A=2.
10. Poprzedni PDF usuwał polskie znaki, a niezmieniona wersja renderowania mogła zwrócić zapisany PDF sprzed zmiany fontu.
11. Podgląd importu miał tylko PLN, znak plus dla wypłat oraz zbyt wąską tabelę. Obecnie używa waluty operacji i przewijania tabeli.
12. Testy ujawniły błędne wykrywanie CSV z nagłówkiem w jednym polu i obcięcie wielowierszowego opisu MT940. Oba przypadki mają regresje.

## Benchmark nawigacji

Wykorzystano wcześniejszy przegląd publicznych opisów w docs/COMPETITOR-REVIEW.md i wzorce organizacji produktów: Fakturownia (dokumenty/kontrahenci/produkty), IFIRMA i wFirma (sprzedaż/koszty/księgowość), Invoice Ninja (invoices/quotes/expenses/projects) i Stripe Dashboard (krótkie główne menu z kontekstem sekcji). Decyzja: konsolidacja dostępu do istniejących funkcji, oddzielny portal księgowy i kontekstowe zakładki, bez usuwania danych lub rzadziej używanych procesów.

Źródła referencyjne: https://fakturownia.pl/ , https://www.ifirma.pl/program-do-faktur/ , https://wfirma.pl/ , https://invoiceninja.com/ , https://docs.stripe.com/dashboard . W tej sesji nie wykonano nowego przeglądu zalogowanych interfejsów konkurencji ani testu ich aktualnych planów. Nie deklarujemy zgodności lub braku funkcji na podstawie samych nazw produktów.

## Weryfikacja i wydanie

Brama repozytorium: npm run verify = build, typecheck, lint, testy jednostkowe/XSD i integracja HTTP z izolowanym MongoDB oraz Playwright. Dodano regresje parserów bankowych, niejednoznacznych dopasowań, FX, paczek, CSV/XLSX/ZIP, ról portalu i cofnięcia dostępu, księgowania z kontrolą wersji, GTU/MPP, zwolnień oraz kontrastu motywów. Audyt mobilny obejmuje nowe strony portalu, prognozy i wyglądu.

Końcowy wynik CI i link do pull requestu należy odczytać w GitHub. Zielony CI nie potwierdza stanu bazy produkcyjnej, sekretów, dostawców ani wydajności z ruchem użytkowników.

Przed publikacją aplikacji: backup i standardowe sprawdzenie migracji według README/release checklist, build z nowym Prisma Client, konfiguracja Twilio tylko jeśli mają działać SMS oraz próbny import/eksport w konkretnym banku. Nie wysyłano wiadomości do rzeczywistych klientów i nie modyfikowano produkcyjnej bazy.
