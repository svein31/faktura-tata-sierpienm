# Dane i baza: zmiany przed uruchomieniem pilotażu

Aplikacja używa Next.js 15 App Router, Node.js, Prisma 6 oraz MongoDB. Dane zalogowanych użytkowników pozostają `Cache-Control: no-store`; nie są przechowywane we wspólnym cache CDN, service workera ani pamięci instancji.

## Wdrożone zmiany według efektu / wysiłku

| Zmiana | Kod | Efekt | Pomiar |
| --- | --- | --- | --- |
| Projekcja listy faktur w MongoDB; oryginały XML/UPO dopiero w szczegółach | `src/lib/invoice-summary.ts`, `/api/data`, `/api/invoices/search` | Brak przesyłania wszystkich archiwów DB → Node → telefon. Zachowane wszystkie dokumenty potrzebne finansom, kalendarzowi, edycji i harmonogramom | Rozmiar odpowiedzi Network; uruchomić `checkDataPerformance(db)` na izolowanej bazie |
| Formularz bez całej historii faktur | `/api/invoices/next-number`, `invoice-creator.tsx` | Numer proponuje mały autoryzowany endpoint; klon pobiera tylko wybrany dokument. Formularz działa w trybie bootstrap listy | Network: lista katalogów plus odpowiedź numeracji poniżej 200 B; test uprawnień, dat i wyboru serii |
| Jeden dokument na ekranie szczegółów | `src/app/(app)/invoices/[id]/page.tsx` | Wejście w jeden dokument nie pobiera wszystkich faktur konta; oryginalny XML/UPO i płatności są dostępne przez istniejący autoryzowany GET | Network powinien pokazać `/api/data?invoiceMode=list` oraz pojedynczy `/api/invoices/<id>` |
| Indeksowane połączenie kontrahenta przy wyszukiwaniu | `invoiceContractorSearchLookup()` | Konwersja lokalnego referencyjnego ID umożliwia indeks `_id` w kolekcji kontrahentów. Usunięto skan całej kolekcji dla każdego dokumentu | MongoDB `explain('executionStats')`: `indexesUsed: ['_id_']` |
| Agregacja licznika numeracji | `src/lib/invoice-numbering-server.ts` | Do Node wracają najwyżej dwa liczniki zamiast całej historii numerów i rezerwacji; transakcyjna rezerwacja pozostaje atomowa | Test porównuje dziewięć wzorów oraz istniejące rezerwacje z dotychczasowym formatowaniem |
| Równoległe zapytania i ponowne użycie wyników uprawnień | `/api/data`, `src/lib/company-scope.ts` | Trzy początkowe odczyty biegną równolegle; nie ma dwóch ponownych odczytów firm i członkostw | Profiler Mongo i czasy serwera w teście obciążenia |
| Retry konfliktów transakcji również dla ręcznego numeru | `/api/invoices` | Kolizja CAS limitu konta nie powoduje fałszywego błędu „numer zajęty”. Maks. osiem prób z ograniczonym odstępem | Rampa 20 równoczesnych wykonawców, unikalne numery, liczba utworzonych dokumentów i odpowiedzi 201 |
| Dziewięć dodatkowych indeksów | `scripts/migrations/018-performance-indexes.mjs` | Numery, sortowanie firmowej historii, powiązania kontrahentów, katalogi i powiadomienia. Indeksy addytywne, nieunikalne, bez usuwania dokumentów | Up/up/down/up oraz `explain`; rollout: `npm run db:migrate -- up` |

## Wynik testu zgodności na prawdziwej, izolowanej MongoDB

Fixture zawiera 72 uprawnione faktury, w tym dokumenty współdzielone, brakujące i jawnie puste stare pola, korekty, harmonogramy, różne waluty, zamrożone dane bankowe i archiwa. Test nie ogranicza historii do jednej strony. W fixture archiwum XML ma około 32 KB, a UPO około 8 KB; nie jest to pomiar produkcji.

- DB → serwer: **2 696 134 → 124 683 B** (spadek około **95,4%**).
- JSON do przeglądarki: **2 647 217 → 158 265 B** (spadek około **94,0%**).
- Gzip fixture: **około 1,44 MB → 4,67 KB**. Rzeczywisty zysk zależy od zawartości i kompresji dostawcy; te rozmiary nie stanowią obietnicy dla każdej firmy.
- Pełna zgodność pól edycji, wyliczeń z pozycji, sald CRM, harmonogramów i informacji o dostępności UPO. Oryginały pozostają niezmienione w bazie.
- Dziewięć wzorów numeracji i rezerwacje: łącznie **414 B** wyników agregacji; zbyt duży licznik jest odrzucany.
- Sprawdzenie numeru oraz powiązanego kontrahenta: każdy odczyt bada **1 z 201** przygotowanych rekordów dzięki indeksowi.

Czas TTFB zależy także od odległości od regionu serwera/bazy, uruchamiania funkcji i limitów Netlify. Wyniki lokalnych testów DB ani rozmiary JSON nie dowodzą progu TTFB poniżej 100 ms na produkcji. Końcowe wyniki ramp obciążenia znajdują się w raportach `scripts/performance/` i artefaktach pomiaru.

## Wzorzec gotowy do użycia

```ts
import { invoiceBootstrapScope, readInvoiceSummaries } from '@/lib/invoice-summary';

const invoices = await readInvoiceSummaries(
  prisma,
  invoiceBootstrapScope(user.id, authorisedCompanyIds),
);
// Invoice.hasUpo daje dostępność UPO bez pobierania archiwum.
// Archiwum konkretnego dokumentu: istniejący GET /api/invoices/<id>.
```

Nie wprowadzać bezwarunkowego `take: 100` na dane finansowe. Jeżeli przyszły ekran nie potrzebuje historii, korzysta z trybu listy i własnego paginowanego lub agregowanego endpointu.
