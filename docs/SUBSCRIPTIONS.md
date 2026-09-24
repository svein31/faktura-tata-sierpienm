# Subskrypcje i Płatności Stripe w FakturaProsto.pl

Aplikacja FakturaProsto obsługuje subskrypcje cykliczne (recurring) za pośrednictwem operatora płatności **Stripe** (Stripe Checkout oraz Stripe Customer Portal).

---

## 1. Plany Cenowe

- **Plan Miesięczny (`monthly`)**: 7,00 zł / miesiąc (PLN)
- **Plan Roczny (`yearly`)**: 59,00 zł / rok (PLN) — odpowiednik ~4,92 zł/mies. (oszczędność ~30%)

Oba plany gwarantują pełny dostęp do wszystkich funkcji systemu: wystawiania e-faktur VAT, integracji z KSeF 2.0, bazy kontrahentów GUS/Biała Lista, magazynu oraz eksportu JPK w zakresie opisanym w [docs/JPK.md](JPK.md).

---

## 2. Zmienne Środowiskowe (.env)

Do poprawnego działania modułu płatności należy zdefiniować w pliku `.env`:

```env
# Klucze API Stripe
STRIPE_SECRET_KEY="sk_test_..."          # lub rk_live_... w produkcji
STRIPE_PUBLISHABLE_KEY="pk_test_..."      # lub pk_live_... w produkcji

# Sekret podpisu webhooków (generowany w Stripe Dashboard lub przez Stripe CLI)
STRIPE_WEBHOOK_SECRET="whsec_..."

# Identyfikatory cen (wygenerowane skryptem lub utworzone ręcznie w Stripe)
STRIPE_PRICE_ID_MONTHLY="price_..."
STRIPE_PRICE_ID_YEARLY="price_..."
```

---

## 3. Szybkie Tworzenie Produktów i Cen w Stripe

Zamiast konfigurować produkty ręcznie w panelu Stripe, możesz użyć dołączonego skryptu automatyzującego:

```bash
# Uruchomienie ze zmienną ze środowiska / .env:
node scripts/setup-stripe-products.mjs

# LUB bezpośrednio z kluczem jako argument:
node scripts/setup-stripe-products.mjs sk_test_51...
```

Skrypt:
1. Utworzy produkt `FakturaProsto Pro`.
2. Utworzy obie ceny cykliczne w PLN (7 zł/msc i 59 zł/rok).
3. Wypisze gotowe linie do wklejenia do pliku `.env`.

---

## 4. Architektura i Endpointy API

| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/subscription` | `GET` | Zwraca stan subskrypcji zalogowanego użytkownika (`plan`, `status`, `currentPeriodEnd`, `hasPortal`, `isPro`). |
| `/api/subscription/checkout` | `POST` | Przyjmuje `{ plan: "monthly" \| "yearly" }` i tworzy sesję Stripe Checkout (`mode: "subscription"`). Zwraca `{ url }`. |
| `/api/subscription/portal` | `POST` | Tworzy sesję Stripe Customer Portal dla użytkownika, który posiada `stripeCustomerId`. Zwraca `{ url }`. |
| `/api/webhooks/stripe` | `POST` | Odbiera i weryfikuje kryptograficznie zdarzenia Stripe. Idempotentnie aktualizuje bazę danych. |

---

## 5. Model Danych (MongoDB / Prisma)

Tabela `Subscription` powiązana z użytkownikiem (`User` 1:1):
- `userId` (`@unique` ObjectId): Identyfikator użytkownika w systemie.
- `stripeCustomerId` (`String? @unique`): Identyfikator klienta w Stripe (`cus_...`).
- `stripeSubscriptionId` (`String? @unique`): Identyfikator aktywnej subskrypcji Stripe (`sub_...`).
- `stripePriceId` (`String?`): Aktualnie przypisany identyfikator ceny Stripe (`price_...`).
- `plan` (`String?`): `"monthly"` lub `"yearly"`.
- `status` (`String`): `"inactive"`, `"active"`, `"trialing"`, `"past_due"`, `"canceled"`, `"unpaid"`.
- `currentPeriodEnd` (`DateTime?`): Koniec bieżącego opłaconego cyklu.
- `cancelAtPeriodEnd` (`Boolean?`): `true`, jeśli użytkownik zlecił anulowanie z końcem okresu.

### Odpytywanie o uprawnienia Pro w kodzie:
W module `src/lib/subscription.ts` dostępna jest funkcja `hasActivePro`:

```typescript
import { hasActivePro } from "@/lib/subscription";

const isPro = await hasActivePro(user.id);
if (!isPro) {
  throw new ApiError(403, "Funkcja dostępna wyłącznie dla subskrybentów planu Pro.");
}
```

---

## 6. Obsługa Webhooków Stripe

Endpoint `/api/webhooks/stripe` weryfikuje podpis nagłówka `stripe-signature` za pomocą `STRIPE_WEBHOOK_SECRET` i obsługuje zdarzenia:
- `checkout.session.completed`: Powiązanie użytkownika z subskrypcją i aktywacja planu.
- `customer.subscription.updated`: Zmiana planu, statusu, daty odnowienia lub anulowania.
- `customer.subscription.deleted`: Oznaczenie subskrypcji jako `canceled`.
- `invoice.payment_failed`: Oznaczenie subskrypcji jako `past_due`.
- `invoice.payment_succeeded`: Odnowienie okresu ważności (`currentPeriodEnd`).

---

## 7. Jak Przetestować Flow w Trybie Testowym (Test Mode)

### Krok 1: Klucze testowe
Upewnij się, że w `.env` masz ustawione klucze testowe zaczynające się od `sk_test_...` oraz `pk_test_...`.

### Krok 2: Uruchomienie lokalnego przekazywania Webhooków (Stripe CLI)
Zainstaluj Stripe CLI (jeśli nie posiadasz) i zaloguj się:
```bash
stripe login
```

Uruchom przekazywanie zdarzeń na lokalny serwer Next.js:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

CLI wyświetli sekret webhooka, np.:
`> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxx`
Skopiuj tę wartość do `STRIPE_WEBHOOK_SECRET` w pliku `.env`.

### Krok 3: Test zakupu subskrypcji
1. Zaloguj się do aplikacji i przejdź do: **Ustawienia konta -> Plan** (`/settings/account`).
2. Wybierz plan (Miesięczny 7 zł lub Roczny 59 zł) i kliknij **„Aktywuj Plan”**.
3. Na stronie Stripe Checkout użyj oficjalnej karty testowej Stripe:
   - **Numer karty:** `4242 4242 4242 4242`
   - **Data ważności:** Dowolna przyszła (np. `12/28`)
   - **CVC:** Dowolne 3 cyfry (np. `123`)
   - **Kod pocztowy:** Dowolny (np. `00-001`)
4. Po kliknięciu „Subskrybuj” zostaniesz przekierowany z powrotem na `/settings/account?billing=success`.
5. Karta w ustawieniach natychmiast zaktualizuje się do stanu **Aktywna**, prezentując wybrany plan i datę odnowienia.

### Krok 4: Test portalu klienta (Customer Portal)
1. Będąc na aktywnej subskrypcji, kliknij **„Zarządzaj w Stripe”**.
2. W portalu Stripe możesz:
   - Zaktualizować kartę płatniczą,
   - Pobrać faktury VAT wygenerowane przez Stripe,
   - Anulować subskrypcję.
3. Po powrocie do aplikacji status natychmiast odzwierciedli wykonane zmiany.
