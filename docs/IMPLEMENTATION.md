# Wdrożenie modułów Fakturo

Zmiany dedykowanych modułów płatności i bankowości są wyłączone. Edycje wspólnych plików obejmują wyłącznie zaakceptowany zakres fakturowania, autoryzacji i automatyzacji.

## 1. Weryfikacja i migracje

Dodano ESLint, testy rzeczywistych modułów GUS/FA(3)/NBP oraz HTTP na tymczasowym MongoDB replica set. Zastąpiono przestarzały test SQLite. CI uruchamia build, typecheck, lint, testy regresji i integracyjne. Runner migracji MongoDB zapisuje plan przed zmianami i obsługuje jawny rollback; instrukcja w `scripts/migrations/README.md`.

Ręcznie: nowe konto, logowanie, utworzenie firmy/kontrahenta/faktury, sprawdzenie braku danych obcego konta. Testy nigdy nie korzystają z produkcyjnego DATABASE_URL.

## 2a. Kolejka KSeF

Dodano kontrolę uprawnień przy kolejkowaniu i ponownie przed przetwarzaniem. Sesje statusowe są ograniczone do wykonawcy, NIP-u i środowiska. Oczekujący status nie prowadzi do ponownej wysyłki. Niejednoznaczny wynik wysyłki i porzucone zadania wymagają weryfikacji. Kolejkowanie z audytem jest transakcyjne, z kluczem dokument/wersja; ponowienie bezpiecznie nieudanego zadania używa tego samego rekordu. Proformy są blokowane.

Ręcznie: odebrać pracownikowi `canSendKsef` po dodaniu zadania; sprawdzić odmowę przetwarzania. Dwukrotne kliknięcie wysyłki ma utworzyć jedno zadanie. Na środowisku testowym MF sprawdzić oczekiwanie → akceptację/UPO i brak drugiej wysyłki przy statusie oczekującym. Migracja nie jest wymagana.

## 2b. Wiele firm i izolacja katalogów

Istniejący przełącznik profili filtruje katalogi oraz wybór kontrahenta/produktu na fakturze. Nowe rekordy należą do aktywnej firmy. Lista i szczegóły firm uwzględniają członkostwo w zespole. Backend sprawdza firmę kontrahenta oraz uprawnienia do zapisu katalogu; zapisanej faktury nie można przenieść między firmami. Starsi kontrahenci powiązani z fakturą pozostają widoczni członkom jej firmy; pozostałe dane konta są prywatne. Zmiany katalogu zapisują audyt w tej samej transakcji. Usunięcie kontrahenta z historią faktur jest blokowane.

Migracja: `001-company-catalog`, jawne `up`/`down`, opis w instrukcji migracji. Ręcznie: utworzyć dwie firmy i osobne katalogi, przełączać profile, zaprosić podgląd do jednej firmy, sprawdzić brak danych drugiej i odmowę edycji. Odebrać członkostwo i odświeżyć dane. Sprawdzić wybór kontrahenta na nowej fakturze i historię starych dokumentów.

## 3. Dziennik zmian

Audyt utworzenia, edycji i usunięcia faktury/profilu/katalogu jest zapisywany razem z operacją w transakcji. Zmiany wersji dokumentu nie nadpisują równoległego zapisu. Logi filtrują równocześnie firmę i dokument, uwzględniają odebrane członkostwo i obsługują stronicowanie. Maskowanie obejmuje zagnieżdżone tokeny i sekrety. Usunięcie pustej firmy zachowuje historię zamiast kasować ją kaskadowo (`SetNull`, zachowanie nowego klienta Prisma, bez modyfikacji istniejących danych). Dodano ekran „Dziennik zmian”.

Ręcznie: edycja faktury w dwóch kartach, filtr firma/dokument, starsze wpisy, odebranie dostępu, zmiana tokena KSeF (wartość ma być ukryta). Usunąć pustą firmę i sprawdzić zachowanie wpisów w bazie. Moduły płatności nie były edytowane.

## 4. 2FA TOTP

Ustawienia konta umożliwiają konfigurację kodem QR lub kluczem, potwierdzenie TOTP, wyłączenie oraz odnowienie kodów odzyskiwania. Sekret jest szyfrowany AES-256-GCM z powiązaniem z użytkownikiem, kody odzyskiwania są haszowane i jednorazowe. Baza pilnuje limitu prób i zapobiega ponownemu użyciu kodu TOTP. Sesje są powiązane z konkretną aktywacją 2FA; włączenie/zmiana unieważnia pozostałe sesje. Login nie tworzy sesji przed drugim składnikiem. Reset hasła nie usuwa MFA.

Konfiguracja serwera: trwały `MFA_ENCRYPTION_KEY` = 32 losowe bajty zapisane jako 64 znaki hex, np. wygenerowane lokalnie `openssl rand -hex 32`; przechowywać w menedżerze sekretów i kopii zapasowej. Nie zmieniać bez migracji ponownego szyfrowania. Migracja `002-user-mfa`; brak klucza blokuje konfigurację 2FA. Źródło algorytmu: RFC 6238, testy oficjalnych wektorów SHA-1.

Ręcznie: skan QR, aktywacja, ponowne logowanie, błędny/powtórzony kod, kod odzyskiwania użyty dwa razy, wyłączenie z hasłem i kodem. Sprawdzić wylogowanie drugiej przeglądarki oraz brak sekretów w audycie.

## 5. Waluty i NBP

Rozszerzono istniejący moduł NBP i parser faktur. Serwer wyznacza oficjalny kurs oraz kwoty PLN zamiast ufać wartościom z formularza. Zachowuje numer tabeli, datę publikacji i podstawę kursu. Weekendy/święta cofają wyszukiwanie do poprzedniej publikacji; awaria, błędna odpowiedź lub timeout nie podstawiają kursu 1. Istniejący kurs ręczny wymaga dodatniej wartości i uzasadnienia. Waluta PLN usuwa obce metadane kursowe. API: https://api.nbp.pl/.

Ręcznie: EUR/USD, faktura poniedziałkowa, zmiana daty i waluty na PLN, niedostępność NBP, uzasadniony kurs ręczny; porównać zapis z PDF/XML. Istniejące faktury nie są przeliczane migracją, nowe kolumny nie są potrzebne.

## 6. Faktury cykliczne

Istniejące pola harmonogramu faktury są używane przez serwerowy generator. Interwały: tydzień, miesiąc, kwartał, rok; zachowanie dnia kotwiczącego (31 stycznia → 28 lutego → 31 marca), daty Europe/Warsaw. Unikalne wystąpienie i transakcja chronią przed dwukrotnym generowaniem. Generator ponownie sprawdza role, pobiera aktualny właściwy kurs NBP, nie kopiuje numeru KSeF ani wpłat. Nowy dokument otrzymuje serię `CYK/data/idŹródła`. Po przerwie nadrabia jeden okres na harmonogram i uruchomienie, z bieżącą datą wystawienia oraz datą sprzedaży z harmonogramu. Błędy są widoczne na ekranie cykli; wstrzymanie/wznowienie podlega audytowi. Opcjonalne kolejkowanie używa istniejącej kolejki KSeF i środowiska autora harmonogramu.

Netlify: `netlify/functions/fakturo-scheduler.mjs` uruchamia generator co 15 minut; ustawić `CRON_SECRET` i `APP_URL` (HTTPS; na Netlify może użyć `URL`). Inny hosting: cron wysyła POST `/api/recurring/process` z `Authorization: Bearer <CRON_SECRET>` co 15 minut. Migracja `003-recurring-occurrences`. Endpoint nie przyjmuje uwierzytelnienia zwykłą sesją.

Ręcznie: utworzyć cykl z ekranu „Faktury cykliczne” lub kreatora, uruchomić harmonogram dwukrotnie, sprawdzić jeden dokument, daty końca miesiąca, wstrzymanie i odebrane uprawnienia. Automatyczna wysyłka KSeF pozostaje zależna od opisanej osobno zgodności istniejącego XML z XSD.

## 7. Mini-CRM

Ekran kontrahentów: notatki, edycja i wyszukiwanie tagów, historia dokumentów z paginacją oraz należności, zobowiązania i saldo osobno dla walut i wybranej firmy. Odczyt istniejących kwot rozliczeń; brak operacji zapisu płatności. Proformy, szkice i anulowane dokumenty nie zwiększają salda. Nie wymaga migracji.

Ręcznie: zapisać/usunąć tagi i notatkę, wyszukać tag, otworzyć historię, przełączyć firmę, porównać salda PLN/EUR oraz dokument częściowo rozliczony i korektę ujemną.
