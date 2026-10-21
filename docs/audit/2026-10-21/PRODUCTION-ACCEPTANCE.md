# Produkcyjna próba przed szeroką premierą

Stan na 2026-10-21. Ta tabela nie jest deklaracją zaliczenia. Potwierdza się rzeczywiste zdarzenia; nie zastępuj ich samym istnieniem skryptu albo testem syntetycznym. Nie wpisuj tu sekretów, danych faktur, adresów baz ani tokenów klientów.

## Dostęp i faktyczne próby

- W środowisku pracy nie skonfigurowano połączenia do produkcyjnej bazy, hosta kopii, odbiornika alarmów ani kont testowych dostawców. Sprawdzono jedynie obecność nazw, bez odczytu wartości sekretów.
- Netlify MCP po dwóch próbach nadal zwraca żądanie ponownego uwierzytelnienia pomimo komunikatu o jego zaakceptowaniu. Nie udało się odczytać konfiguracji produkcji.
- GitHub przyjmuje uruchomienia workflow. Dostęp do administracji oraz listy nazw sekretów repozytorium zwraca 403. Nie zmieniano uprawnień i nie odczytywano wartości sekretów.
- Zlecono istniejący, zabezpieczony drill `Verify operator backup restore`: https://github.com/svein31/faktura-tata-sierpienm/actions/runs/39649320616 . Zakończył się `startup_failure` przed startem zadań, więc nie wykonał kopii ani odtworzenia.
- Świeży monitor: https://github.com/svein31/faktura-tata-sierpienm/actions/runs/39647757593 . Także `startup_failure`, bez zadań i bez potwierdzenia alarmu. Przyczyna nowych nieudanych startów nie została ujawniona przez API.

## Kopia i alarm

| Kontrola | Stan | Dowód wymagany do zaliczenia |
| --- | --- | --- |
| Świeża kopia produkcyjna | Niezweryfikowana | Data poprawnie ukończonej zaszyfrowanej kopii i jej potwierdzenie. |
| Kopia poza główną infrastrukturą | Niezweryfikowana | Potwierdzenie zewnętrznego transferu tej samej kopii; aktualny wynik istniejącej sondy. |
| Odtworzenie prawdziwej kopii | Niezweryfikowane | Wynik istniejącego `offsite-drill.mjs`, odczytującego kopię z offsite i odtwarzającego ją do nowej izolowanej bazy. |
| Dostarczenie alarmu | Niezweryfikowane | Poprawne wykonanie istniejącego `alert-drill.mjs send` do skonfigurowanego odbiornika. |
| Odebranie alarmu przez dyżurnego | Niepotwierdzone | Potwierdzenie od osoby, która rzeczywiście otrzymała alarm; dopiero wtedy `alert-drill.mjs confirm <drillId>`. HTTP 2xx odbiornika nie wystarcza. |

Istniejący workflow `production-drill.mjs` domyślnie tworzy świeży eksport źródła i sprawdza odtworzenie. Nawet jego późniejszy PASS nie zastąpi dowodu pobrania kopii z offsite. Nie należy uruchamiać aplikacji/workerów na odtworzonych sesjach. Istniejące skrypty usuwają tylko nową, losowo nazwaną bazę próby; nie wolno kierować ich na aktywną bazę.

Procedura i wymagane nazwy konfiguracji są w [OPS-PILOT.md](../../OPS-PILOT.md) oraz [RELEASE-CHECKLIST.md](../../RELEASE-CHECKLIST.md). Konfigurację przekazuje się przez bezpieczny mechanizm hostingu lub środowiska operatora; raport nie wymaga drukowania sekretów.

## Pełna ścieżka użytkownika

| Etap | Co pokrywają testy lokalne | Dowód z aktywnej konfiguracji produkcyjnej |
| --- | --- | --- |
| Rejestracja i weryfikacja adresu | Walidacja, zgody, zapis konta, bezpieczne tokeny, sesja i poczta w izolowanym środowisku. | Niezweryfikowany: rzeczywista wiadomość dociera do kontrolowanej skrzynki, link działa raz i otwiera właściwe konto. |
| Dane firmy i kontrahent | Rzeczywiste HTTP i MongoDB, uprawnienia, izolacja firm. | Niezweryfikowany: właściciel potwierdza swoją firmę i poprawność danych pobranych od dostawcy. |
| Faktura i PDF | Zapis/odczyt, numeracja, wartości i rzeczywisty lokalny PDF. | Niezweryfikowany: użytkownik sprawdza poprawny dokument i pobiera go na komputerze oraz telefonie. |
| E-mail z dokumentem | Kontrolowany lokalny SMTP, próby doręczenia, niepewny wynik i ochrona przed duplikatami. | Niezweryfikowany: wiadomość i załącznik rzeczywiście docierają; sprawdzenie historii u aktywnego dostawcy. |
| KSeF oraz UPO | FA(3), szyfrowanie, statusy, odmowa i niepewny wynik, powiązanie potwierdzenia z dokumentem na kontrolowanym transporcie. | Niezweryfikowany: wynik rzeczywistej bramki, numer KSeF i odpowiadające mu UPO. Test MF to osobny dowód od produkcji; nie wolno wysyłać fikcyjnej faktury do rzeczywistego MF. |
| Korekta | Osobny dokument, powiązanie z oryginałem, przeliczenia i zaakceptowane starsze dokumenty. | Niezweryfikowany: legalny scenariusz rzeczywistego operatora kończy się właściwą korektą i potwierdzeniem, gdy wymagane jest KSeF. |
| Pro i anulowanie | Kontrolowany Stripe/webhook, brak powielonych zakupów, aktywacja, błędna płatność i anulowanie. | Niezweryfikowany: Checkout/webhook/stan Pro w aktywnej konfiguracji oraz anulowanie odnowienia potwierdzone u dostawcy. Tryb testowy Stripe nie dowodzi produkcyjnego rozliczenia. |
| Eksport do księgowości | Uprawnienia, miesiąc, rzeczywiste lokalne bajty ZIP oraz jawne pominięcia plików bez potwierdzenia skanera. | Niezweryfikowany: operator lub biuro otwiera paczkę i potwierdza przydatność jej zawartości. |

Dowód każdego etapu powinien mieć datę, środowisko i wynik oraz prywatne odniesienie do rzeczywistego zdarzenia u dostawcy. Zanonimizowana notatka w tym raporcie wystarczy; nie publikuj dokumentów, UPO, identyfikatorów płatności ani danych uczestnika. Zamknięcie lokalnej regresji nie oznacza zaliczenia tych etapów na produkcji.
