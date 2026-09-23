# ── DEPLOY: cyber_Folks (hosting współdzielony + panel Node.js) ──────────────
# ARCHIWUM: ten przewodnik dotyczy starego wariantu SQLite. Bieżąca aplikacja używa MongoDB.
# Nie wykonuj opisanych niżej kroków SQLite ani skryptów kopiujących plik bazy.
# Aktualne wymagania i bramki przed uruchomieniem: docs/RELIABILITY.md i docs/RELEASE-CHECKLIST.md.
#
# Fakturo to aplikacja Next.js (Node.js) z trwałą bazą SQLite (Prisma).
# Poniżej kompletna instrukcja wdrożenia na cyber_Folks.
#
# Dodatkowe gotowe pliki są w katalogu głównym `cyberfolks/`:
# `.env.production.example`, `.htaccess.example`, `post-deploy.sh`
# oraz `backup-sqlite.sh`. Nie zastępują one istniejącej struktury aplikacji.

## 1. Przygotowanie środowiska (raz)

1. **Subdomena**: utwórz subdomenę w panelu cyber_Folks, np. `fakturo.twojadomena.pl`
   (A/AAAA rekordy i certyfikat SSL panel skonfiguruje automatycznie).
2. **Katalog aplikacji**: umieść projekt W OSOBNYM katalogu **poza** `public_html`,
   np. `~/apps/fakturo/`. Katalog `public_html` subdomeny pozostaje pusty (lub
   zawiera tylko `.htaccess` z reverse proxy — patrz niżej). Dzięki temu kod
   aplikacji nie jest publicznie serwowany przez Apache.
3. **Wersja Node**: w panelu Node.js wybierz wersję zgodną z projektem.
   Projekt wymaga **Node.js ≥ 18.18** (rekomendowane: 20.x LTS — sprawdź
   `engines`/`package.json`). Niekompatybilna wersja powoduje błędy przy
   `npm ci` / starcie.

## 2. Przesłanie plików i zależności

```bash
# lokalnie
scp -r ./fakturo-ksef user@ftp.twojadomena.pl:~/apps/fakturo/
# lub przez menedżer plików panelu (bez node_modules i .next)

# na serwerze (SSH / terminal panelu)
cd ~/apps/fakturo
npm ci                # instalacja dokładna wg package-lock.json
```

## 3. Konfiguracja środowiska (.env)

```bash
cp .env.example .env
nano .env
```

W `.env` ustaw co najmniej:

| Zmienna | Wartość / uwagi |
|---|---|
| `DATABASE_URL` | `file:./data/prod.db` (ścieżka względna → `prisma/data/prod.db`) |
| `KSEF_ENVIRONMENT` | `demo` (domyślnie) |
| `GUS_BIR_API_KEY` | puste (demo) |
| `KSEF_TOKEN` | **opcjonalnie, server-only** — produkcyjny token KSeF, nigdy nie ustawiany przez API |

> **SESSION_SECRET nie jest potrzebny**: sesje to losowe opaque tokeny (32 bajty),
> w bazie trzymamy tylko hash SHA-256 — patrz `src/lib/auth.ts`.

## 4. Baza danych (Prisma + SQLite)

```bash
npm run db:generate     # prisma generate
npm run db:push         # prisma db push — utworzy prisma/data/prod.db i tabele
```

- Katalog `prisma/data/` musi być **zapisywalny** dla użytkownika Node:
  ```bash
  chmod -R 775 ~/apps/fakturo/prisma/data
  chown -R <user>:<group> ~/apps/fakturo/prisma/data   # wg ustawień panelu
  ```
- **Backup**: regularnie kopiuj `prisma/data/prod.db` (np. cron:
  `cp prod.db backup-$(date +%F).db`). SQLite = jeden plik — backup to zwykłe
  skopiowanie pliku (bezpiecznie przy zatrzymanej aplikacji lub `sqlite3 .backup`).
- Alternatywnie (czysty serwer) zamiast `db:push` możesz użyć migracji:
  ```bash
  npm run db:migrate     # prisma migrate deploy (wymaga katalogu prisma/migrations)
  ```

## 5. Build

```bash
npm run build
```

Powstanie katalog `.next` (wymagany do startu). Build wykonuj na serwerze
(wersja Node musi zgadzać się z `package.json`).

## 6. Panel Node.js — konfiguracja aplikacji

1. W panelu cyber_Folks przejdź do **Node.js → Dodaj aplikację** (lub edytuj).
2. Wskaż katalog aplikacji: `~/apps/fakturo`.
3. **Application startup file**: `app.js` (dostarczony wrapper — uruchamia
   `next start` na `127.0.0.1:PORT`).
4. **Port**: panel przydziela port z zakresu **35100–35599** albo **54xxx**
   (dokładny zakres zależy od wersji panelu — sprawdź w dokumentacji cyber_Folks
   / widoku panelu). Zapamiętaj przydzielony port — będzie potrzebny do reverse proxy.
5. Zmienne środowiskowe: wklej zawartość `.env` w panelu (lub pozostaw plik `.env`
   w katalogu — Next.js sam go wczyta).
6. Zapisz / **Restart** aplikacji.

## 7. SSL/HTTPS i reverse proxy

- **Opcja A (rekomendowana)**: subdomena obsługiwana przez wbudowany reverse
  proxy panelu Node.js (jeśli panel oferuje „Reverse proxy / App domain mapping”) —
  wtedy nic więcej nie konfigurujesz; SSL przez Let’s Encrypt w panelu.
- **Opcja B (`.htaccess`)**: umieść w katalogu `public_html` subdomeny plik
  `.htaccess` (wzór: `deploy/cyberfolks/.htaccess.example`):
  ```bash
  cp cyberfolks/.htaccess.example ~/public_html/subdomena/.htaccess
  # i ZASTĄP __PANEL_PORT__ przydzielonym portem (np. 35100)
  ```
  Plik przekazuje ruch przez `mod_proxy` (`[P]`) do `127.0.0.1:PORT`.
- **SSL/HTTPS**: włącz certyfikat Let’s Encrypt dla subdomeny w panelu.
  Aplikacja wykrywa produkcję (`NODE_ENV=production`) i ustawia cookie sesji
  z flagą `Secure`.

## 8. Health check i restart

- Health: `GET https://subdomena/api/health` → `{ "ok": true, "db": "ok", ... }`
  (publiczny, bez logowania). Możesz podpiąć monitoring.
- Po każdej zmianie kodu:
  ```bash
  npm ci && npm run db:generate && npm run db:push && npm run build
  ```
  i **Restart** aplikacji w panelu Node.js.

## 9. Ograniczenia / uwagi produkcyjne

- **Powiadomienia przeglądarki**: działają tylko przy otwartej karcie aplikacji
  (polling co 20 s) i wymagają HTTPS. Powiadomienia przy zamkniętej aplikacji
  wymagają Web Push + VAPID (niezaimplementowane — patrz README).
- **Rate limiter auth** jest w pamięci procesu (wystarczający dla jednej instancji).
- **KSeF/GUS**: integracje działają w trybie demo; produkcja wymaga sekretów
  (patrz README → „Produkcyjne integracje").
- **SQLite**: dla jednego procesu/instancji; katalog `prisma/data` musi być
  zapisywalny i objęty backupem.
- Subdomena w DEPLOY.md jest placeholderem — **nie hardcodujemy domen**: w
  kodzie nie ma żadnej domeny; panel/subdomena konfigurowane są w panelu
  (w razie potrzeby zamień `twojadomena.pl` na własną).
