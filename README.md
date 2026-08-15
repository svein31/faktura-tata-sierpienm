# Fakturo — wieloużytkownikowe faktury VAT + KSeF (SaaS)

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
