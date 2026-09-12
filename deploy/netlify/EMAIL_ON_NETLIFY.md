# ── Konfiguracja wysyłki e-maili na Netlify (ta-fax.netlify.app) ───────────

Aplikacja **Fakturo** na platformie Netlify działa w architekturze **Serverless (AWS Lambda)** pod kontrolą wtyczki `@netlify/plugin-nextjs`.

W środowisku serverless:
1. **Lokalny plik `.env` nie istnieje na serwerze** — zmienne środowiskowe muszą być dodane w panelu administracyjnym Netlify.
2. **Standardowy port pocztowy 25 jest zablokowany** przez dostawców chmurowych (AWS / Netlify), aby uniemożliwić rozsyłanie spamu.
3. **Funkcje serverless mają limit czasu (timeout)** — operacja generowania PDF oraz wysyłki e-mail musi wykonać się szybko.

Poniżej znajdziesz dwie w 100% działające opcje konfiguracji.

---

## 🚀 Opcja 1 (Zdecydowanie zalecana na Netlify): Resend API

To **najprostsze, najszybsze i w 100% bezawaryjne** rozwiązanie dla Netlify.

### Dlaczego Resend na Netlify?
- Wysyła e-maile przez standardowy port HTTPS (443) za pomocą REST API (`POST https://api.resend.com/emails`).
- Czas wysyłki wynosi zaledwie **~150–250 ms** (brak opóźnień związanych z wolnym handshake SMTP).
- **Darmowy pakiet (Free Tier):** **3 000 e-maili miesięcznie** (100 dziennie) — w zupełności wystarcza do fakturowania.
- Perfekcyjna dostarczalność (wysoka reputacja IP, brak trafiania faktur do spamu).

### Krok po kroku:
1. Wejdź na [https://resend.com](https://resend.com) i załóż bezpłatne konto.
2. W menu **API Keys** kliknij **Create API Key**, nadaj nazwę (np. `fakturo-netlify`) i skopiuj wygenerowany klucz (zaczyna się od `re_...`).
3. *(Opcjonalnie, dla własnej domeny):* W menu **Domains** dodaj swoją domenę (np. `twojadomena.pl`) i wklej 3 wygenerowane rekordy DNS (DKIM, SPF) w panelu DNS CyberFolks / swojego rejestratora.
   *(Jeśli chcesz przetestować od razu bez podpinania domeny, Resend pozwala wysyłać z adresu testowego: `onboarding@resend.dev` na Twój adres e-mail).*
4. Przejdź do **panelu Netlify**:
   - Otwórz projekt (np. `ta-fax`).
   - Kliknij **Site configuration** → **Environment variables** → **Add a variable** (lub **Import from .env**).
   - Dodaj zmienne:

| Nazwa zmiennej | Przykładowa wartość | Uwagi |
|---|---|---|
| `RESEND_API_KEY` | `re_123456789abcdef...` | Twój klucz API z Resend |
| `EMAIL_FROM` | `Fakturo <faktury@twojadomena.pl>` | Lub `Fakturo <onboarding@resend.dev>` na testy |

5. **WAŻNE — przeładowanie zmiennych na Netlify:**
   W menu Netlify wejdź w zakładkę **Deploys** → kliknij przycisk **Trigger deploy** → wybierz **Deploy site**.
   *(Bez tego kroku funkcje serverless nie zobaczą nowo dodanych zmiennych!)*

---

## 📬 Opcja 2: Własna skrzynka pocztowa CyberFolks (SMTP)

Jeśli wolisz korzystać bezpośrednio ze skrzynki założonej w CyberFolks (np. `faktury@twojadomena.pl`):

### Wymagania techniczne na Netlify:
- **Port 465 (SSL)** — **wymagany na Netlify**. Nigdy nie używaj portu 25!
- Połączenie szyfrowane: `SMTP_SECURE=true`.

### Krok po kroku:
1. Zaloguj się do **cPanelu w CyberFolks**:
   - Przejdź do **Konta pocztowe** → utwórz skrzynkę, np. `faktury@twojadomena.pl`.
   - Sprawdź adres serwera pocztowego (zwykle `mail.twojadomena.pl` lub nazwa serwera CyberFolks, np. `s12.cyberfolks.pl`).
2. Przejdź do **panelu Netlify**:
   - Kliknij **Site configuration** → **Environment variables** → **Add a variable**.
   - Dodaj następujące zmienne:

| Nazwa zmiennej | Wartość | Opis |
|---|---|---|
| `SMTP_HOST` | `mail.twojadomena.pl` *(lub sXX.cyberfolks.pl)* | Serwer poczty wychodzącej CyberFolks |
| `SMTP_PORT` | `465` | Bezpieczny port SSL |
| `SMTP_SECURE` | `true` | Szyfrowanie SSL/TLS |
| `SMTP_USER` | `faktury@twojadomena.pl` | Pełny adres e-mail |
| `SMTP_PASS` | `TwojeTajneHasloDoSkrzynki` | Hasło do konta pocztowego |
| `EMAIL_FROM` | `Fakturo <faktury@twojadomena.pl>` | Nagłówek nadawcy wiadomości |

3. **WAŻNE — przeładowanie zmiennych na Netlify:**
   W menu Netlify wejdź w zakładkę **Deploys** → kliknij przycisk **Trigger deploy** → wybierz **Deploy site**.

---

## 🧪 Jak przetestować działanie?

1. Po wdrożeniu wejdź na swoją aplikację: `https://ta-fax.netlify.app`.
2. Otwórz listę faktur i kliknij ikonę koperty **„Wyślij e-mailem”** lub wejdź w szczegóły faktury i kliknij przycisk **„Wyślij e-mailem”**.
3. Sprawdź nagłówek okna:
   - Jeśli zmienne są aktywne, zobaczysz zieloną plakietkę:  
     `🟢 Serwer pocztowy aktywny (Resend / SMTP)` z adresem nadawcy.
   - Jeśli zmienne nie zostały jeszcze załadowane, zobaczysz żółte ostrzeżenie z instrukcją.
4. Wpisz swój adres e-mail, upewnij się, że załącznik PDF jest zaznaczony, i kliknij **„Wyślij fakturę e-mailem”**.
5. W ciągu kilkunastu sekund otrzymasz e-mail ze sformatowaną fakturą HTML, podsumowaniem kwot oraz plikiem PDF.
