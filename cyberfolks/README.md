# Fakturo na cyber_Folks

Ten katalog zawiera pliki pomocnicze do wdrożenia aplikacji na hostingu
cyber_Folks z panelem Node.js. Nie jest to osobna kopia aplikacji — właściwy
kod, `app.js`, `package.json`, `prisma/` i `.next/` pozostają w głównym
katalogu projektu.

## Szybkie wdrożenie na subdomenie

1. W panelu cyber_Folks utwórz subdomenę, np. `faktury.twojadomena.pl`.
2. Utwórz aplikację Node.js dla tej subdomeny:
   - Node.js: 20 LTS (minimum 18.18),
   - katalog aplikacji: katalog projektu poza `public_html`,
   - plik startowy: `app.js`,
   - port: port przydzielony przez panel.
3. Skopiuj cały projekt do katalogu aplikacji. Nie zmieniaj jego struktury.
4. W katalogu głównym aplikacji uruchom:

   ```bash
   cp cyberfolks/.env.production.example .env
   npm ci
   npm run db:generate
   npm run db:push
   npm run build
   ```

5. W panelu ustaw zmienne z `.env` albo pozostaw plik `.env` w katalogu
   aplikacji. Włącz SSL/Let's Encrypt dla subdomeny.
6. Podepnij subdomenę do aplikacji Node.js w panelu i zrestartuj aplikację.
   To jest wariant zalecany — wtedy nie trzeba używać `.htaccess`.
7. Sprawdź:

   ```text
   https://TWOJA_SUBDOMENA/api/health
   ```

   Oczekiwana odpowiedź ma `ok: true`.

Jeżeli panel nie ma wbudowanego mapowania domeny do aplikacji Node.js (i w przeglądarce widnieje **Error 403 Stop!**):
1. Sprawdź przydzielony port w panelu Node.js (np. 35100).
2. Wykonaj skrypt generujący plik `.htaccess`:
   ```bash
   node cyberfolks/generate-htaccess.js PORT_Z_PANELU
   ```
3. Skopiuj wygenerowany plik `cyberfolks/.htaccess` do katalogu `public_html` (lub `public_html/faktura`) subdomeny na serwerze i zrestartuj aplikację w panelu.


## Aktualizacja

Po przesłaniu nowej wersji projektu uruchom w katalogu głównym:

```bash
./cyberfolks/post-deploy.sh
```

Skrypt nie zmienia domeny ani konfiguracji panelu. Przed aktualizacją bazy
możesz wykonać kopię:

```bash
./cyberfolks/backup-sqlite.sh
```

## Ważne

- Nie wpisuj prawdziwego tokena KSeF do repozytorium. `KSEF_TOKEN` ustaw
  wyłącznie w zmiennych środowiskowych panelu.
- Domyślna konfiguracja działa w trybie demo KSeF/GUS.
- Baza SQLite znajduje się w `prisma/data/prod.db`; katalog musi być
  zapisywalny przez użytkownika aplikacji i regularnie backupowany.
- Nie wpisuj konkretnej subdomeny do plików projektu. Domena i SSL są
  konfigurowane w panelu cyber_Folks.

Pełna instrukcja i opis wariantów reverse proxy znajdują się w:
`deploy/cyberfolks/DEPLOY.md`.