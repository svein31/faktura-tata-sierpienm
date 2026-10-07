# Poprawki przed publikacją — 7 października 2026

Zakres zaakceptowany przez właściciela: punkty 2–6 przeglądu przed publikacją. Zmiany trafiają na `main`; publikacja w Netlify czeka na przywrócenie limitu. Nie uruchamiano płatności, poczty ani transmisji KSeF na produkcji.

## Zmiany

- Płatności: trwała, wspólna blokada zakupu, synchronizacji Stripe i usuwania konta; ponowne użycie otwartej sesji Checkout i klucza idempotencyjnego; sprawdzanie bieżących subskrypcji zamiast cofania stanu przez spóźnione webhooki. Usunięcie konta wymaga wcześniejszego potwierdzenia anulowania subskrypcji.
- E-mail po KSeF: wysyłka po otrzymaniu UPO pasującego do numeru KSeF, z zapisanym odbiorcą, DW/UDW, treścią i wyborem PDF/XML. UPO jest wymagane. Trwała kolejka ma jednego wykonawcę oraz niezależne ponawianie jednoznacznie nieudanych prób. Niepewny wynik transportu przechodzi do `verify_needed` i wymaga sprawdzenia, aby uniknąć powtórnej wysyłki.
- Konto: jednorazowy reset hasła atomowo zużywa link, zmienia hasło i usuwa sesje. Usunięcie konta atomowo usuwa także osobiste wpisy audytu i audyt firm właściciela; niezależny audyt innych właścicieli pozostaje.
- Oferta i dokumenty: Free i Pro opisują faktycznie współdzielone moduły oraz limit 5 wystawionych faktur sprzedaży na miesiąc właściciela. Powrót z Checkout potwierdza Pro na podstawie odpowiedzi serwera. Dokumenty prawne opisują dostępne eksporty i faktyczny cykl danych, bez obietnicy pełnego ZIP ani automatycznej retencji kopii 30/60 dni. Wprowadzenie rozróżnia termin PIT/CIT od VAT.
- Telefon: krótszy nagłówek i wstęp oraz mniejszy baner cookies zachowują ustawienia, odrzucenie i akceptację. Demo jest widoczne nad banerem na ekranach 320 × 740 i 390 × 844 w Chromium i WebKit; brak przewijania poziomego.

## Przy następnym wdrożeniu

1. Zgodnie z procedurą migracji wykonać snapshot bazy.
2. W środowisku z produkcyjnym `DATABASE_URL` uruchomić `npm run db:migrate -- up`. Migracja `017-launch-safety` dodaje unikalny indeks `BillingCheckoutState.userId` i indeks kolejki poczty na `Invoice`; nie nadpisuje istniejących dokumentów.
3. Wdrożyć nowy commit po przywróceniu dostępności Netlify i sprawdzić rewizję oraz publiczne strony. Lokalny build nie potwierdza publikacji.

Migracja jest sprawdzana przez up → up → down → up na izolowanym replica set. Przy cofnięciu kodu zatrzymać worker; wcześniejsza wersja nie powinna ponawiać wiadomości zapisanych jako `sending` lub `verify_needed`. Kopie zapasowe i ich rzeczywistą retencję należy potwierdzić w konfiguracji operatora/dostawcy.

## Weryfikacja

Build, lint, typecheck i 198 testów jednostkowych przeszły. Regresje na rzeczywistej, izolowanej MongoDB potwierdziły pojedynczy sukces czterech równoległych resetów hasła, jedną sesję przy ośmiu równoległych próbach zakupu, transakcyjny rollback usuwania konta oraz jednego wykonawcę poczty KSeF. Stripe, transport e-mail i przygotowanie PDF w tych regresjach zastępują kontrolowane atrapy; testy nie korzystają z produkcyjnych usług.

Pełna integracja zakończyła się kodem 0: 41 publicznych adresów SEO, 42 kontrole bezpieczeństwa, 431 kontroli API na 128 trasach i 185 metodach, 15 scenariuszy formularzy oraz 574 kontrole układu w Chromium i WebKit — bez błędów. Sprawdzono również migracje i zaszyfrowany backup z odtworzeniem na izolowanej bazie.

Polecenia: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` oraz `RUN_ALL_MOBILE_CHECKS=1 RUN_WEBKIT_CHECKS=1 npm run test:integration` (ostatnie wymaga zainstalowanych silników Playwright i ich bibliotek systemowych).
