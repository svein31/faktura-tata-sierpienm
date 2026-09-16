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
