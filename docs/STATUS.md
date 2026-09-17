# Stan wdrożenia — 17 września 2026

Gałąź robocza: `codex/fakturo-modules`. `main` nie został zmieniony.

## Zaimplementowane i sprawdzone pełnym CI

- Build, lint, testy regresji i HTTP z izolowanym MongoDB; odwracalne migracje.
- Kolejka KSeF: uprawnienia, idempotencja, obsługa niepewnego wyniku.
- Wiele firm: izolacja katalogów i przełączanie profili, role.
- Audit log: transakcyjny zapis, filtr, paginacja, ekran historii.
- 2FA TOTP: szyfrowany sekret, QR, kody odzyskiwania, limit prób i ochrona sesji.
- Waluty: NBP i kwoty PLN liczone na serwerze, EUR/USD.
- Faktury cykliczne: harmonogram, generator, cron, pauza, role i unikalne wystąpienia.
- Mini-CRM: historia faktur, salda według firmy/waluty, notatki, tagi i wyszukiwanie.
- Publiczne API statusów KSeF i webhooki: klucze, podpisy, kolejka, blokada prywatnych adresów. Webhooki przekazują obserwowane migawki statusów.
- Przypomnienia e-mail: harmonogram, rzeczywista wysyłka SMTP/Resend, trwały dziennik. Test SMTP wyłącznie lokalny.
- JPK_FA(4) i część ewidencyjna JPK_V7M(3): podstawowe transakcje krajowe, XSD w testach. VAT bez deklaracji, plik do księgowości — nie kompletny pierwotny JPK do złożenia. Szczegółowe ograniczenia: JPK.md.

Ostatnia weryfikacja całego powyższego kodu: GitHub Actions 35197504447 — success.

## Jeszcze niezakończone

- Pełny cykl proforma → zaliczka → faktura końcowa. Istniejące proformy pozostają dostępne.
- Końcowy przegląd całego zakresu oraz publikacja na main.
- Zastosowanie poprawki istniejących błędów FA(3), obejmującej wyłączoną z prac sekcję Platnosc: FA3-BASELINE-FINDINGS.md i niezastosowany FA3-PROPOSED-FIX.patch. Potrzebna ograniczona zgoda na serializację XML.

Dedykowane moduły płatności/bankowości oraz istniejąca serializacja Platnosc nie były modyfikowane. Migracji nie uruchamiano na bazie produkcyjnej. Testów z rzeczywistym środowiskiem MF nie wykonano.

Instrukcje modułów, konfiguracji, migracji i testów ręcznych: IMPLEMENTATION.md, INTEGRATIONS.md, JPK.md, scripts/migrations/README.md.
