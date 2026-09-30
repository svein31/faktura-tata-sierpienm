# Stan prac — 30 września 2026

Gałąź: `codex/saas-audit-20260930`. Pakiet obejmuje odzyskany checkpoint `codex/saas-workflows-20260930` oraz audyt i rozszerzenia opisane w [raporcie](audit/2026-09-30-saas-audit.md).

## Bieżący pakiet

- Osiem głównych sekcji nawigacji, odchudzony widok księgowy, menu mobilne, linki prawne w Pomocy.
- Role i uprawnienia firmowe, zaproszenia bez ujawniania tokenów na listach, portal księgowy z akceptacją, księgowaniem i uwagami.
- Import CSV, MT940 i CAMT.053, trwała historia operacji, dopasowanie wpłat/wypłat z uwzględnieniem waluty, deduplikacja i audyt.
- Eksport przelewów pain.001/CSV, paczki dokumentów ZIP oraz eksport faktur XLSX/CSV z kontrolą uprawnień.
- Motywy jasny/ciemny/systemowy, własne kolory z kontrolą kontrastu, poprawki responsywności.
- Podgląd panelu i spójny cennik na stronie publicznej.
- Prognozy JDG/CIT/VAT/składek oraz opcjonalne przypomnienia SMS przez Twilio.
- GTU, procedury, MPP i podstawa zwolnienia w zapisie faktur; FA(3) i wersjonowane PDF-y z polskimi znakami.
- Regresje parsowania, ról, izolacji firm, księgowania, eksportów, XSD i nowych ekranów mobilnych.

Istniejące moduły OCR, KSeF, NBP, GUS/Biała Lista, cykliczne faktury, przypomnienia e-mail, historia i wiele firm zachowano. Szczegóły ich ograniczeń i znalezionych błędów zawiera raport audytu.

## Weryfikacja i wdrożenie

Brama `npm run verify` obejmuje build, typecheck, lint, testy jednostkowe/XSD, integrację HTTP z izolowanym MongoDB oraz Playwright. Aktualny wynik dla konkretnego SHA znajduje się w GitHub Actions i opisie PR. Nie uruchamiano migracji na bazie produkcyjnej ani wiadomości do klientów.

Przed wdrożeniem: standardowy backup i procedura migracji, odtworzenie Prisma Client, konfiguracja dostawców oraz testy konkretnych banków i rzeczywistego środowiska MF. Paczki ZIP nie są natywnymi importami Optimy/Rachmistrza/Symfonii/Enovy. JPK_V7M obejmuje część ewidencyjną, bez kompletnej deklaracji do złożenia. Eksport przelewów specjalnych, podatkowych i MPP wymaga profilu banku.

Instrukcje: [IMPLEMENTATION.md](IMPLEMENTATION.md), [INTEGRATIONS.md](INTEGRATIONS.md), [JPK.md](JPK.md), [migracje](../scripts/migrations/README.md).
