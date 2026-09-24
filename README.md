# FakturaProsto

Polska aplikacja do faktur, KSeF i organizacji pracy firmy. Stack: Next.js 15 (App Router), React 19, TypeScript, Prisma 6 i MongoDB. Interfejs obejmuje panel zalogowanego użytkownika, publiczne strony informacyjne, poradniki i narzędzia.

> Stan opisany na podstawie kodu gałęzi `main` z 24 września 2026 r. Funkcja obecna w repozytorium nie musi być skonfigurowana ani sprawdzona na produkcji. Nie traktuj samego schematu bazy jako dowodu, że działa odpowiednia integracja.

## Funkcje dostępne w aplikacji

| Obszar | Zakres w kodzie |
| --- | --- |
| Konto | Rejestracja, logowanie, odzyskanie hasła, zmiana e-maila i hasła, eksport danych i usunięcie konta, sesje i wylogowanie wszystkich urządzeń, opcjonalne 2FA TOTP z kodami odzyskiwania, zgody prawne i preferencje. |
| Firmy i zespół | Profile wielu firm i rachunki bankowe, przełączanie firmy, zaproszenia, role właściciela, księgowej, pracownika i osoby z dostępem tylko do odczytu oraz szczegółowe uprawnienia. |
| Pulpit | Krótkie podsumowanie przychodów, ostatnie dokumenty, zadania wymagające uwagi, stan KSeF i skróty do działań. |
| Sprzedaż | Faktury sprzedaży i zakupu, szkice, korekty, proformy, zaliczki i faktury końcowe; pozycje z różnymi stawkami VAT, statusy płatności, wpłaty, wyszukiwanie, filtry, zapisane widoki, paginacja i wybrane działania grupowe. Z widoku niezapłaconej faktury sprzedaży można skopiować dane do przelewu. |
| Powtarzalne rozliczenia | Harmonogramy faktur cyklicznych (tydzień, miesiąc, kwartał, rok) z pauzą/wznowieniem; automatyczne przypomnienia o terminie e-mailem po skonfigurowaniu poczty i harmonogramu. |
| PDF i wysyłka | Szablony PDF, zapisane wersje wystawionych dokumentów, historia pobrań/wersji i wysyłki faktury e-mailem z załącznikiem. |
| Klienci i katalog | Kontrahenci z notatkami, tagami, historią i saldami według firmy/waluty; produkty i usługi; import kontrahentów z CSV z mapowaniem kolumn i wykrywaniem duplikatów; sprawdzanie NIP/GUS, VAT i VIES w zależności od dostępności usług. |
| Oferty i zlecenia | Oferty z linkiem do akceptacji/odrzucenia przez klienta, zamiana ofert i zleceń na dokumenty, zlecenia, ewidencja czasu pracy. |
| Projekty i magazyn | Koszty i czas projektu, zestawienia rentowności, magazyny, stany, ruchy i dokumenty magazynowe, inwentaryzacja oraz podgląd niskich stanów. |
| Zakupy | Prywatna skrzynka dokumentów PDF/JPG/PNG, ręczne opracowanie, opcjonalny OCR z kontrolą przez człowieka, koszty i wydatki, komentarze i obieg akceptacji. |
| Finanse i księgowość | Terminarz płatności, import wyciągów bankowych CSV i dopasowanie wpłat, analityka, paczka dla księgowej, wspólne zadania, zamykanie okresów, eksport JPK. Automatyczne podłączenie konta bankowego nie wynika z samego istnienia modeli bankowych. |
| KSeF | Centrum KSeF 2.0, tworzenie FA(3), sesje, kolejka wysyłki, pobieranie statusów i UPO, import faktur zakupowych oraz ścieżka wystawienia offline z kodami QR weryfikacyjnymi. Demonstracyjny kod QR do płatności został usunięty. Działanie z rzeczywistym MF wymaga konfiguracji i testów na odpowiednim środowisku. |
| Integracje i pomoc | Odczytowe API z zakresami uprawnień, webhooki statusów KSeF, dziennik audytu, panel kondycji zadań, powiadomienia i centrum pomocy. |
| Strony publiczne | Opis programu, poradniki o fakturach, VAT i KSeF, kalkulatory, strony prawne, metadane SEO i mapa witryny. |
| Interfejs | Układ na telefon, motyw jasny/ciemny, wyszukiwanie poleceń, zapisane ustawienia przestrzeni pracy, powiadomienia w aplikacji oraz opcjonalny dźwięk i powiadomienia przeglądarki. |

### Free i Pro

Konto Free ma serwerowy limit **5 wystawionych faktur sprzedaży na miesiąc** liczony dla właściciela we wszystkich jego firmach; szkice i proformy nie zużywają limitu. W kodzie widnieją plany Pro **7 zł/miesiąc** i **59 zł/rok** z takim samym zakresem funkcji.

Kod `Checkout`, portalu klienta i webhooków Stripe jest dostępny. Działanie zakupów i cyklu subskrypcji na produkcji wymaga osobnego testu z rzeczywistą konfiguracją; sama obecność endpointów i pól modelu nie potwierdza takiego testu.

## Zabezpieczenia aplikacji i danych

| Warstwa | Mechanizmy potwierdzone w kodzie |
| --- | --- |
| Logowanie | Hasła są haszowane bcrypt (12 rund). Token sesji jest losowy, sprawdzany w bazie i ma termin ważności. Cookie jest `HttpOnly`, `SameSite=Lax` i otrzymuje `Secure` przy prawidłowym HTTPS/proxy. Dostępne są wylogowanie i unieważnienie sesji. **Token sesji jest aktualnie zapisany jawnie w bazie, nie jako hash.** |
| 2FA i reset | Sekret TOTP szyfrowany AES-256-GCM; jednorazowe haszowane kody odzyskiwania, limity błędnych prób i powiązanie sesji z aktywnym 2FA. Reset hasła używa hasha tokenu z datą ważności. 2FA wymaga trwałego `MFA_ENCRYPTION_KEY`. |
| Uprawnienia | Serwer weryfikuje bieżące członkostwo w firmie i szczegółowe uprawnienia do faktur, korekt, wpłat, eksportu, KSeF, rachunków i zespołu. Dane i operacje są ograniczane do właściciela/firmy; samo ukrycie elementu interfejsu nie przyznaje dostępu. |
| Walidacja | Endpointy walidują typy, długości i dane finansowe; logowanie/rejestracja/2FA/reset mają limity prób. Odpowiedzi JSON pomocnika API mają `Cache-Control: no-store`; nieoczekiwane błędy zwracają identyfikator incydentu zamiast surowych danych. Limitery oparte wyłącznie na pamięci procesu nie są globalne przy wielu instancjach. |
| Spójność księgowa | Zapis krytycznych operacji w transakcjach MongoDB, sprawdzanie wersji dokumentu, blokady zamkniętych okresów, unikalne indeksy i klucze idempotencji. Dziennik zmian maskuje sekrety. Wersje PDF mają własne zapisane dane i sumę SHA-256. |
| Automatyzacje | Trwałe zadania KSeF, OCR, webhooków i przypomnień; ochrona przed duplikatami, ponowienia i oznaczanie niepewnego wyniku KSeF do sprawdzenia zamiast ślepego powtórzenia. Wywołania harmonogramu wymagają osobnego sekretu. |
| Integracje | Nowe klucze odczytowego API są pokazywane raz, w bazie przechowywany jest hash; sprawdzane są zakresy, limit i aktualne uprawnienia. Sekrety webhooków statusowych są szyfrowane AES-256-GCM, wiadomości podpisywane HMAC. Dla tych webhooków wymagany jest publiczny HTTPS z ochroną przed prywatnymi adresami i przekierowaniami. |
| Dokumenty | Dostęp do prywatnych oryginałów po ponownej kontroli uprawnień; limit wielkości i hash pliku w obrębie firmy. OCR wymaga uruchomienia przez użytkownika i ręcznego zatwierdzenia danych. Portal publicznego dokumentu przekazuje ograniczone pola, a jego trasy mają `noindex` i `Referrer-Policy: no-referrer`. Service worker nie buforuje prywatnych plików i odpowiedzi API. |
| Backup | Skrypty archiwum MongoDB ze spójnym snapshotem, szyfrowaniem AES-256-GCM, kontrolą integralności i odtworzeniem do osobnej pustej bazy. Repo zawiera opcjonalne harmonogramy i kontrole świeżości kopii. Sam kod nie dowodzi, że backup, kopia poza serwerem i alerty są uruchomione. |

**Ważne ograniczenia:** nie ma podstaw, by deklarować szyfrowanie *wszystkich* sekretów w MongoDB. Schemat zawiera jawny `Session.sessionToken`, pola tokenów sesji KSeF i starsze pole `Webhook.secret`; dostęp do bazy, logów i kopii wymaga ścisłej kontroli. Middleware rozpoznaje cookie i kieruje na ekran logowania, ale właściwe sprawdzenie użytkownika oraz firmy wykonuje serwer. Nie deklarujemy globalnej ochrony CSRF, audytu bezpieczeństwa ani gotowości produkcyjnej tylko na podstawie kodu.

## MongoDB i modele danych

Prisma używa `provider = "mongodb"`. Aktualny [schemat](prisma/schema.prisma) ma poniższe kolekcje. Tabela obejmuje **wszystkie modele**, także struktury przewidziane na dalsze integracje; sama obecność modelu nie oznacza gotowego ekranu.

| Obszar | Modele Prisma |
| --- | --- |
| Konto, firmy, zgody | `User`, `Session`, `UserMfa`, `PasswordResetToken`, `LegalConsent`, `Subscription`, `CompanySettings`, `CompanyProfile`, `CompanyMember`, `CompanyBankAccount`, `TeamInvitation`, `Notification`, `NotificationPreference` |
| Sprzedaż, dokumenty, PDF | `Contractor`, `Product`, `Invoice`, `InvoiceSettlement`, `PaymentRecord`, `Offer`, `Order`, `RecurringOccurrence`, `DueReminderSetting`, `DueReminderDelivery`, `InvoiceEmailLog`, `PdfTemplateVersion`, `PdfTemplateSetting`, `InvoicePrintContext`, `InvoicePrintVersion` |
| Projekty, koszty, księgowość | `Project`, `ProjectEntry`, `ProjectSourceClaim`, `Expense`, `ExpenseScan`, `OcrJob`, `BankStatementImport`, `DocumentComment`, `WorkspaceCommand`, `CostReviewPolicy`, `CostReview`, `CostReviewEvent`, `AccountingWorkspace`, `AccountingPeriod`, `AccountingPeriodEvent`, `AuditLog` |
| KSeF i podatki | `KsefSettings`, `KsefSession`, `KsefIncomingImport`, `KsefQueueTask`, `TaxProfile`, `TaxSettlement`, `JpkExport`, `WhitelistCheck` |
| Magazyn | `Warehouse`, `StockItem`, `StockDocument`, `StockMovement`, `Stocktaking` |
| Integracje | `ApiKey`, `PublicApiKey`, `Webhook`, `StatusWebhook`, `WebhookDelivery`, `BankConnection`, `BankTransaction`, `EcommerceIntegration`, `EcommerceOrder` |

Unikalne indeksy chronią m.in. e-mail użytkownika, członkostwo firmy, numer NIP firmy na koncie, wystąpienia harmonogramu, identyfikatory zdarzeń/kolejki i wybrane numery dokumentów; indeksy firm, dat i statusów wspierają paginację. Kontrola uprawnień i spójności finansowej jest realizowana również w kodzie i transakcjach, nie wyłącznie przez schemat.

`BankConnection`, `BankTransaction`, `EcommerceIntegration`, `EcommerceOrder` i część starszych pól `ApiKey`/`Webhook` opisują również przyszłe lub odrębne integracje. Dostępny import CSV nie jest automatycznym połączeniem bankowym.

## Integracje i granice działania

- **KSeF:** FA(3), sesje, kolejka, status/UPO i przygotowanie offline wymagają danych firmy, uprawnień MF, właściwego środowiska i próby pełnego przepływu na MF test. Podpis offline wymaga osobno skonfigurowanego certyfikatu i klucza. Niepewnych wysyłek nie należy wysyłać ponownie bez uzgodnienia.
- **GUS, MF, VIES, NBP:** rzeczywiste wyniki zależą od kluczy, dostępności i aktualności usług; błąd pobierania nie potwierdza statusu kontrahenta.
- **E-mail i OCR:** wysyłka wymaga SMTP/Resend; automatyzacje wymagają crona; OCR.space działa dopiero po dostarczeniu klucza, a wynik podlega kontroli człowieka.
- **JPK:** JPK_FA(4) i **część ewidencyjna** JPK_V7M(3) tylko dla wspieranych przypadków. Plik VAT nie zawiera deklaracji, nie jest podpisywany ani składany do MF. Zakres i wymagane uzgodnienia z księgową: [docs/JPK.md](docs/JPK.md).
- **Płatności:** kod Stripe Checkout, portalu i webhooków jest obecny; potwierdź na wdrożeniu zakup, odnowienie, nieudaną płatność i anulowanie.

## Uruchomienie i testy

Wymagane: Node.js ≥20.19, MongoDB z obsługą transakcji (replica set) i `DATABASE_URL` poza repo. Historyczne instrukcje SQLite/JWT w starszych plikach nie dotyczą obecnego kodu; nie kopiuj przykładowych sekretów do produkcji.

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

Migracje MongoDB prowadzi [scripts/migrations/README.md](scripts/migrations/README.md). Sekrety dla włączanych modułów (`MFA_ENCRYPTION_KEY`, `WEBHOOK_ENCRYPTION_KEY`, `CRON_SECRET`, poczta, OCR, MF itd.) ustaw w menedżerze sekretów hostingu. Przed migracją produkcji wykonaj kopię i próbę odtworzenia.

| Komenda | Cel |
| --- | --- |
| `npm run build` | Generowanie Prisma Client i build Next.js |
| `npm run typecheck`, `npm run lint` | Sprawdzenie typów i jakości kodu |
| `npm test` | Testy regresji i modułów |
| `npm run test:integration` | HTTP z odizolowanym MongoDB |
| `npm run verify` | Build, typy, lint, testy i integracja |

## Dokumentacja

- [Wdrożone moduły](docs/IMPLEMENTATION.md), [przestrzeń dokumentów](docs/DOCUMENT-WORKSPACE.md), [OCR](docs/OCR-WORKFLOW.md), [wersje PDF](docs/PDF-VERSIONS.md).
- [Okresy księgowe](docs/ACCOUNTING-PERIODS.md), [magazyn](docs/WAREHOUSE-OVERVIEW.md), [rentowność](docs/PROJECT-PROFITABILITY.md), [JPK](docs/JPK.md).
- [API i webhooki](docs/INTEGRATIONS.md), [niezawodność i backup](docs/RELIABILITY.md), [checklista przed premierą](docs/RELEASE-CHECKLIST.md).
- [Porównanie z konkurencją i decyzje o funkcjach](docs/COMPETITOR-REVIEW.md).

Starsze dokumenty mogą opisywać dawny etap wdrożenia. W kwestii działania pierwszeństwo ma aktualny kod oraz rzeczywiście sprawdzona konfiguracja środowiska.
