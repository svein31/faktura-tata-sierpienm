# Publiczne SEO/GEO FakturaProsto

## Architektura

- `/program-do-faktur` — oferta Free, uczciwy limit i demo.
- `/faktury`, `/poradnik-ksef`, `/vat` — filary z powiązanymi odpowiedziami.
- `/narzedzia` — kalkulatory liczące lokalnie w przeglądarce.
- Źródłem listy artykułów i odsyłaczy jest `src/lib/seo/content.ts`. Każdy nowy temat wymaga unikalnej odpowiedzi, konkretnego przykładu, wyjątku i źródła urzędowego; URL jest automatycznie dodawany do `sitemap.ts`.
- Middleware musi udostępniać te ścieżki bez sesji. Prywatny ekran `/ksef` pozostaje chroniony; publiczny poradnik używa `/poradnik-ksef`.

## Procedura publikacji

1. Sprawdź treść w źródle MF i ustaw prawdziwą datę przeglądu. `REVIEW_DATE` zmieniaj wyłącznie, jeśli treści faktycznie przejrzano; obecnie jest wspólna dla opublikowanych jednocześnie poradników.
2. Sprawdź, czy przykład liczbowy działa dla wartości granicznych, a wyjątek nie zmienia wyniku. Przy nowelizacji przepisu aktualizuj razem tekst i kalkulator.
3. Sprawdź pod niezalogowaną sesją: HTTP 200, widoczny tekst odpowiedzi w HTML, poprawny canonical, JSON-LD, linki do MF i brak przypadkowego `noindex`.
4. Sprawdź `/robots.txt` i `/sitemap.xml`, zgłoś mapę strony w Search Console i sprawdź indeksację reprezentatywnych adresów. Zmiany w samym repo nie zapewniają indeksacji.
5. Monitoruj w Search Console liczbę zaindeksowanych stron, zapytania, kliknięcia i CTR osobno dla filarów, poradników i narzędzi. Dodatkowo mierz wejścia do demo i rejestracje z tych stron przy poszanowaniu zgód na analitykę.

## Granice

- Nie przypisuj tekstów ekspertowi ani datom kontroli, które nie miały miejsca.
- Nie dodawaj ocen, opinii ani cen do schema.org bez ich rzeczywistej obecności na stronie.
- Próg 10 000 zł to przejściowa reguła w 2026 r. Przed 2027 r. sprawdź aktualne przepisy i zmień lub wyłącz strony z tą regułą; kalkulator po tym terminie pokazuje informację archiwalną.
- `FAQPage`, `HowTo` i `llms.txt` nie są warunkiem obecności w Google AI Overviews. Pierwszeństwo ma poprawny, dostępny tekst HTML z jasnym źródłem.
