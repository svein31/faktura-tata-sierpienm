# Stan wdrożenia

Gałąź robocza: `codex/fakturo-modules`. `main` nie został zmieniony.

## Zaimplementowane i sprawdzone pełnym CI

- Build, lint, testy regresji i integracyjne HTTP z MongoDB replica set; runner odwracalnych migracji.
- Kolejka KSeF: uprawnienia, idempotencja, brak ponownej wysyłki przy niepewnym wyniku.
- Wiele firm: izolacja katalogów, przełączanie profili, kontrola dostępu zespołu.
- Audit log: transakcyjne zapisy, filtrowanie, paginacja, ekran historii.
- 2FA TOTP: szyfrowany sekret, QR, jednorazowe kody odzyskiwania, limit prób i ochrona sesji.
- Waluty: kurs NBP i kwoty PLN liczone po stronie serwera, EUR/USD, weekendy i awarie.

## Bieżący moduł

Faktury cykliczne: generator, harmonogramy, zachowanie końca miesiąca, pauza/wznowienie, kontrola ról, unikalne wystąpienia, cron Netlify i instrukcja dla innego hostingu. Wynik ostatniego CI tej gałęzi jest rozstrzygającym potwierdzeniem weryfikacji.

## Jeszcze niezakończone

- Pełny cykl proforma → zaliczka → faktura końcowa (istniejące proformy pozostają dostępne).
- Mini-CRM: historia transakcji, salda i obsługa tagów w interfejsie (istniejące notatki/tagi w modelu zachowane).
- JPK_VAT / JPK_FA.
- Publiczne API statusów KSeF i webhooki.
- Automatyczne e-mailowe przypomnienia o terminach.
- Końcowy przegląd całego zakresu oraz publikacja na `main`.

## Znany problem poza dozwolonym zakresem

Oficjalne XSD wykazało istniejące błędy FA(3), w tym w sekcji `Platnosc`. Szczegóły i minimalny zakres wymaganej korekty: `FA3-BASELINE-FINDINGS.md`. Sekcja płatności oraz dedykowane moduły płatności/bankowości nie były modyfikowane. Pełne testy CI nie oznaczają jeszcze walidacji całego XML XSD ani testu wysyłki do MF.

Instrukcje wdrożenia, migracji i ręcznego sprawdzenia: `IMPLEMENTATION.md` i `scripts/migrations/README.md`.
