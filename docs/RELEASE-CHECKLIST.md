# Warunki konieczne przed otwarciem rejestracji na większą skalę (Checklist 1–8)

Niniejszy dokument potwierdza wdrożenie, zabezpieczenie i przetestowanie 8 kluczowych warunków techniczno-prawnych przed udostępnieniem serwisu FakturaProsto (https://fakturaprosto.pl) dla szerszej publiczności.

---

## Podsumowanie stanu realizacji (Status: 8/8 ZREALIZOWANE I PRZETESTOWANE)

| Nr | Obszar | Kluczowe wymagania | Status testów | Plik testowy |
|---|---|---|:---:|---|
| **1** | **Baza i kopie** | Migracja `015-auth-rate-limit`, regularny backup, alert o braku/starej kopii ze wskazanym odbiorcą, szyfrowane odtworzenie do izolowanej bazy z weryfikacją firm, faktur, załączników i indeksów. | **PASSED** | `scripts/tests/backup-and-restore.test.cjs` |
| **2** | **KSeF od początku do końca** | Walidacja FA(3), challenge/auth, szyfrowana wysyłka, obsługa odrzucenia, zerwania połączenia (`verify_needed`), blokada podwójnego wysłania (`claimKsefTransmission` 409), pobranie nr KSeF i UPO, twardy rozdział Demo od środowiska MF. | **PASSED** | `scripts/tests/ksef-lifecycle.test.cjs` |
| **3** | **Pełna ścieżka klienta** | Rejestracja → firma → kontrahent → wystawienie → PDF → e-mail → KSeF → korekta → eksport. Brak ślepych zaułków, zachowanie wprowadzonych danych po odświeżeniu/cofnięciu/zerwaniu sieci (`DRAFT_KEY` w `localStorage`). | **PASSED** | `scripts/tests/customer-journey.test.cjs` |
| **4** | **Import zakupów i wydatki** | Parsowanie PDF/XML (sprzedawca, daty, waluta, netto, VAT, brutto), podgląd i ręczna korekta przed zapisem, jeden wydatek = jeden wpis, blokada duplikatów, limit 3MB, izolacja plików między firmami. | **PASSED** | `scripts/tests/purchase-expenses.test.cjs` |
| **5** | **Dane między firmami i kontami** | Role: Właściciel, Księgowa, Pracownik, Podgląd; blokada IDOR po bezpośrednich URL/ID; limity resetu haseł (15 min); MFA (TOTP) powiązane z tożsamością konta. | **PASSED** | `scripts/tests/multi-tenant-rbac.test.cjs` |
| **6** | **Treści prawne i oferta** | Kod pocztowy operatora: `04-998 Warszawa` (ul. Ogórkowa 63S); Regulamin § 5 zrealizowany z planami Free (5 faktur/miesiąc) i Pro (7 zł/mies., 59 zł/rok), wymogi UOKiK (auto-renewal, 1-click cancel); Polityka z retencją kopii 30 dni; dopisany Stripe. | **PASSED** | `scripts/tests/legal-compliance.test.cjs` |
| **7** | **Monitoring i reakcja na awarię** | Alerty o awariach aplikacji, kolejki KSeF, e-mail, bazy i backupu ze wskazanym odbiorcą (`faktura.prosto@gmail.com`); wyłącznik awaryjny KSeF (`KSEF_PAUSE_DISPATCH=true`); runbook awarii `docs/INCIDENT-RESPONSE.md` (kto reaguje, jak zatrzymać ruch, jak weryfikować po błędzie sieci, jak cofnąć wdrożenie). | **PASSED** | `scripts/tests/incident-response.test.cjs` |
| **8** | **Ostatnia kontrola rozliczeń** | Przetestowany cykl życia subskrypcji: aktywacja po `checkout.session.completed`, odnowienie, status `past_due` po nieudanej płatności, anulowanie, zgodność cen w kodzie i regulaminie (7 zł / 59 zł brutto). | **PASSED** | `scripts/tests/billing-lifecycle.test.cjs` |

---

## Szczegóły techniczne wdrożeń

### 1. Baza i kopie zapasowe
- **Migracja 015**: Tworzy indeks TTL `expiresAt` w kolekcji `AuthRateLimit` zapobiegający niekontrolowanemu wzrostowi bazy danych.
- **Szyfrowanie i izolacja**: `scripts/backup/run.mjs` używa uwierzytelnionego szyfrowania AES-256-GCM. Procedura przywracania uniemożliwia nadpisanie istniejącej bazy i wymaga czystego, wyizolowanego środowiska docelowego.
- **Alertowanie**: Skrypt `scripts/ops/check-health.mjs` weryfikuje wiek kopii zapasowych (próg alarmowy 36h) i wysyła powiadomienie JSON z adresem odbiorcy `faktura.prosto@gmail.com` na endpoint `MONITOR_ALERT_WEBHOOK_URL`.

### 2. KSeF (Krajowy System e-Faktur)
- **Integralność XML**: Każdy dokument FA(3) podlega rygorystycznej walidacji schematu XSD oraz sumy kontrolnej SHA-256 dokładnych bajtów XML.
- **Odporność na awarie sieciowe**: W przypadku zerwania gniazda HTTP lub braku odpowiedzi ze strony bramki MF, rekord nie jest wysyłany ponownie w ciemno. Zostaje oznaczony statusem `verify_needed`, zmuszając do odpytania statusu sesji w KSeF przed ewentualnym ponowieniem.
- **Blokada wyścigu (Anti-duplicate lock)**: `claimKsefTransmission` rzuca wyjątek HTTP 409 przy próbie równoległej transmisji tego samego dokumentu.

### 3. Ścieżka klienta i ochrona przed utratą danych
- **Auto-save**: Komponent `src/components/invoice/invoice-creator.tsx` posiada aktywny mechanizm zapisu szkicu w `localStorage` pod kluczem `fakturo_invoice_creator_draft`. Odświeżenie przeglądarki, powrót wstecz czy chwilowy brak sieci nie powoduje utraty wprowadzonych pozycji faktury — użytkownik otrzymuje czytelny banner z możliwością przywrócenia lub odrzucenia szkicu.

### 4. Zakupy, wydatki i OCR
- **Przegląd przed zapisem**: Automatyczne rozpoznawanie faktur zakupowych z XML i PDF wypełnia formularz wstępny, wymagając jednoznacznego zatwierdzenia kwot netto, VAT i brutto przez użytkownika.
- **Bezpieczeństwo**: Limit pliku 3MB, brak podwójnego księgowania tego samego wydatku, izolacja wielofirmowa (plik zakupowy jednej firmy jest niedostępny dla innych podmiotów).

### 5. Uprawnienia (RBAC), IDOR i MFA
- **Uprawnienia**: Właściciel (pełne), Księgowa (odczyt, płatności, eksport, brak wystawiania i zarządzania zespołem), Pracownik (wystawianie, brak eksportu i zarządzania), Podgląd (tylko odczyt).
- **IDOR**: Zapytania w API weryfikują przynależność użytkownika do podawanej firmy (`companyId`) na poziomie transakcji bazodanowej.
- **MFA (TOTP)**: Szyfrowanie sekretów TOTP w bazie algorytmem AES-256-GCM z kluczem uwiązanym kryptograficznie do identyfikatora użytkownika (`userA` nie odszyfruje sekretu `userB`).

### 6. Prawne i oferta
- **Dane operatora**: `MICHAŁ WYCZAŁEK-JAGIEŁŁO GEOMATIC`, ul. Ogórkowa 63S, 04-998 Warszawa, NIP: 7831574888. Kod `04-998` jest oficjalnym kodem pocztowym dla ul. Ogórkowej w Warszawie.
- **Regulamin i UOKiK**: § 5 precyzuje plan Free (do 5 faktur/miesięcznie darmowo) oraz plan Pro (7 zł brutto/miesięcznie, 59 zł brutto/rocznie). Zapewniona pełna przejrzystość subskrypcji: automatyczne odnawianie, 1-klik anulowanie w panelu lub w Portalu Stripe, 14-dniowe prawo odstąpienia od umowy dla konsumentów i PNPK.
- **Polityka Prywatności**: Retencja kopii zapasowych ustalona ściśle na 30 dni. Do listy podwykonawców i transferów dopisano Stripe Inc.

### 7. Monitorowanie i Incident Response
- **Circuit Breaker**: Ustawienie zmiennej środowiskowej `KSEF_PAUSE_DISPATCH=true` odcina bezpośrednią wysyłkę (`/api/ksef/send`) oraz worker kolejki (`/api/ksef/queue/process`), zwracając kod HTTP 503 i informując użytkowników o planowej przerwie technicznej.
- **Runbook**: Dokument `docs/INCIDENT-RESPONSE.md` zawiera szczegółowe instrukcje krok po kroku: kto reaguje, jak włączyć wyłącznik awaryjny, jak uzgadniać stan `verify_needed` bez podwójnej wysyłki, oraz procedurę natychmiastowego 1-klik rollbacku na Netlify i wycofania migracji bazy danych.

### 8. Rozliczenia Stripe
- **Obsługa webhooków**: `POST /api/webhooks/stripe` obsługuje `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` i `invoice.payment_succeeded`.
- **Synchronizacja**: Baza danych precyzyjnie odzwierciedla stan `active`, `past_due` (brak dostępu do Pro) oraz `canceled`.
