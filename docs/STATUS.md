# Stan wdrożenia — 17 września 2026

Gałąź robocza: `codex/fakturo-modules`. Wcześniejsze moduły scalono na `main` w PR #2; ostatni pakiet rozliczeń zaliczek wymaga osobnej weryfikacji.

## Zaimplementowane moduły

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
- Proforma → faktury zaliczkowe → faktura końcowa: idempotencyjny ledger, rozliczenie netto według stawek VAT, ujemne pozycje rozliczeniowe na finale, blokada edycji/usuwania po rozliczeniu oraz ekran `/advances`.
- FA(3): zastosowano zatwierdzoną, minimalną korektę serializacji (JST/GV, PMarzy, korekty KSeF oraz zgodna sekcja Platnosc z rzeczywistą datą zapłaty); zwykłe, opłacone i korekcyjne warianty przechodzą oficjalne XSD w testach.

Poprzedni pakiet: GitHub Actions 35197504447 — success. Ostatni pakiet rozliczeń zaliczek i FA(3): lokalny build, lint oraz 35 testów przeszły. Lokalna integracja zablokowana na starcie MongoDB (`open: Operation not permitted`); wymagana weryfikacja GitHub Actions przed publikacją na main.

## Pozostało przed wdrożeniem

- Końcowy przegląd zmian, zielony CI na gałęzi roboczej i fast-forward publikacji na `main`.

Dedykowane moduły płatności/bankowości nie były modyfikowane. Zmieniono wyłącznie serializację XML FA(3) w celu zgodności ze schematem, bez obsługi przelewów, operatora płatności ani rejestru wpłat. Migracji nie uruchamiano na bazie produkcyjnej. Testów z rzeczywistym środowiskiem MF nie wykonano.

Instrukcje modułów, konfiguracji, migracji i testów ręcznych: IMPLEMENTATION.md, INTEGRATIONS.md, JPK.md, scripts/migrations/README.md.
