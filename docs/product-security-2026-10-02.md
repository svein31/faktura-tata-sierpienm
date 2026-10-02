# Wdrożenie pulpitu, kontroli faktur, księgowości, bezpieczeństwa i SEO

Data opracowania: 2 października 2026 r. Zmiany w PR #25.

## Funkcje użytkownika

- Pulpit: priorytety KSeF, nieznany wynik wysyłki, offline, brak UPO, zaległości, szkice, akceptacje i niedopasowane transakcje. Obliczenia na serwerze, zakres wybranej firmy.
- Finanse: zapisane transakcje, paginacja, kandydaci według waluty, kierunku i salda; ręczne przypisanie lub pominięcie. Transakcja bazodanowa i kontrola wersji zapobiegają podwójnemu zapisowi płatności.
- Asystent: kontrola danych i numeracji przed zatwierdzeniem w kreatorze, wysyłką istniejącej faktury do KSeF oraz wystawieniem offline. Ostrzeżenia nie zmieniają automatycznie stawki ani danych. Zapis szkicu pozostaje dostępny.
- E-mail: potwierdzenie odbiorcy, treści i załączników, ostrzeżenie o wcześniejszej wysyłce, rzeczywista dostępność UPO oraz saldo po częściowych wpłatach. Bez SMS.
- Księgowość: siedem kontroli miesiąca, postęp, linki do braków, skrzynki i finansów, eksport ZIP z potwierdzeniem tożsamości w miejscu pracy. Historia zamknięć i blokada zmian okresu pozostają serwerowe.

## Bezpieczeństwo

- SHA-256 losowych tokenów sesji w bazie; skrót nie jest akceptowany jako ciasteczko.
- Starsze sesje są aktualizowane przy użyciu. Migracja 016 pozwala operatorowi przeliczyć pozostałe rekordy bez wylogowania użytkowników; wdrożenie kodu samo nie potwierdza wykonania migracji całej bazy.
- CSRF: kontrola Origin względem hosta wdrożenia i odrzucanie cross-site; obejmuje formularze logowania, zapisu oraz przesyłania plików.
- Potwierdzenie hasła i 2FA dla operacji wrażliwych, ważne 10 minut. Lista urządzeń i unieważnianie własnych sesji.
- Właściciel może wymagać 2FA w firmie. Osoba bez aktywnego 2FA nie otrzyma danych chronionej firmy w bootstrapie i chronionych API.
- KSeF login wymaga sesji, dostępu do integracji i zgodnego NIP firmy. Usunięto używanie globalnego tokenu operatora jako fallbacku dla cudzych żądań.
- Nagłówki HSTS, nosniff, ochrona przed osadzaniem, polityka referera oraz ograniczenia uprawnień przeglądarki.
- CSP blokuje obiekty, zewnętrzną bazę URL, osadzanie strony i formularze obcego pochodzenia. Ograniczenie skryptów jest w trybie report-only; pełnego CSP skryptów nie przedstawiamy jako wdrożonego.
- Kontrola sygnatur i aktywnej zawartości PDF, kwarantanna, limit pojemności firmy 500 MB i istniejące limity rozmiaru/częstotliwości.
- OCR sprawdza bezpieczeństwo także przed wykonaniem wcześniej zakolejkowanego zadania.
- CI: zależności, historia sekretów, typy, lint, testy izolowane i przeglądarki. Jedyny wyjątek Gitleaks dotyczy dokładnego historycznego fingerprintu klucza localStorage; nie wyłącza skanowania całego pliku ani reguły.

## Uruchomienie zewnętrznego skanera plików

Zmienne serwera: DOCUMENT_SCAN_URL (HTTPS), DOCUMENT_SCAN_TOKEN (sekret), opcjonalnie DOCUMENT_SCAN_REQUIRED=true.
Skaner otrzymuje bajty dokumentu, Authorization: Bearer i X-Content-SHA256. Odpowiedź JSON musi zawierać status clean/infected oraz sha256 dokładnie tych bajtów. Wymaga to właściwej umowy/przetwarzania danych z dostawcą.

Bez dostawcy aplikacja pokazuje **niezweryfikowany**, a nie wynik antywirusa. Taki plik pobiera się jako załącznik zamiast osadzać w iframe. Ustawienie REQUIRED blokuje użycie niepotwierdzonych plików; awaria skonfigurowanego skanera powoduje kwarantannę. Skanera produkcyjnego nie uruchomiono ani nie potwierdzono w tym zadaniu bez konfiguracji dostawcy.

## Kopie i test odtwarzania

Serwer aplikacji: BACKUP_MONITOR_SECRET, co najmniej 32 znaki.
Operator: BACKUP_MONITOR_URL wskazujący HTTPS /api/ops/backup-receipt i ten sam sekret.
Kopia szyfrowana: BACKUP_DATABASE_URL/BACKUP_KEY oraz docelowy plik przekazany do skryptu: node scripts/backup/run.mjs create /BEZPIECZNA_SCIEZKA/kopia.enc. Plik i katalog muszą należeć do operatora.
Kopia poza serwerem: BACKUP_COPY_SOURCE/BACKUP_COPY_TARGET i rclone skonfigurowany poza repozytorium.

Potwierdzenie backup jest wysyłane dopiero po ukończeniu archiwum. Offsite dopiero po skopiowaniu zamrożonej listy plików. Stan poprawny wymaga świeżej kopii, identycznego SHA kopii offsite oraz świeżego potwierdzenia udanego restore. Brak konfiguracji lub dowodu jest widoczny jako brak potwierdzenia.

Workflow Verify operator backup restore potrzebuje GitHub secrets: BACKUP_DATABASE_URL, RESTORE_DATABASE_URL, BACKUP_KEY oraz konfiguracji monitora. Tworzy nową bazę o losowej nazwie fakturaprosto_drill_..., sprawdza integralność archiwum, odtwarza dokumenty i indeksy, porównuje liczności, wysyła restore receipt i usuwa wyłącznie tę nową bazę. Nie wolno podstawiać istniejącej bazy klientów jako celu ręcznego restore.

Automatyczny drill na izolowanych danych jest częścią testów. Konfiguracja ani wykonanie drill produkcyjnych kopii nie zostały potwierdzone przez samo dodanie workflow.

## SEO i zakres pomiaru

Metadata planu zastosowano w aplikacji, nie tylko w dokumentacji. Publiczne strony mają canonical, OpenGraph, obraz 1200×630, Twitter Card i poprawne max-image-preview. Konta i panel mają noindex. Sitemap obejmuje rzeczywiste nowe URL, llms.txt zawiera ceny brutto.

Opublikowano poradniki FA(3), UPO, odrzucenia, QR i przygotowania 2027; pięć scenariuszy produktu oraz sześć porównań. Strony zawierają odpowiedź, przykłady, źródła, ograniczenia i daty. Nie dopisano fikcyjnych ekspertów, ocen ani gwarancji pozycji. Niepotwierdzone ceny konkurencji są jawnie oznaczone.

Aktualizacja prawnych treści opiera się na źródłach zapisanych w audycie z 30 września i ponownie odczytanych 2 października (workflow 37025602589; source-verification-2026-10-02.json). Odczyt źródeł jest powtarzany przez workflow SEO. Nowe przepisy wymagają przeglądu redakcyjnego.

Brak dostępu do Search Console, analityki i płatnych danych SERP uniemożliwia potwierdzenie indeksacji, pozycji, konwersji i terenowych CWV. llms.txt nie gwarantuje cytowania przez model. Plan partnerstw, uczciwych opinii i publikacji poza serwisem wymaga rzeczywistych partnerów; nie wysłano wiadomości ani nie utworzono sztucznych opinii.
