# SEO FakturaProsto — 3 października 2026

Podstawa: [przewodnik Google Search Central](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=pl), odczytany 3 października 2026. Celem zmian jest dostępność treści, ich zrozumienie i przydatność. Kod nie gwarantuje pozycji, indeksacji ani cytowania w odpowiedziach AI.

## Ustalenia z produkcji przed zmianami

- `https://fakturaprosto.pl/` zwraca 200, canonical wskazuje domenę bez `www`, robots meta pozwala indeksować.
- HTTP oraz `https://www.fakturaprosto.pl/` przekierowują 301 do HTTPS bez `www`.
- `robots.txt` udostępnia publiczne strony i wskazuje `sitemap.xml`.
- Nieistniejący poradnik `/faktury/nieistniejacy-poradnik` zwraca 404.
- Cennik jest sekcją strony głównej; brak odrębnego adresu odpowiadającego na pytania o plany i odnowienie.
- Artykuły wskazują wydawcę przez identyfikator, ale nie definiują jego danych na tej samej stronie. Brakuje spisów treści i adresów poszczególnych kroków.

Zrzuty AEOHub dostarczone przez użytkownika są wskazówką do audytu. Ich wyniki nie są potwierdzonym pomiarem pozycji Google ani liczby cytowań w modelach. Nie mamy dostępu do Search Console, analityki i metody pomiaru tego narzędzia.

## Zmiany

- Publiczna, renderowana na serwerze strona `/cennik`: własny tytuł, opis, canonical, ceny brutto, limit Free, opłata roczna, odnowienie, anulowanie i różnica między demo a kontem. Adres w middleware, sitemap i `llms.txt`.
- Linki ze strony głównej do praktycznych poradników, VAT, kalkulatora i porównań. Cennik i VAT w nawigacji publicznej. Wszystkie 39 publicznych stron SEO są osiągalne przez linki ze strony głównej.
- Spisy treści poradników z działającymi fragmentami URL. Kroki HowTo wskazują te same sekcje. Istniejące dane BreadcrumbList pozostają zachowane.
- Wspólne dane Organization, WebSite i SoftwareApplication. Oferty Free/Pro wskazują publiczny cennik; ceny Pro pochodzą z konfiguracji planów, dane cenowe określają brutto i okres rozliczenia. Artykuły definiują wydawcę i obraz. Bez fikcyjnych ocen lub opinii.
- Audyt sprawdza również nagłówek `X-Robots-Tag`, przekierowania, unikalność opisów, osiągalność przez linki, fragmenty, ceny ofert, 404, dokładne adresy w sitemap, duplikaty i dostęp robotów do stron oraz zasobów Next.js. Uruchomienie: `npm run test:seo -- http://127.0.0.1:3000` po uruchomieniu zbudowanej aplikacji.
- Audyt produkcji uwzględnia `/cennik` oraz `/vat`.

`llms.txt` to dodatkowa lista materiałów; nie jest wymogiem Google ani gwarancją użycia przez model. Dane HowTo/SoftwareApplication nie gwarantują rozszerzonych wyników.

## Weryfikacja lokalna

- `npm run build`, `npm run typecheck`, `npm run lint`: PASS.
- `npm run test:seo -- http://127.0.0.1:3000`: PASS, 39 publicznych adresów oraz kontrole błędów i stron prywatnych.
- `npm run test:integration`: PASS, odizolowana baza MongoDB, kontrakty SEO, API i scenariusze przeglądarkowe.
- Chromium: cennik, poradnik wystawienia faktury i porównanie iFirma w szerokościach 360 i 1280 px; jeden H1, działające odnośniki spisu treści, brak poziomego przepełnienia.
- `npm test`: 161/162 testów jednostkowych PASS (plus `test:fixes` PASS). Istniejący test `ksef-lifecycle.test.cjs` próbuje wywołać bramkę KSeF podczas `getAuthorisationChallenge` dla demo i kończy się `NETWORK_ERROR: fetch failed`. Plik testu i klient KSeF nie są zmieniane w tym zakresie. Integracyjne scenariusze KSeF demo przeszły.

## Pomiar po wdrożeniu

1. Zgłoś `https://fakturaprosto.pl/sitemap.xml` w zweryfikowanej usłudze Search Console i sprawdź nowy cennik narzędziem kontroli URL.
2. Porównuj kliknięcia, wyświetlenia, CTR, zapytania i indeksację dla Polski, osobno dla telefonów i komputerów, w kolejnych okresach 28 dni. Zmiany mogą wymagać tygodni lub miesięcy.
3. Core Web Vitals oceniaj z danych terenowych p75; czas odpowiedzi HTTP nie jest pomiarem LCP/INP.
4. Cytowania AI mierz na stałej liście pytań z datą, platformą, źródłami i powtórzeniami. Wynik AEOHub nie zastępuje tych obserwacji.
5. Rozwijaj treści na podstawie rzeczywistych pytań klientów oraz danych Search Console. Poradniki podatkowe weryfikuj z aktualnymi źródłami MF. Zdobywaj wzmianki i linki przez prawdziwe publikacje, współpracę i opisy zastosowania produktu.

Nie wykonano zgłoszenia do Search Console ani nie zmierzono wzrostu pozycji — brak połączenia z usługą i danych po wdrożeniu.
