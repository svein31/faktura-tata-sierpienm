# Audyt SEO/GEO FakturaProsto — 3 października 2026

Audyt obejmuje publiczne treści, kod, linki, indeksowalność i testy funkcji aplikacji. Odbiorcy: JDG, małe firmy, freelancerzy i biura rachunkowe. Pytania priorytetowe dotyczą wystawienia faktury, ceny programu, limitu Free, statusów KSeF i wyboru narzędzia.

## Ocena gotowości GEO: 82/100

To redakcyjna ocena lokalnej wersji według instrukcji `geo/references/scorecard.md`, a nie zmierzona widoczność AI, ranking Google lub wynik AEOHub. Nie mamy danych Search Console, historii SERP ani wykonanych prób cytowania w modelach. Ocena nie dowodzi, że aktualna produkcja wykorzystuje ten kod.

| Kategoria | Punkty | Uzasadnienie |
| --- | --- | --- |
| Bezpośrednie odpowiedzi | 18/20 | Odpowiedź na początku, konkretne ceny i limity, pytania w nagłówkach. |
| Autorytet i źródła | 15/20 | MF i źródła producentów, zweryfikowane liczby; brak niezależnych studiów przypadku i recenzji użytkowników. |
| Struktura | 19/20 | Spisy treści, tabele, krótkie akapity, źródła przy nowych porównaniach. |
| Głębokość tematu | 16/20 | Przykłady, ograniczenia, stan wysyłki, plan i okres opłaty; część porównań wymaga dalszej weryfikacji taryf. |
| Technika | 14/20 | SSR, metadane i JSON-LD; brak terenowego pomiaru Core Web Vitals i potwierdzenia nowej wersji na produkcji. |

Szczegółowe składowe po 5 punktów: odpowiedzi 5+4+5+4; źródła 5+4+3+3; struktura 5+5+4+5; głębokość 4+5+4+3; technika 5+5+4+0. Ostatnie 0 oznacza brak dowodu z danych terenowych, a nie pomiar złej wydajności.

## Ustalenia i naprawy

### Błędy funkcjonalne

1. `getAuthorisationChallenge` w demo KSeF kontaktował bramkę HTTP, mimo że logowanie, wysyłka i status demo były symulowane. Demo zwraca teraz lokalny, losowy challenge i spójny znacznik czasu. Test weryfikuje brak HTTP dla demo oraz zachowanie HTTP dla testu i produkcji.
2. Nieznany publiczny URL zwracał 307 do logowania. Teraz trafia do obsługi 404 z informacją, linkami do pomocy i `noindex`. Wszystkie rzeczywiste strony panelu zachowują bramkę logowania i weryfikację sesji w AppLayout.
3. Lista powiązanych tematów odrzucała huby, kalkulatory i cennik, ponieważ szukała wyłącznie artykułów. Przywrócono linki do wszystkich zdefiniowanych materiałów. Audyt sprawdza każdy wskazany link w tej nawigacji.
4. Smoke test produkcji mógł zaliczyć starszy build. Endpoint zdrowia ujawnia teraz niesekretny SHA źródeł zamrożony podczas budowania. Test wymaga zgodności z wdrażanym commitem, dostępności nowych stron i prawdziwego 404.

### Bezpośrednie odpowiedzi i struktura

- Dodano porównania FakturaProsto z Fakturowo oraz Faktura.pl, wskazanymi na zrzutach użytkownika. Rozróżniono konto darmowe, demo, okres testowy, abonament i usługę księgową.
- Fakturowo: źródło podaje 15 zł brutto za miesiąc, 100 zł za 12 miesięcy, 100 dni testu i odrębne dodatki. Ujawniono także korzystniejszy limit nieopłaconego konta konkurenta: 10 dokumentów miesięcznie wobec 5 faktur Free w FakturaProsto.
- Faktura.pl: opisano BASIC, OPTIMUM i PREMIUM, 30-dniowy test i obecność wariantu DARMOWY. Nie przypisano wszystkim planom funkcji PREMIUM ani nie zgadywano ceny zależnej od wybranego pakietu i okresu.
- Rozszerzono pomoc do ośmiu pytań z odpowiedziami i linkami: cena, demo, status, nieznana wysyłka, korekta, VAT/KSeF, kalkulator i instrukcja.
- Artykuły używają `article`, wskazują redakcję przy tytule i mają `time` zgodny z datą w JSON-LD. Nowe porównania mają źródła obok konkretnych twierdzeń. Nie zmieniano historycznych dat poradników tylko z powodu aktualizacji szablonu.

### Źródła i ograniczenia

Źródła oraz odczytane fakty zapisano w `source-evidence.json`. Nie kopiowano opinii konkurentów i nie tworzono fikcyjnych rekomendacji, ocen czy cytatów ekspertów. Porównania ujawniają, że przygotowała je redakcja producenta FakturaProsto.

Oficjalna strona MF o progu 10 000 zł zwracała 200 i pusty tytuł HTML; treść strony zawierała właściwe pytania i zasady. Pusty tytuł nie był powodem do uznania źródła za niedostępne. Z kolei produkcyjne `/cennik` zwracało 200 dopiero po przekierowaniu do `/login`, więc nie potwierdzało publicznej dostępności cennika.

## Weryfikacja

- Build, TypeScript i lint: PASS.
- Testy jednostkowe: 166/166 PASS, dodatkowo `test:fixes` PASS.
- Kontrakty SEO: 41 publicznych stron PASS, z kontrolą źródeł, powiązanych tematów, dat, sitemap, 404 i logowania do wszystkich rzeczywistych ekranów panelu.
- Audyt API: 128 tras, 185 metod, 431 kontroli bez błędów na odizolowanych MongoDB i SMTP.
- Testy przeglądarkowe obejmują widoki panelu, wystawianie i szkice, PDF, e-mail, KSeF demo, płatności, korekty, oferty/zlecenia, kalkulatory i współpracę z księgową.
- Kontrola statycznych odnośników w kodzie: brak literalnych linków do nieistniejących stron.
- Rozszerzony audyt mobilny Chromium/WebKit: 574 kontrole układu, 0 błędnych ekranów; nawigacja, wybór firmy, wyszukiwanie, dialog bankowy i szkic faktury PASS w obu silnikach.

Testy nie wykonują rzeczywistych płatności, wysyłek do produkcyjnego MF ani wiadomości do klientów. Nie potwierdzają dostępności usług zewnętrznych i poprawności konfiguracji sekretów produkcji.

## Pomiar oraz publikacja

Google [AI features](https://developers.google.com/search/docs/appearance/ai-features) wyjaśnia, że AI Overviews i AI Mode nie wymagają dodatkowej techniki ani specjalnego schema. Podstawą pozostaje dostępność indeksowania i przydatna treść. `llms.txt` jest dodatkową listą materiałów; nie gwarantuje cytowania. Zgoda robotowi szkolącemu model nie jest tym samym co indeksowanie przez wyszukiwarkę.

Po opublikowaniu sprawdź `/api/health`: `revision` musi odpowiadać SHA wdrożenia. Dopiero potem zgłoś sitemap w Search Console, skontroluj nowe URL-e i porównuj kliknięcia, wyświetlenia, CTR oraz zapytania w kolejnych okresach 28 dni. Mierz cytowania AI na tej samej liście pytań z datą, platformą i linkami źródłowymi; istniejący koszyk pytań znajduje się w `docs/seo/2026-09-30/ai-prompts.json`.

W chwili audytu poprzednia zmiana na main nie była widoczna na produkcyjnym cenniku. Użytkownik potwierdził hosting w Netlify i wyczerpany limit, przez który nowe commity chwilowo nie są wdrażane. Po przywróceniu limitu trzeba uruchomić wdrożenie aktualnego main i potwierdzić jego revision. Zapis na main i publikacja produkcyjnego builda są odrębnymi stanami.
