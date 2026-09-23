# Przed publicznym uruchomieniem

Stan kodu i zielone CI nie potwierdzają konfiguracji hostingu ani usług zewnętrznych. Ta lista wymaga rzeczywistego wykonania przez operatora środowiska; wynik, data i osoba potwierdzająca powinny zostać zapisane poza repozytorium.

## Konfiguracja i bezpieczeństwo

- Potwierdź docelowy adres HTTPS, połączenie z bazą MongoDB (replica set), migracje danych i indeksy, uprawnienia dostępu oraz brak demonstracyjnych sekretów w środowisku.
- Sprawdź faktyczne dane operatora, miejsce hostingu, dostawców poczty i treść dokumentów publicznych z osobą odpowiedzialną za usługę. Repozytorium nie potwierdza tych faktów.
- Sprawdź rejestrację, logowanie, MFA, odzyskiwanie konta i wysyłkę e-mail na docelowym hostingu. Linków odzyskiwania konta nie wolno zapisywać w logach.
- Ogranicz uprawnienia dostępu do logów, bazy oraz kopii. Sprawdź politykę retencji i procedurę usuwania danych.

## Faktury i integracje

- Zweryfikuj na aktualnym kontrakcie MF schemat FA(3), połączenie KSeF, wysyłkę, odrzucenie, stan niepewny, odbiór i pobranie UPO. Dane testowe nie zastępują tego sprawdzenia. Oddziel symulację lokalną od środowiska MF.
- Sprawdź wyszukiwanie NIP (GUS/MF), kursy NBP i zachowanie interfejsu, gdy usługa zewnętrzna jest niedostępna.
- Sprawdź ręcznie PDF, korekty, zaliczki, faktury cykliczne i powtórny import tego samego wyciągu. Zapis wpłaty i salda faktury musi pozostać spójny po błędzie.
- Funkcje wymagające dostawcy opcjonalnego, np. OCR, mogą być wyłączone, jeżeli użytkownik dostaje jasną alternatywę.

## Utrzymanie i decyzja o premierze

- Wykonaj rzeczywisty backup, odtwórz go do odizolowanej bazy i potwierdź dane oraz indeksy. Uruchom harmonogram kopii i alert o braku świeżej kopii.
- Zweryfikuj harmonogramy zadań, monitor kondycji, alerty na błędy aplikacji i nieudane zadania oraz procedurę zatrzymania wdrożenia.
- Uruchom pełny scenariusz użytkownika na docelowym adresie: rejestracja → firma → kontrahent → szkic → wystawienie → PDF → e-mail → KSeF → korekta.
- Sprawdź limit Free przy piątej i szóstej fakturze, przy wystawieniu przez członka zespołu oraz podczas zmiany miesiąca. Potwierdź scenariusz użytkownika po wyczerpaniu limitu.
- Zweryfikuj w oficjalnym rejestrze dane operatora przed premierą: kod 61-546 oraz miasto Warszawa zapisane obecnie w `src/lib/legal/config.ts` są niespójne. Potwierdź także adres siedziby i rzeczywistych podwykonawców; nie poprawiaj ich na podstawie domysłu.

Nie oznaczaj tych punktów jako wykonanych na podstawie samych testów CI. Po zmianie dostawcy lub wersji API powtórz odpowiedni test integracyjny.
