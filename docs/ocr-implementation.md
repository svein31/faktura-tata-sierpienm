# Koszty — OCR (etap 2)

Status: przygotowany kod pierwszego etapu; wybór dostawcy OCR i próba na jego prawdziwym API pozostają otwarte. Sekcje 3–7 nie są częścią tej zmiany.

## Konfiguracja

Nie ustawiono domyślnego dostawcy ani modelu. Bez konfiguracji API zwraca `503 OCR_NOT_CONFIGURED`, a UI umożliwia ręczne dodawanie kosztów. Opcjonalny adapter OpenAI Responses jest zaimplementowany i testowany na odpowiedziach kontrolowanych. Użycie go wymaga świadomego wyboru operatora; jeśli wybór padnie na Google Document AI lub Azure, trzeba dodać właściwy adapter przed uruchomieniem.

Sekrety serwera, nigdy `NEXT_PUBLIC_*`:

- `OCR_PROVIDER`: po zatwierdzeniu dostawcy `openai`.
- `OCR_API_KEY`: klucz projektu API.
- `OCR_MODEL`: wybrany model z obsługą Vision, PDF i Structured Outputs.

Przed przekazywaniem danych należy ustalić region przetwarzania, umowę powierzenia i uzupełnić listę podwykonawców RODO dla wybranego dostawcy. `store:false` nie zastępuje tych ustaleń i nie jest gwarancją zerowej retencji po stronie dostawcy.

Dokumentacja adaptera: https://developers.openai.com/api/docs/guides/file-inputs oraz https://developers.openai.com/api/docs/guides/structured-outputs.

## Baza danych

MongoDB musi działać jako replica set (np. Atlas), ponieważ zatwierdzenie korzysta z transakcji.

1. Wykonaj kopię bazy.
2. `npm run db:generate`
3. `npm run db:push`
4. `npm run db:migrate:ocr`

Prisma Migrate nie obsługuje MongoDB — nie uruchamiaj istniejących migracji SQL dla tej zmiany. Skrypt OCR można uruchomić ponownie. Zakłada on indeksy TTL `OcrDraft` i `OcrQuota` oraz unikalny częściowy indeks `Expense.ocrDocumentKey`. Bez tego ostatniego nie należy uruchamiać zatwierdzania produkcyjnego. Kolejne `db:push` należy zawsze zakończyć ponownym uruchomieniem skryptu migracji OCR, ponieważ Prisma nie opisuje indeksów TTL/partial.

Historyczne koszty pozostają bez `companyId`. Właściciel widzi je z oznaczeniem braku przypisania; nie przypisujemy ich automatycznie do wybranego profilu firmy. Nowe koszty ręczne i OCR są przypisane do bieżącej firmy. Dokumenty historyczne nie powinny wejść do przyszłego kalkulatora podatków bez jawnego przypisania.

## Zachowanie

- `GET /api/expenses/ocr?companyId=…`: konfiguracja i maksymalnie 50 nieprzeterminowanych odczytów do sprawdzenia.
- `POST /api/expenses/ocr?companyId=…`: multipart `file`, PDF/JPEG/PNG/WebP, 10 MB; weryfikacja sygnatury i limitu strumienia.
- `POST /api/expenses/ocr/:id/confirm?companyId=…`: zatwierdzone pola JSON; atomowe utworzenie kosztu i audytu. Powtórzenie zatwierdzenia tego samego odczytu zwraca istniejący koszt. Konflikt współbieżności zwraca 409 i pozwala ponowić żądanie.
- `DELETE /api/expenses/ocr/:id?companyId=…`: usunięcie niezatwierdzonego odczytu.

Pola: `contractorName`, `nip`, `number`, `issueDate`, `saleDate`, `dueDate`, `totalNet`, `totalVat`, `totalGross`, `currency`, `iban`, `lines`. Daty: `YYYY-MM-DD`; kwoty: liczby dziesiętne. Pozycja zawiera `name`, `quantity`, `unit`, `net`, `vat`, `gross`, `vatRate`; kwoty pozycji są sumami pozycji, nie cenami jednostkowymi.

Odczyt nie zgaduje brakujących kwot, waluty ani dat. Formularz umożliwia korektę wszystkich pól i pozycji przed zatwierdzeniem. Waliduje NIP, IBAN, daty, kwoty i sumy. Kwoty ujemne pozostają ujemne. Wyświetla osobno różne stawki VAT. Nie przelicza kwot walutowych bez kursu NBP; zapisuje walutę źródłową i nie zmienia istniejącego mechanizmu NBP/KSeF.

Odczyty wygasają po 7 dniach, limit wynosi 30 prób na firmę i godzinę zegarową. Usunięcie TTL jest asynchroniczne, ale API od razu odrzuca przeterminowane odczyty. Dokument źródłowy jest przesyłany wyłącznie w pamięci do dostawcy, nie jest zapisywany w publicznym katalogu ani logowany. To nie jest archiwum oryginalnych dokumentów księgowych. Lokalny podgląd jest dostępny do zamknięcia formularza.

Zapisany koszt zachowuje pola OCR po usunięciu tymczasowego odczytu. Prawo dostępu sprawdzane jest na każdym żądaniu według bieżącego członkostwa. Viewer ma tylko odczyt. Usunięcie konta usuwa jego odczyty przez relację, a eksport danych obejmuje aktywne odczyty.

## Weryfikacja

- `npm run test:ocr`: walidacja, adapter na kontrolowanych odpowiedziach, autoryzacja i idempotencja tras.
- `npm run test:fixes`: istniejące testy regresji.
- `npm run test:ocr:db`: izolowany MongoDB replica set, migracja uruchomiona dwa razy, TTL, unikalność, współbieżny limit, transakcja i kaskadowe usuwanie. Nie korzysta z produkcyjnego DATABASE_URL.
- `npm run typecheck`, `npm run build`.

Próba akceptacyjna z prawdziwym dostawcą powinna objąć PDF wielostronicowy, zdjęcie z Android/iOS, słaby kontrast, kilka stawek VAT, fakturę walutową i korektę. Do czasu tej próby OCR pozostaje niewłączone.
