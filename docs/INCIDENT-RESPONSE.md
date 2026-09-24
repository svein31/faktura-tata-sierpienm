# Runbook Reagowania na Awarie (Incident Response Plan)

Niniejszy dokument określa formalne procedury reagowania na incydenty i awarie techniczne w systemie **FakturaProsto** (https://fakturaprosto.pl).

---

## 1. Zespół reagowania i eskalacja (Who Responds)

| Rola | Odpowiedzialność | Kontakt |
|---|---|---|
| **Główny Inżynier / DevOps (On-Call)** | Analiza logów błędów, aktywacja wyłączników awaryjnych, rollback wdrożeń, odtwarzanie bazy z kopii zapasowych | Panel Netlify / Repozytorium GitHub |
| **Operator Serwisu / Administrator Danych** | Komunikacja z użytkownikami, powiadomienia organów (UOKiK / UODO / KSeF MF), obsługa zgłoszeń awarii | `faktura.prosto@gmail.com` |
| **Wsparcie Techniczne Klienta** | Odpowiedzi na zgłoszenia użytkowników w trakcie trwania incydentu | `faktura.prosto@gmail.com` |

### Kanały powiadamiania o awarii
- **Alert Webhook**: Skonfigurowany pod zmienną środowiskową `MONITOR_ALERT_WEBHOOK_URL`.
- **E-mail Operatora**: `faktura.prosto@gmail.com` (jawny odbiorca raportów i eskalacji w `scripts/ops/check-health.mjs`).
- **Log Sink**: Strumień stderr z JSON-owymi zdarzeniami `application_error` zawierającymi fingerprinty incydentów.

---

## 2. Emergency Circuit Breaker (Wyłącznik awaryjny KSeF)

W razie wykrycia awarii bramki produkcyjnej KSeF Ministerstwa Finansów, masowych błędów odrzucania sesji lub zatoru w kolejce asynchronicznej, należy natychmiast odciąć ruch do KSeF za pomocą wyłącznika awaryjnego.

### Zmienna środowiskowa
```env
KSEF_PAUSE_DISPATCH=true
```

### Instrukcja aktywacji
1. **Netlify Dashboard**:
   - Przejdź do: `Site configuration` → `Environment variables`.
   - Dodaj lub zaktualizuj zmienną `KSEF_PAUSE_DISPATCH` o wartości `true`.
   - Zapisz zmiany i kliknij `Trigger deploy` → `Clear cache and deploy site` (lub zmiana zadziała w kolejnych wywołaniach Serverless Functions).
2. **Serwer dedykowany / środowisko lokalne**:
   - W pliku środowiskowym `/etc/fakturo/runtime.env` ustaw `KSEF_PAUSE_DISPATCH=true`.
   - Zrestartuj proces aplikacji (`systemctl restart fakturo` lub `pm2 reload fakturo`).

### Efekt działania
- Każde wywołanie bezpośredniej wysyłki `POST /api/ksef/send` zostaje natychmiast odrzucone z kodem **HTTP 503 Service Unavailable** i kodem błędu `KSEF_DISPATCH_PAUSED`.
- Każde wywołanie workera kolejki `POST /api/ksef/queue/process` zwraca **HTTP 503** z flagą `paused: true` bez pobierania nowych zadań i bez blokowania rekordów.
- Użytkownicy widzą w interfejsie czytelny komunikat o planowej przerwie technicznej bramki KSeF bez utraty danych dokumentu.

---

## 3. Postępowanie z niepewnymi transmisjami KSeF (`verify_needed`)

### ZASADA BEZWZGLĘDNA: Zakaz ponownej wysyłki w ciemno (No Blind Resend)
Jeśli podczas wysyłki faktury do KSeF nastąpiło zerwanie połączenia sieciowego (dropped socket, timeout HTTP 504 bramki MF) lub zadanie w kolejce utraciło dzierżawę blokady (`lockedUntil < now` w stanie `processing`), rekord otrzymuje status:
- **`ksefStatus: "verify_needed"`**
- **`queueTask.status: "verify_needed"`**

**Nigdy nie wolno wysyłać tego samego dokumentu powtórnie bez jednoznacznego uzgodnienia stanu w KSeF!** Podwójna wysyłka spowoduje nadanie dwóch różnych oficjalnych numerów KSeF dla tej samej faktury, co rodzi poważne konsekwencje karno-skarbowe dla wystawcy.

### Procedura uzgadniania stanu (Reconciliation)
1. **Identyfikacja referencji sesji**:
   - Odczytaj z bazy danych lub logu audytu numer referencyjny sesji KSeF (`ksefSessionReferenceNumber`).
2. **Weryfikacja w bramce MF**:
   - Uruchom procedurę odpytania statusu sesji w KSeF dla danego numeru referencyjnego.
3. **Decyzja na podstawie odpowiedzi MF**:
   - **Kod 200 (Dokument przyjęty)**: Pobierz oficjalny numer KSeF (`ksefNumber`) oraz plik UPO XML. Zaktualizuj stan faktury na `accepted`.
   - **Kod 400/422 (Dokument jednoznacznie odrzucony)**: Zapisz powód odrzucenia z MF, zaktualizuj stan na `rejected` i odblokuj możliwość edycji/ponownej wysyłki po poprawieniu błędu.
   - **Brak śladu sesji w MF**: Dopiero po potwierdzeniu przez system MF, że sesja nie została zarejestrowana, administrator lub użytkownik może ponownie uruchomić transmisję.

---

## 4. Procedura wycofania wdrożenia (Deployment Rollback)

### Rollback Aplikacji (Frontend / Serverless) na Netlify
1. Otwórz panel zarządzania [Netlify Dashboard](https://app.netlify.com).
2. Przejdź do właściwej witryny (np. `fakturo` / `faktura-tata-sierpienm`).
3. W menu głównym kliknij **Deploys**.
4. Znajdź na liście ostatnie w 100% stabilne wdrożenie (oznaczone kolorem zielonym, poprzedzające awarię).
5. Kliknij na to wdrożenie, aby wejść w jego szczegóły.
6. Kliknij przycisk **"Publish deploy"**.
7. Zmiana wchodzi w życie natychmiast na poziomie globalnej sieci CDN w czasie poniżej 5 sekund (1-click rollback bez konieczności ponownej kompilacji kodu).

### Rollback Bazy Danych
W przypadku, gdy awaria wynika z nieprawidłowej migracji schematu bazy danych:
1. Sprawdź aktualny stan migracji:
   ```bash
   node scripts/db/migrate.mjs status
   ```
2. Cofnij ostatnią migrację przy użyciu dedykowanego skryptu wycofania:
   ```bash
   node scripts/db/migrate.mjs down
   ```
3. W sytuacji krytycznej (uszkodzenie integralności danych produkcyjnych), odtwórz bazę z najnowszej zaszyfrowanej kopii zapasowej do odizolowanej bazy docelowej:
   ```bash
   RESTORE_DATABASE_URL="mongodb://..." node scripts/backup/run.mjs restore /secure/path/backup.enc isolated_db_name
   ```
   *Uwaga: Zawsze weryfikuj odtworzone dane w środowisku izolowanym przed przełączeniem ruchu produkcyjnego.*

---

## 5. Monitorowanie stanu i procedury sprawdzające

1. **Sonda operacyjna (`scripts/ops/check-health.mjs`)**:
   - Regularnie weryfikuje:
     * Dostępność endpointu `/api/health`,
     * Połączenie z bazą danych MongoDB,
     * Świeżość kopii zapasowych (alarm przy wieku > 36h),
     * Dostępność tabeli kursów NBP,
     * Osiągalność bramki KSeF.
2. **Kolejka KSeF (`scripts/ops/check-queue.mjs`)**:
   - Monitoruje zadania w stanie `failed`, `verify_needed` oraz zadania wiszące dłużej niż 15 minut.

---

## 6. Procedura powypadkowa (Postmortem)

Po zażegnaniu każdego incydentu o priorytecie P1/P2:
1. Sporządź raport incydentu zawierający:
   - Dokładną oś czasu (Time-to-Detect, Time-to-Acknowledge, Time-to-Resolve),
   - Przyczynę źródłową (Root Cause Analysis - RCA),
   - Zakres dotkniętych użytkowników i faktur,
   - Działania zapobiegawcze z terminem wdrożenia.
2. Jeśli doszło do naruszenia dostępności danych lub ochrony prywatności, poinformuj Operatora w celu oceny konieczności zgłoszenia do Prezesa UODO (w terminie 72h).
