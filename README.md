# FakturaProsto — wieloużytkownikowe faktury VAT + KSeF (SaaS)

Premium SaaS do polskich faktur VAT i Krajowego Systemu e-Faktur (KSeF).
Aplikacja full-stack (Next.js App Router + Prisma/SQLite) z prawdziwą
wieloużytkownikową izolacją danych, kontami e-mail, sesjami HTTP oraz
centrum powiadomień.

> Wersja 2.0 — migracja z wersji demo (lokalny store + seed) na backend
> Prisma/SQLite jako **jedyne źródło prawdy**. Integracje GUS i KSeF pozostają
> w jawnym **trybie demo** (bez prawdziwych sekretów).

---

## Funkcje

- **Konta i sesje** — rejestracja/logowanie premium UI, bcrypt (12 rund),
  opaque session tokens (hash SHA-256 w bazie), cookie `HttpOnly Secure
  SameSite=Lax`, wylogowanie usuwa sesję, prosty rate limiter endpointów auth,
  brak enumeracji użytkowników (ogólne komunikaty błędów).
- **Pełna izolacja danych** — wszystkie zasoby biznesowe mają `userId`;
  każda kwerenda i mutacja API filtruje po zalogowanym użytkowniku.
- **Backend jako źródło prawdy** — Zustand to wyłącznie cache UI (bez
  `persist`/localStorage i bez seedu). Bootstrap przez `GET /api/data`.
- **Faktury (FV/FZ)**, kontrahenci (walidacja NIP + suma kontrolna, lookup GUS
  demo), produkty/usługi, profil firmy, ustawienia KSeF (środowisko, cert,
  token-maska).
- **KSeF (demo)** — walidacja FA(2), generowanie XML, wysyłka symulowana
  zapisująca status na fakturze, przycisk **„Symuluj nową fakturę z KSeF”**
  (tworzy FZ + powiadomienie dla bieżącego użytkownika).
- **Powiadomienia** — dzwonek z licznikiem, dropdown, poll co 20 s, toast,
  powiadomienia przeglądarki (Notification API, po zgodzie), dźwięk Web Audio
  (bez plików), przełączniki browser/sound + przycisk testu, endpoint
  `/api/test/incoming`, service worker do kliknięć.
- **Onboarding** — nowe konto startuje puste: elegancki pusty dashboard z
  3 krokami konfiguracji (firma → KSeF → pierwsza faktura) i CTA.
- **Deploy cyber_Folks** — `app.js` (Application startup file), instrukcja
  `deploy/cyberfolks/DEPLOY.md`, wzór `.htaccess`.

## Architektura

```
src/
├── middleware.ts                 # brama edge: cookie sesji; publiczne tylko auth/health
├── app/
│   ├── (app)/                    # strony biznesowe (serwerowa weryfikacja sesji w layout)
│   │   ├── layout.tsx            #   getSessionUser() → redirect /login
│   │   ├── page.tsx              #   dashboard + onboarding/empty states
│   │   ├── invoices/…            #   lista, szczegóły, kreator (FZ/FV, KSeF demo)
│   │   ├── contractors|products|analytics|ksef/
│   ├── (auth)/                   # layout auth
│   ├── login/ register/          # publiczne strony logowania/rejestracji
│   └── api/
│       ├── auth/{register,login,logout,me}
│       ├── data                  # bootstrap całego stanu użytkownika
│       ├── company | ksef | ksef/send | ksef/simulate-purchase
│       ├── contractors[/id] | products[/id] | invoices[/id]
│       ├── notifications[/id] | notifications/preferences
│       ├── test/incoming | nip-lookup | health
├── lib/
│   ├── db.ts                     # singleton Prisma + tworzenie katalogu data/
│   ├── auth.ts                   # bcrypt, tokeny SHA-256, cookie, getSessionUser
│   ├── rate-limit.ts             # limiter in-memory dla auth
│   ├── api.ts | dto.ts           # pomocniki API + mapowanie Prisma→DTO
│   ├── store.ts                  # cache UI (Zustand bez persist) + helpers
│   └── sound.ts                  # dźwięk Web Audio
prisma/schema.prisma              # User, Session, CompanySettings, KsefSettings,
                                  # Contractor, Product, Invoice(JSON), Notification,
                                  # NotificationPreference
deploy/cyberfolks/                # pełna instrukcja + wzór .htaccess
cyberfolks/                       # kopiowalne pliki pomocnicze do deployu
scripts/                          # seed-demo.mjs (OPCJONALNY) + integration-test.mjs
```

### Przepływ danych

1. Użytkownik loguje się → backend tworzy sesję (losowy token; w bazie tylko
   hash SHA-256) i ustawia cookie `fakturo_session`.
2. Klient wywołuje `GET /api/data` → cały stan użytkownika trafia do store
   (cache UI). Każda mutacja (faktura, kontrahent, produkt, firma, KSeF,
   powiadomienia) idzie przez API i **odpowiedź backendu aktualizuje cache**.
3. `NotificationBell` polluje `GET /api/notifications` co 20 s — nowe
   nieprzeczytane → toast + (opcjonalnie) dźwięk i powiadomienie przeglądarki.

### Modele danych

`User`, `Session` (tokenHash, expiresAt), `CompanySettings`, `KsefSettings`
(tokenSet + tokenMask — **pełny token nigdy nie jest zwracany przez API**),
`Contractor` (address JSON), `Product`, `Invoice` (lines/ksef JSON — zachowanie
istniejących typów frontendu), `Notification`, `NotificationPreference`.

## Uruchomienie lokalne

```bash
npm install
cp .env.example .env          # DATABASE_URL=file:./data/prod.db (domyślne)
npm run db:generate           # prisma generate
npm run db:push               # tworzy prisma/data/prod.db + tabele
npm run dev                   # http://localhost:3000
```

- Rejestracja → pusty dashboard z onboardingiem.
- Opcjonalnie konto demo: `npm run seed:demo` (konto `demo@fakturo.app` /
  `demo1234` — wyłącznie demonstracyjne, nie jest częścią normalnego startu).

## Skrypty

| Skrypt | Opis |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / build / start (przez `app.js`) |
| `npm run typecheck` | TypeScript strict (`tsc --noEmit`) |
| `npm run db:generate` | generowanie klienta Prisma |
| `npm run db:push` | synchronizacja schematu z bazą (SQLite) — domyślny workflow |
| `npm run db:migrate` | `prisma migrate deploy` (alternatywnie, czysty serwer) |
| `npm run seed:demo` | opcjonalne konto demo (nigdy nie uruchamiane automatycznie) |
| `npm run test:integration` | test HTTP dwóch użytkowników + izolacja + notifications |

## Test integracyjny

`npm run test:integration` (wymaga `npm run build` — skrypt sam go wykona,
jeśli brak `.next`):

- tworzy **czystą** bazę testową (temp, usuwana po teście),
- uruchamia serwer i wykonuje scenariusze HTTP:
  - health publiczny; `/api/data` bez sesji → 401;
  - rejestracja **dwóch użytkowników**, duplikat e-mail → 409 (ogólny komunikat);
  - bootstrap nowego użytkownika = **puste tablice** (0 faktur/kontrahentów/produktów);
  - login + `/api/auth/me`; złe hasło → 401;
  - A tworzy kontrahenta i fakturę → **B nie widzi ich** (bootstrap, GET/PUT/DELETE → 404);
  - izolacja profilu firmy (B zapisuje, A pozostaje pusty);
  - symulacja FZ z KSeF → faktura + nieprzeczytane powiadomienie (per user),
    oznaczenie jako przeczytane;
  - `/api/ksef/send` bez sesji → 401; z sesją zapisuje status `ksef_sent`;
  - preferencje powiadomień; logout unieważnia sesję; `/api/test/incoming`.

## cyber_Folks (deploy)

Kompletna instrukcja: **[deploy/cyberfolks/DEPLOY.md](deploy/cyberfolks/DEPLOY.md)**.
Szybki pakiet plików do wdrożenia: **[cyberfolks/README.md](cyberfolks/README.md)**.
Najważniejsze:

- subdomena + osobny katalog **poza `public_html`** (np. `~/apps/fakturo`),
- panel Node.js: wersja Node ≥ 18.18 (zalecane 20 LTS), **Application startup
  file: `app.js`**, port z panelu (**35100–35599** albo **54xxx** wg dokumentacji
  panelu),
- `npm ci` → `cp .env.example .env` → `npm run db:generate` → `npm run db:push`
  → `npm run build` → Restart,
- SSL/HTTPS (Let’s Encrypt) + reverse proxy (wbudowany panelu albo
  `.htaccess.example` — zamień `__PANEL_PORT__`),
- health check: `GET /api/health`,
- backup SQLite: kopiuj `prisma/data/prod.db`.

Nie hardcodujemy domeny — w kodzie jest tylko placeholder
`SUBDOMAIN_PLACEHOLDER`/`__PANEL_PORT__` do podmiany w konfiguracji panelu.

## Bezpieczeństwo

- Hasła: bcryptjs, min. 12 rund, min. 8 znaków (walidacja po stronie serwera).
- Sesje: 32-bajtowe opaque tokeny, w bazie SHA-256, cookie `HttpOnly Secure
  SameSite=Lax Path=/`, 30 dni; logout usuwa sesję.
- **`SESSION_SECRET` nie jest potrzebny** — nie używamy podpisywanych cookie/JWT.
- Rate limit: auth 10 prób / 15 min / IP (in-memory; dla wielu instancji → Redis).
- Token KSeF: nigdy nie wychodzi z serwera (maska + flaga `tokenSet`).
  Produkcyjny token → zmienna środowiskowa `KSEF_TOKEN` (server-only).
- Walidacja body każdego endpointu; ownership check w każdej mutacji
  (obcy rekord = 404, brak wycieku informacji).
- Brak sekretów w repo (`.env` w `.gitignore`, baza SQLite w `.gitignore`).

## Ograniczenia (świadome)

1. **Powiadomienia przeglądarki**: działają przy **otwartej karcie aplikacji**
   (polling co 20 s) i wymagają **HTTPS**. Zgoda (`Notification.requestPermission`)
   uruchamiana wyłącznie z gestu użytkownika (przełącznik / przycisk test).
   Stan `denied`/`default` jest obsłużony z czytelnymi komunikatami.
   **Powiadomienia przy zamkniętej aplikacji wymagają Web Push + VAPID** —
   niezaimplementowane; dostarczony service worker obsługuje tylko kliknięcia.
2. **Dźwięk (Web Audio)**: polityka autoplay przeglądarek — kontekst audio
   odblokowywany jest przy pierwszym kliknięciu; jeśli użytkownik nie
   interagował ze stroną, dźwięk może nie zadziałać (świadome ograniczenie).
3. **KSeF/GUS**: wysyłka do KSeF i lookup GUS działają **wyłącznie w trybie
   demo** — bez certyfikatu p12, tokena MF i klucza GUS BIR. Produkcyjna
   wysyłka wymaga implementacji po stronie serwera (podpis XML, sesja MF,
   white-list VAT).
4. **SQLite**: jedna instancja/proces; katalog `prisma/data` musi być
   zapisywalny; backup = kopia pliku.
5. Rate limiter i cache sesji działają w pamięci procesu (jedna instancja).

## Licencja / status

Projekt demonstracyjny („demo”). Integracje zewnętrzne celowo nie zawierają
prawdziwych sekretów. Przed wdrożeniem produkcyjnym wymagany jest audyt
bezpieczeństwa i prawdziwe integracje (KSeF/GUS) — patrz wyżej.

---

## Instrukcja obsługi nowych funkcji

Poniższy przewodnik opisuje wdrożone zaawansowane moduły pracy wieloużytkownikowej, fakturowania międzynarodowego, integracji kursów walut NBP oraz trwałego dziennika audytu.

### 1. Zespół i uprawnienia (Wielodostęp w ramach firmy)

Aplikacja wspiera wspólną pracę wielu osób w ramach jednej firmy — każda osoba loguje się własnym, unikalnym kontem e-mail i hasłem.

#### Domyślne role systemowe:
1. **Właściciel (`owner`)**:
   - Pełna kontrola nad profilem firmy, rachunkami bankowymi, konfiguracją KSeF, finansami i zespołem.
   - Posiada wyłączne prawo do usuwania firmy oraz zapraszania nowych użytkowników z uprawnieniem administracyjnym.
   - **Ochrona ostatniego właściciela**: System bezwzględnie blokuje usunięcie lub degradację jedynego właściciela firmy.
2. **Księgowa / Biuro rachunkowe (`accountant`)**:
   - Wystawianie faktur sprzedaży i zakupów, faktury korygujące, rejestracja wpłat.
   - Generowanie paczek dla biura (ZIP, JPK_V7, CSV), przegląd historii audytu i podgląd statusów KSeF.
   - Brak możliwości usunięcia spółki lub edycji uprawnień właściciela.
3. **Pracownik / Sprzedawca (`employee`)**:
   - Wystawianie faktur sprzedaży i ofert handlowych, dostęp do bazy kontrahentów i produktów.
   - Brak dostępu do modułu finansów, wyciągów bankowych oraz konfiguracji tokenów KSeF.
4. **Podgląd / Audytor (`viewer`)**:
   - Dostęp w trybie tylko do odczytu (wgląd do wystawionych faktur, raportów i dziennika audytu).
   - Brak uprawnień do jakichkolwiek modyfikacji dokumentów i wpłat.

#### Procedura zapraszania i zarządzania:
- **Zaproszenie użytkownika**: Wejdź w `Ustawienia → Zespół i uprawnienia`. Wpisz adres e-mail współpracownika, wybierz rolę bazową i opcjonalnie dostosuj granularne uprawnienia (np. zezwól pracownikowi na wysyłkę do KSeF). Kliknij **„Wyślij zaproszenie”**.
- **Akceptacja zaproszenia**: Zaproszony użytkownik otrzymuje bezpieczny link z unikalnym tokenem (ważnym 7 dni). Jeśli posiada już konto w systemie — loguje się i natychmiast uzyskuje dostęp. Jeśli jest nowym użytkownikiem — rejestruje się bezpośrednio z poziomu ekranu zaproszenia (`/invite/[token]`).
- **Przełączanie firm (Company Switcher)**: Użytkownicy należący do wielu firm mogą błyskawicznie przełączać kontekst roboczy w prawym górnym rogu ekranu (Topbar). Każda firma posiada widoczną rolę użytkownika.
- **Natychmiastowe odcięcie dostępu**: Odebranie roli lub usunięcie członka z zespołu przez Właściciela działa natychmiastowo — każde żądanie API weryfikuje uprawnienia w bazie danych, uniemożliwiając wykonanie jakiejkolwiek nieautoryzowanej operacji w aktywnej sesji.

---

### 2. Faktury walutowe i kursy NBP (art. 31a ustawy o VAT)

System obsługuje wystawianie faktur w walutach obcych (EUR, USD, GBP, CHF, NOK, SEK, CAD) w pełnej zgodzie z polskimi przepisami podatkowymi.

#### Zasady działania silnika NBP:
- **Automatyczne stosowanie art. 31a ust. 1 i 2**:
  - Jeżeli data sprzedaży (powstania obowiązku podatkowego) przypada w tym samym dniu lub po dacie wystawienia: kurs przeliczeniowy pobierany jest z **ostatniego dnia roboczego poprzedzającego dzień wykonania usługi lub dostawy towaru** (art. 31a ust. 1).
  - Jeżeli fakturę wystawiono **przed** powstaniem obowiązku podatkowego: kurs pobierany jest z **ostatniego dnia roboczego poprzedzającego dzień wystawienia faktury** (art. 31a ust. 2).
- **Obsługa weekendów i świąt**: System automatycznie sprawdza kalendarz notowań NBP (Tabela A). W przypadku transakcji poniedziałkowej lub poświątecznej, algorytm cofa się o odpowiednią liczbę dni do ostatniego opublikowanego notowania (np. piątek).
- **Zakaz kursów fikcyjnych**: System nigdy nie wstawia fałszywego kursu 1.0 ani kursu z dnia bieżącego (notowania NBP publikowane są ok. godz. 11:45-12:15, zatem transakcje z danego dnia rozliczane są kursem z dnia poprzedniego).
- **Trwały zapis w bazie**: Na dokumencie utrwalane są: numer tabeli NBP, data notowania, zastosowany kurs oraz przeliczone kwoty:
  - `totalNetPln` (Wartość netto w PLN)
  - `totalVatPln` (Podatek VAT w PLN)
  - `totalGrossPln` (Wartość brutto w PLN)
- **Kurs własny podatnika**: W przypadku stosowania kursu umownego, bankowego lub celnego, zaznacz opcję „Własny kurs podatnika”. Wymagane jest wprowadzenie formalnego uzasadnienia biznesowego (zapisywanego na dokumencie).

---

### 3. Kontrahenci zagraniczni (VAT UE i TIN spoza UE)

System umożliwia rejestrowanie kontrahentów z całego świata bez konfliktów z polskim formatem NIP:

- **Identyfikator NIP (Polska)**: Obowiązuje 10-cyfrowa walidacja sumy kontrolnej wagowej oraz integracja z bazą REGON (GUS BIR 1.1).
- **Identyfikator VAT UE (Unia Europejska)**: Format dwuliterowego prefiksu kraju (np. `DE`, `FR`, `IT`, `ES`) oraz numeru VIES.
- **Identyfikator TIN / Tax ID (Kraje trzecie, np. Ghana, USA, Wielka Brytania)**:
  - Identyfikatory zagraniczne (np. `GH-102938475-X`, `US-EIN 12-3456789`) są zachowywane w całości wraz z literami i myślnikami.
  - Wyłączona jest polska walidacja modulo-11, co zapobiega odrzucaniu poprawnych zagranicznych numerów rejestracji podatkowej.
- **Stawki VAT dla zagranicy**:
  - Stawka **`oo` (odwrotne obciążenie / reverse charge)**: Dedykowana dla usług wewnątrzwspólnotowych (art. 28b / art. 100 ustawy o VAT). Na fakturze PDF generowana jest prawna klauzula w języku polskim i angielskim: *„Odwrotne obciążenie / Reverse charge — podatek VAT rozlicza nabywca”*.
  - Stawka **`0%` / `np`**: Dedykowana dla eksportu towarów i usług poza terytorium UE.
- **Zgodność z KSeF FA(3)**:
  - Podmiot unijny trafia do węzła `<Podmiot2><DaneIdentyfikacyjne><KodUE>DE</KodUE><NrVatUE>123456789</NrVatUE></DaneIdentyfikacyjne></Podmiot2>`.
  - Podmiot spoza UE trafia do węzła `<Podmiot2><DaneIdentyfikacyjne><KodKraju>GH</KodKraju><NrID>C0012345678</NrID></DaneIdentyfikacyjne></Podmiot2>`.
  - Podatek VAT w PLN dla transakcji walutowych trafia do węzłów `<P_14_xW>`.

---

### 4. Rachunki wielowalutowe i kody IBAN / SWIFT

Dla transakcji międzynarodowych kluczowa jest przejrzysta informacja o rachunku bankowym sprzedawcy:

- **Konfiguracja kont walutowych**: W `Ustawienia → Moje Firmy / NIP` (sekcja „Rachunki bankowe i konta walutowe”) możesz zdefiniować niezależne rachunki dla EUR, USD, GBP, PLN lub konta wielowalutowe.
- **Walidacja IBAN**: Każdy numer konta sprawdzany jest międzynarodowym algorytmem `MOD-97-10` (z obsługą dużych liczb BigInt).
- **Kod SWIFT / BIC**: Wymagany dla sprawnej realizacji płatności SEPA i SWIFT.
- **Inteligentny dobór konta**: Po wybraniu waluty dokumentu (np. EUR), kreator faktury automatycznie proponuje konto dedykowane dla tej waluty.
- **Bezpieczeństwo kodów QR**: Zgodnie z wytycznymi KIR i Związku Banków Polskich, standard kodu QR do przelewów dotyczy wyłącznie płatności krajowych w PLN. Dla faktur w walutach obcych generator kodu QR jest automatycznie dezaktywowany, aby zapobiec odrzuceniu przelewu przez bank klienta.

---

### 5. Dziennik audytu dokumentów (Audit Log) i ochrona współbieżności

Każdy dokument w systemie objęty jest trwałym rejestrem zdarzeń:

- **Niezmienność i transparentność**: W karcie faktury dostępna jest dedykowana zakładka **„Historia i audyt zmian (Audit Log)”**.
- **Identyfikacja wykonawcy**: Każdy wpis zawiera:
  - Dokładną tożsamość autora (imię, nazwisko, adres e-mail, rola w firmie).
  - Datę i godzinę wykonania operacji.
  - Typ akcji: wystawienie faktury, modyfikacja pozycji, zarejestrowanie wpłaty, wysyłka do KSeF, wysłanie e-mailem.
- **Szczegółowy Diff parametrów**: W przypadku edycji dokumentu system porównuje stan poprzedni i nowy (np. `termin płatności: 14 dni → 30 dni`, `kwota netto: 1 200,00 EUR → 1 500,00 EUR`).
- **Blokada edycji współbieżnej (Optimistic Concurrency Control)**: Każda faktura posiada pole `version`. Jeśli dwóch członków zespołu otworzy ten sam dokument do edycji, próba zapisu starszej wersji zostanie bezpiecznie zablokowana kodem błędu `CONCURRENCY_CONFLICT` z żądaniem odświeżenia strony.

---

### 6. Faktury dwujęzyczne (PL / EN) i wydruki PDF

- **Szablony dwujęzyczne**: W kreatorze faktury dostępna jest opcja języka dokumentu: `Polski (PL)`, `Angielski (EN)` oraz `Dwujęzyczny (PL/EN)`.
- **Prezentacja na wydruku**: Etykiety nagłówkowe, pozycje, stawki podatku, adnotacje NBP, dane rachunku bankowego (Beneficiary, IBAN, SWIFT/BIC) oraz podsumowanie podatku VAT w walucie i w PLN są czytelnie prezentowane w obu językach.
- **Dostępność plików**: Faktury można pobrać jako oficjalny PDF, ustrukturyzowany plik XML FA(3) do KSeF, plik HTML oraz format JSON.

---

### 7. Dokumentacja prawna, zarządzanie zgodami i ochrona danych (RODO / PKE)

Serwis posiada pełny, produkcyjny moduł prawny dopasowany do specyfiki SaaS fakturowego w Polsce:

- **5 oficjalnych dokumentów prawnych**:
  - `/regulamin` — Regulamin świadczenia usług drogą elektroniczną (zgodny z ustawą o świadczeniu usług drogą elektroniczną oraz prawem konsumenckim).
  - `/polityka-prywatnosci` — Polityka prywatności opisująca podstawy prawne przetwarzania (art. 6 ust. 1 lit. b, c, f RODO), okresy retencji, prawa użytkowników i brak zautomatyzowanego profilowania wywołującego skutki prawne.
  - `/polityka-cookies` — Polityka plików cookies z pełnym inwentarzem ciasteczek technicznych i analitycznych.
  - `/powierzenie-danych` — Umowa powierzenia przetwarzania danych osobowych (DPA, art. 28 RODO) dla danych kontrahentów i faktur przetwarzanych w imieniu Użytkownika.
  - `/podwykonawcy` — Rzeczywisty wykaz podwykonawców i podprocesorów (hosting CyberFolks / OVH, baza danych MongoDB Atlas, infrastruktura e-mail, bramka KSeF MF).
- **Zarządzanie zgodami na pliki cookies (CMP)**:
  - Baner cookies spełniający wymogi Prawa Komunikacji Elektronicznej (PKE / art. 173 PT): 3 równorzędne przyciski („Zaakceptuj wszystkie”, „Odrzuć opcjonalne”, „Dostosuj preferencje”).
  - Brak domyślnego ładowania skryptów analitycznych; możliwość zmiany preferencji w dowolnym momencie ze stopki, menu lub panelu ustawień.
- **Akceptacja regulaminu i wersjonowanie**:
  - Niezaznaczony domyślnie checkbox akceptacji regulaminu na stronach rejestracji (`/register`) i akceptacji zaproszenia do zespołu (`/invite/[token]`).
  - Opcjonalna, wyraźna zgoda na komunikację marketingową.
  - Trwały rejestr zgód w bazie danych (`LegalConsent`) ze znacznikiem czasu, zanonimizowanym adresem IP i wersją dokumentu.
  - Modal informacyjny wymuszający ponowną akceptację w przypadku aktualizacji wersji regulaminu (`TermsUpdateModal`).
- **Prawa użytkownika (art. 17 i 20 RODO)**:
  - **Panel prywatności** w `Ustawienia → Twoje konto → Prywatność i zgody`.
  - **Eksport danych RODO (art. 20)**: Generowanie ustrukturyzowanego pliku JSON z kompletem danych profilowych, powiązań firmowych, historii zgód i podsumowania dokumentów (`GET /api/user/export-data`).
  - **Prawo do usunięcia konta (art. 17)**: Dostępne w zakładce „Bezpieczeństwo konta”.

