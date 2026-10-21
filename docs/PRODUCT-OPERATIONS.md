# Zgłoszenia, diagnostyka i pierwsza faktura

## Zgłoszenia

Przycisk w nagłówku panelu, pomocy i ekranie błędu otwiera ten sam formularz. Zalogowany użytkownik zapisuje kategorię i opis (10–2000 znaków). Kontekst to nazwa sekcji, wersja wdrożenia i opcjonalny numer incydentu. Nie pobieramy zrzutów ekranu, dokumentów, URL ani parametrów. Własny tekst może zawierać dane osobowe — formularz prosi o niewpisywanie danych klientów i sekretów.

Zapis MongoDB jest wymagany do potwierdzenia sukcesu. Klucz użytkownik + UUID zapobiega ponownemu zapisowi przy ponowieniu identycznej próby. Wysłanie powiadomienia jest oddzielne od zapisu. Przyjęcie przez dostawcę nie dowodzi przeczytania ani doręczenia. Użytkownik może odczytać metadane swoich ostatnich 10 zgłoszeń przez `/api/support`; cudze zgłoszenia nie są dostępne.

Powiadomienia trafiają na prywatną skrzynkę wskazaną przez operatora. Można ją nadpisać `OPS_ALERT_EMAIL` / `SUPPORT_EMAIL` na serwerze. Dostawca to istniejący Resend lub SMTP. E-mail zawiera tylko numer i kategorię, bez treści zgłoszenia. Przerwane wysyłki po zajęciu zadania są po 15 minutach oznaczane do sprawdzenia. Wysyłka o niepewnym wyniku pozostaje `verify_needed` i nie jest automatycznie ponawiana. Należy sprawdzić ją u dostawcy.

Chroniony panel `/help/reports` jest dostępny wyłącznie dla zalogowanego, zweryfikowanego konta o adresie `SUPPORT_OPERATOR_EMAIL` (domyślnie skrzynka operatora wskazana do powiadomień). Role właściciela firm innych klientów nie dają tego dostępu. Opis pozostaje w aplikacji, nie trafia na prywatną skrzynkę. API odczytu panelu również sprawdza tę samą regułę i nie ujawnia identyfikatorów kont.

Alternatywny odczyt przez operatora (osobny użytkownik MongoDB z uprawnieniami tylko do odczytu, połączenie w menedżerze sekretów):

```sh
node scripts/ops/product-report.mjs
node scripts/ops/product-report.mjs NUMER-ZGLOSZENIA
```

Wymagane `PRODUCT_REPORT_DATABASE_URL`; skrypt celowo nie dziedziczy `DATABASE_URL`. Pierwsza komenda pokazuje metadane, druga prywatny opis. Nie umieszczaj wyniku drugiej w repozytorium ani publicznych logach. Dodatkowe rekordy mają TTL: zgłoszenia 90 dni, incydenty 30 dni, blokady powiadomień 7 dni. Odczyty filtrują wygasłe rekordy również przed sprzątaniem TTL.

## Błędy przeglądarki

Pierwsza krótka kolejka w pamięci przechwytuje błędy przed uruchomieniem efektów React, następnie przejmuje ją moduł diagnostyczny. Obsługiwane są `error`, `unhandledrejection` i granica błędu panelu. Nie tłumimy ani nie ukrywamy błędów. Wysyłane są wyłącznie dozwolone kategorie, skrót błędu, klasa ekranu, urządzenie, rodzina przeglądarki i rewizja. Bez treści błędu, stosu, URL, cookies diagnostycznych, e-maila i identyfikatora konta. Skrót nie pozwala odtworzyć stosu; do ustalenia przyczyny nadal mogą być potrzebne odtworzenie problemu i bezpieczne logi hostingu. Serwer zachowuje istniejący bezpieczny rejestr `application_error` w logach hosta. Instrumentacja Next instaluje ponadto odbiornik wyłącznie w środowisku Node: błędy serwera trafiają do tego samego rejestru diagnostycznego po odpowiedzi, jako kategoria `server`, z numerem incydentu, skrótem, wersją i opcjonalnym poprawnym kodem Prisma. Moduły walidacji używane w przeglądarce nie importują kodu serwera. Awaria odbiornika nie zmienia wyniku pierwotnego żądania. Kontrolowane przekierowania, odmowy/404 frameworka i znane konflikty Prisma nie uruchamiają nowego alarmu. Dotychczasowy rejestr hosta zachowuje swoją treść.

Limity: 10 wysyłek na dokument przeglądarki, deduplikacja przez minutę, 15 żądań/minutę na źródło i 300/minutę na witrynę. Surowe payloady z dodatkowymi polami są odrzucane. Brak dostępności diagnostyki nie zmienia operacji użytkownika. Dane są używane do niezawodności, bez pomiaru marketingowego i bez osobnego identyfikatora śledzącego; opis znajduje się w polityce prywatności.

## Monitoring niezależny od GitHub Actions

`netlify/functions/fakturo-product-monitor.mjs` ma harmonogram co 5 minut na opublikowanym wdrożeniu Netlify. Sprawdza stronę HTML oraz bazę przez `/api/health`; awaria wymaga dwóch prób. Potem wywołuje chronione `/api/ops/product-health`, aby obsłużyć oczekujące powiadomienia i godzinny raport z błędów. Raport błędów ma trwałą blokadę wysyłki na godzinę. Resend deduplikuje również alarm dostępności w godzinie; SMTP może wysyłać go w każdym nieudanym cyklu.

Wymagane: `APP_URL` lub Netlify `URL`, istniejący `CRON_SECRET` (minimum 24 znaki) lub `KSEF_QUEUE_SECRET`, aktywna poczta. Samo wdrożenie pliku nie dowodzi uruchomienia harmonogramu ani odebrania wiadomości. Chroniony `GET /api/ops/product-health` potwierdza aktualną konfigurację i liczniki; dostęp wymaga tokenu crona. Nie jest dostępny dla zwykłej sesji konta.

Ten monitor działa niezależnie od GitHuba, ale wewnątrz Netlify. Do wykrycia awarii całej platformy potrzebny jest dodatkowo zewnętrzny host lub usługa uptime. Gotowy runner: `scripts/ops/availability-check.mjs`; sprawdza te same dwa adresy, wymaga potwierdzenia drugą próbą i wysyła podpisany webhook istniejącym mechanizmem `MONITOR_ALERT_WEBHOOK_URL` / `MONITOR_ALERT_SECRET`. Nie ujawnia sekretów. `MONITOR_SITE_URL` musi być HTTPS bez danych logowania. Szablony usługi i timera są w `deploy/monitor/` i muszą być zainstalowane na odrębnym hoście. Ich obecność w repo nie oznacza aktywnego monitora zewnętrznego. Aby potwierdzić odbiór alarmu, użyj istniejącego `scripts/ops/alert-drill.mjs` i potwierdź rzeczywiście odebraną wiadomość.

## Pierwsze minuty użytkownika

Pulpit wskazuje kolejny krok z rzeczywiście zapisanych danych. Nie otwiera automatycznie przewodnika nad pracą użytkownika; przewodnik pozostaje dostępny przyciskiem. W kreatorze faktury sprzedaży import zakupu jest opcjonalną rozwijaną sekcją.

Istniejący dobrowolny pomiar HMAC został rozszerzony o `creator_open` (obserwacja przeglądarki) i `draft_saved` (potwierdzony zapis serwera). `first_invoice` nadal pochodzi z potwierdzonego wystawienia, nie ze szkicu. Wymagane `PILOT_METRICS_SECRET` i aktualna zgoda analityczna; odmowa, DNT/GPC i wycofanie zgody zachowują ochronę.

`node scripts/ops/pilot-report.mjs` z oddzielnym `PILOT_REPORT_DATABASE_URL` pokazuje dodatkowo przejścia rejestracja → kreator, kreator → szkic i kreator → wystawiony dokument. Szkic jest opcjonalny. Kohorty wymagają kolejności dat; zdarzenia istniejących kont nie zwiększają konwersji nowych rejestracji. Bez co najmniej 10 kwalifikujących się obserwacji raport nie wskazuje priorytetu poprawy. To pomiar przeglądarek ze zgodą, nie liczby klientów ani przychodu.
