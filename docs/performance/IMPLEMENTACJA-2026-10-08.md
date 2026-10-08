# Wydajność FakturaProsto: implementacja i weryfikacja

Stack: Next.js 15.5 App Router, React 19, TypeScript, Tailwind, Prisma 6/MongoDB; produkcja na Netlify. Zmiany obejmują kod i testy, a publikacja czeka na odnowienie limitu Netlify. Wyniki lokalne nie potwierdzają opóźnień produkcyjnego CDN, zimnych funkcji ani rzeczywistych urządzeń.

## Priorytety według efektu / wysiłku

| Priorytet | Wdrożenie / gotowy kod | Zysk i koszt | Jak sprawdzić |
| --- | --- | --- | --- |
| 1 | Wyłączenie automatycznego prefetch dużych ekranów; auth CTA pobierane po zamiarze kliknięcia. `src/app/page.tsx`, `src/components/landing/auth-actions.tsx` | Niski koszt; wcześniej 168 KiB gzip początkowego JS, około 340 KiB po prefetch. Dokładne wyniki końcowe w raporcie pomiaru. Brak prefetch przy Save Data/2G | Network → JS, kolumna Initiator; zimny kontekst `web-lab.mjs` |
| 2 | Projekcja faktur w bazie, bez archiwów XML/UPO i wewnętrznej konfiguracji poczty. `src/lib/invoice-summary.ts`, `/api/data` | Duży efekt; w rzeczywistej izolowanej bazie z 72 dokumentami JSON 2 647 217 → 158 265 B, **−94%**. Zachowana zgodność kwot, pozycji, korekt, CRM i harmonogramów. Zysk zależy od archiwów klienta | Network response size; `checkDataPerformance(db)`; Mongo profiler |
| 3 | Lokalny zmienny WOFF2, wyłącznie potrzebne znaki, licencja OFL, `swap`, preload. `src/app/layout.tsx`, `src/app/fonts/`, `scripts/subset-ui-fonts.py` | 133 704 → 59 132 B, **−74 572 B / −56%**. Brak pobierania fontów podczas builda i zewnętrznego połączenia przeglądarki | Network → Font; `document.fonts.ready`; polskie litery/znaki walut; porównanie identycznych wygenerowanych plików |
| 4 | CSS inline w produkcyjnym Next 15. `next.config.mjs`: `experimental.inlineCss: true` | Niski koszt, usuwa oddzielny blokujący stylesheet i jego round trip; wcześniej 15,73 KiB gzip CSS. CSS nadal istnieje wewnątrz HTML, nie jest zerowym transferem | HTML nie ma blokujących linków CSS; Lighthouse render-blocking; porównanie rozmiaru całego HTML |
| 5 | Usunięcie Framer Motion z globalnych toastów; ustawienia cookies, command palette, onboarding, regulamin i Web Vitals ładowane według potrzeby. `src/components/toast.tsx`, `legal/`, `layout/deferred-overlays.tsx`, `public-deferred.tsx` | Ogranicza początkowy JS i koszt parsowania. Faktyczna redukcja sumy w raporcie; nie sumować tej oszczędności ponownie z prefetch. Obowiązkowy regulamin zachowuje blokadę i dostępny komunikat podczas pobierania | Lighthouse Treemap/Coverage; Performance → long tasks; pierwszy skrót Ctrl/Cmd+K, onboarding, akceptacja regulaminu |
| 6 | Formularz bez pełnej historii: `/api/invoices/next-number`, pojedynczy GET klonowanego/szczegółowego dokumentu | Mała odpowiedź propozycji numeru zamiast wszystkich numerów i archiwów. Debounce 100 ms, AbortController, stan ładowania/błędu; ostateczny numer nadal rezerwuje transakcja POST | Network formularza; regresje numeracji, klonowania, praw dostępu i odtwarzania szkicu |
| 7 | Indeksy, agregacja numeracji, indeksowany join kontrahenta; trzy odczyty bootstrapu równolegle i ponowne użycie zakresu uprawnień. Migracja `018`, `invoice-numbering-server.ts`, `company-scope.ts` | Sprawdzenie numeru i join badają po **1 z 201** rekordów fixture. Dziewięć wzorów numeracji zwraca łącznie 414 B zamiast historii. Czas w ms zależy od rozmiaru/regionu bazy | `explain('executionStats')`, profiler, rampa obciążenia; indeksy nie zmieniają praw dostępu |
| 8 | Retry rzeczywistych konfliktów transakcji zapisu; atomowa rezerwacja numerów zachowana. `/api/invoices` | Usuwa fałszywe 409 przy równoległych różnych numerach; ograniczone osiem prób z backoff. To poprawność pod obciążeniem, nie obietnica niższego czasu każdego zapisu | 20 równoległych wykonawców; liczby odpowiedzi 201 = faktur = rezerwacji |
| 9 | Worker z budżetem 20 s, deadline MF/SMTP/PDF i rezerwą poczty; ponowne użycie ważnej sesji właściwej firmy/środowiska. `/api/ksef/queue/process`, `src/lib/ksef/`, migracja `021` | Ponowna autoryzacja MF obejmowała wymagane **1,8 s oczekiwania** plus zapytania; ważna sesja usuwa tę powtórkę. Brak przejmowania zadania bez czasu na wykonanie | Test deadline/reuse, `/api/ops/queue-health`, wiek zaległości i rzeczywiste zakończenia/min |
| 10 | PDF/fontkit i generator XML dopiero przy odpowiednim załączniku. `src/lib/email/auto-send.ts`, `/api/invoices/send-email` | Zwykły status i konfiguracja nie wczytują PDF stacku. Potwierdzone w świeżym procesie; wielkość funkcji Netlify i cold-start w ms trzeba zmierzyć po wdrożeniu | Trace funkcji, memory/cold-start; test niezaładowanych modułów; załączniki i QR/UPO |
| 11 | Bezpieczny service worker: tylko hashowane publiczne `/_next/static` z `public, immutable`, maks. 80 wpisów. `public/sw.js`, `register-static-worker.ts` | Powtórne wizyty mogą obsługiwać JS/CSS/fonty z lokalnego cache. Nie pomaga pierwszej zimnej wizycie. API, HTML aplikacji, PDF i faktury nie są zapisywane | Application → Cache Storage; first/repeat view; brak prywatnych kluczy, test wylogowania i ogólna strona offline |
| 12 | Monitoring, kopie, ograniczenia poczty i pilotaż. `docs/OPS-PILOT.md`, migracje `019–021` | Gotowe narzędzia i sprawdzone syntetyczne wyścigi; redukcja ryzyka awarii/duplikatów. Aktywne alarmy, offsite i rzeczywisty pilotaż wymagają konfiguracji operatora | Sonda z niezależnego hosta, odtworzenie offsite, odebrany alarm, raport pilota |

## Konfiguracja już w repozytorium

```js
// next.config.mjs — Next 15.5
poweredByHeader: false,
compress: true, // gzip dla self-hosted Next; kodowanie edge sprawdzamy osobno
httpAgentOptions: { keepAlive: true },
experimental: { inlineCss: true },
images: { formats: ['image/avif', 'image/webp'], minimumCacheTTL: 86400 },
```

API ma `Cache-Control: private, no-store` i `Netlify-CDN-Cache-Control: private, no-store`. Ten drugi nagłówek chroni także ścieżki aplikacji, portale i uwierzytelnianie. Service worker ma `no-cache, max-age=0, must-revalidate`. Next nadaje hashowane nazwy i roczny immutable cache zasobom builda; Netlify obsługuje publiczne statyczne strony przez CDN i unieważnia pliki przy atomowym deployu. Nie dodano współdzielonego cache faktur, kont ani płatności, który mógłby ujawnić dane lub pokazać nieaktualne salda. Worker ponownie używa ważnych sesji MF zapisanych w bazie, wyłącznie w zakresie aktora, NIP i środowiska; klient MF ma też cache pamięciowy sesji i publicznych kluczy.

Publiczne treści są już SSG. Panel, uprawnienia i dane finansowe pozostają dynamiczne. SSR nie jest automatycznie szybszy od gotowego HTML. Wczesny skrypt motywu jest mały i zapobiega błyskowi złego motywu; pozostałe skrypty Next mają asynchroniczne ładowanie. Nie ma globalnego skryptu Google Analytics, widgetu ani ikon-fontów. Ikony i grafika hero są SVG/HTML: nie wynaleziono oszczędności AVIF dla nieistniejącego zdjęcia LCP.

Konfiguracja formatów obrazów jest gotowa dla przyszłych grafik. Przykład dla rzeczywistego pliku:

```tsx
import Image from 'next/image';
<Image src="/images/product.webp" alt="Podgląd wystawionej faktury"
  width={1200} height={800} sizes="(max-width: 768px) 100vw, 600px" />
// Next generuje srcset; poza pierwszym ekranem domyślnie lazy.
// Obraz LCP: zamiast lazy użyj priority, tylko jeżeli faktycznie jest LCP.
```

Nie dopisuj preconnect do Google Fonts po self-hostingu. Fonty preloadują się z tego samego originu, więc dodatkowe połączenie nie przynosi zysku. Prefetch kolejnego dużego ekranu uruchamia zamiar użytkownika, a nie każdy widoczny link. Skeletony/komunikaty ładowania chronią układ, klonowanie blokuje zapis do ukończenia pobrania. Zachowano istniejące optimistic UI dla kontrahentów i produktów z rollbackiem po błędzie oraz lokalny szkic formularza. Zapisu faktury, płatności i wysyłki nie oznaczamy jako udanych przed potwierdzeniem serwera.

## Wymagania zależne od Netlify

Brotli, HTTP/3 i 103 Early Hints należą do serwera/CDN, nie do kodu React. Sam wpis w nagłówku nie włącza protokołu ani kompresji. Po odnowieniu limitu sprawdź `Content-Encoding`, protokół w Network, TLS, cache HIT/MISS oraz wsparcie 103 po stronie hostingu. Nie zmieniono dostawcy ani planu i nie zadeklarowano niezweryfikowanych funkcji jako aktywnych. Jeśli dany mechanizm jest niedostępny, wdrożone SSG, cache hashowanych zasobów i preload pozostają działające.

TTFB przez internet ma dolną granicę narzuconą przez RTT, DNS/TLS i odległość od edge/bazy. Dynamiczne logowanie obejmuje bcrypt, baza — transakcje, a wysyłka — zewnętrzny serwer. Progu 100 ms nie można rzetelnie obiecać wszystkim żądaniom i lokalizacjom. Region MongoDB powinien być blisko regionu funkcji. W `DATABASE_URL` operator może ustawić np. `maxPoolSize=10&maxConnecting=2&maxIdleTimeMS=60000`; dopasuj te wartości do liczby instancji i limitu Atlas, testując kolejkę oczekujących. Nigdy nie kopiuj sekretnego URI do raportu. Native klient pilota ma osobny pool ograniczony do dwóch połączeń.

## Publikacja i dowody

Po odnowieniu limitu, po sprawdzeniu kopii i konfiguracji zmiennych na Netlify:

```sh
npm ci
npm run db:migrate -- up
npm run verify
```

Migracje `018–021` są addytywne. Nie zastępuj ich produkcyjnym `db push`: TTL i indeksy kolekcji raw należą do migracji. Zapisz rewizję `/api/health`, zweryfikuj nową stronę/cennik i wykonaj pomiary publicznych adresów. Backup/monitoring/pilot: konkretne zmienne i komendy w `../OPS-PILOT.md`.

## Pomiar efektu

Komendy, metody i ograniczenia znajdują się w `README.md`. Porównuj mediany trzech zimnych pomiarów tego samego narzędzia/profilem. Lighthouse simulated i CDP applied nie są wymiennymi wynikami.

```sh
node scripts/performance/web-lab.mjs --url http://127.0.0.1:3001 --runs 3 --output artifacts/performance/web-lab.json
node scripts/performance/lighthouse-lab.mjs --url http://127.0.0.1:3001 --runs 3 --output artifacts/performance/lighthouse-mobile.json
node scripts/performance/load-isolated.mjs --users 10 --invoices-per-user 300 --seconds 6 --concurrency 1,5,20 --output artifacts/performance/load-isolated.json
```

Lighthouse instaluje się osobno według instrukcji skryptu, bez produkcyjnej zależności. Generator obciążenia działa wyłącznie na nowej lokalnej MongoDB, z blokadą połączeń do dostawców. Nie testuj tysięcy żądań na produkcji objętej limitem Netlify. Na właściwym stagingu potrzebny jest dodatkowy test z ustaloną częstotliwością napływu, cold-start i limitami podobnymi do produkcji.

Po wdrożeniu: PageSpeed Insights oddziela lab od CrUX; WebPageTest dla Polski/telefonu pokazuje waterfall i first/repeat view; Chrome DevTools pokazuje transfery, Coverage i długie zadania. Dane Search Console/CrUX obejmują okres 28 dni i wymagają wystarczającego ruchu. Pierwszy mały pilotaż może nie mieć tej liczby danych.

Własny, opcjonalny pomiar Web Vitals używa oficjalnego `next/web-vitals`, wyłącznie po zgodzie. Raport pokazuje p75 rzeczywistych próbek; mniej niż 200 w ocenianej grupie oznacza brak wystarczających danych. Krótki test kliknięcia w laboratorium nie jest produkcyjnym INP. Wartości docelowe i wszystkie nieosiągnięte progi pozostają jawne w końcowym raporcie wyników.
