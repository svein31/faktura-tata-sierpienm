# Zgłoszenia, diagnostyka, pierwsza faktura i personalizacja wyglądu

Data: 21 października 2026. Baza zmian: `1e59742`.

## Wdrożone zmiany

1. **Zgłoszenia w aplikacji.** Wspólny formularz w nagłówku, pomocy i ekranie błędu. Opis, kategoria i ograniczony kontekst techniczny; bez automatycznego załączania dokumentów, zrzutu i URL. Zapis musi zostać potwierdzony przez bazę. Ponowienie tego samego żądania nie tworzy drugiego zgłoszenia ani drugiego e-maila. Wspólny limiter działa między instancjami. Błąd zapisu zachowuje tekst formularza.
2. **Prywatny panel operatora `/help/reports`.** Wymaga aktualnej sesji, potwierdzonego e-maila i dokładnego adresu konta operatora. Właściciele pozostałych firm nie uzyskują tego dostępu przez swoją rolę. E-mail zawiera tylko numer, kategorię i odnośnik do panelu; opis pozostaje w aplikacji. Przerwana wysyłka jest oznaczana do sprawdzenia, bez automatycznego powtarzania niepewnego doręczenia.
3. **Diagnostyka przeglądarki i serwera.** Przechwytywanie `error`, `unhandledrejection`, granicy błędu i błędów Node/Next. Krótka kolejka w pamięci obejmuje także czas przed uruchomieniem efektów React. Rejestr zawiera stałą kategorię, skrót ramek aplikacji, wersję, klasę urządzenia/przeglądarki lub kategorię serwera, bez surowej treści błędu i prywatnego URL. Backend zachowuje istniejące bezpieczne logi i wynik żądania; zapis diagnostyczny wykonuje po odpowiedzi. Oczekiwane przekierowania, 401/403/404 frameworka i konflikty nie uruchamiają nowego alarmu. Nie filtrujemy React #418.
4. **Monitoring bez GitHub Actions.** Harmonogram Netlify co 5 minut sprawdza HTML i bazę, potwierdza awarię drugą próbą, obsługuje powiadomienia i raport błędów maksymalnie raz na godzinę. Konfiguracja poczty nie jest traktowana jako udany odbiór alarmu. Osobny runner i szablony systemd umożliwiają pomiar z hosta poza Netlify.
5. **Pomoc i komunikaty.** Usunięto obietnice „GUS w sekundę”, „wysyłka w 0.2 sekundy”, utożsamianie przyjęcia przez dostawcę z doręczeniem oraz mylenie referencji sesji KSeF z przyjętym dokumentem. Import bankowy wyjaśnia konieczność zatwierdzenia propozycji. Usunięto z pomocy klienta instrukcje zarządzania sekretami Netlify i powieloną wielką kartę e-maila. Instrukcje nie zmieniają działania integracji.
6. **Pierwsze minuty pracy.** Pulpit wskazuje następny krok na podstawie zapisanych danych. Przewodnik pozostaje dostępny, lecz nie otwiera się sam nad pracą. Import zakupu jest opcjonalną rozwijaną sekcją kreatora sprzedaży. Dobrowolny pomiar rozróżnia otwarcie kreatora, potwierdzony zapis szkicu i wystawienie dokumentu. Raport pokazuje przejścia i miejsca rezygnacji, z chronologią i sygnalizacją zbyt małej próby. DNT/GPC, zgoda i wycofanie pomiarów pozostają respektowane.
7. **Cztery rodzaje wykresu.** Kolumnowy (pionowo), słupkowy (poziomo), liniowy i kołowy — na pulpicie i w analityce. Wybór zapamiętywany osobno dla konta i firmy w przeglądarce. Wykres kołowy pokazuje udział miesięcy dla netto albo brutto, nie sumę obu wartości. Ujemne kwoty nie stają się dodatnimi wycinkami. Zera mają uczciwy pusty stan. Wszystkie widoki zachowują tabelę danych, walutę i obsługę klawiaturą. Pulpit nie pobiera Recharts.
8. **41 ustawień kolorów i 24 zakresy sekcji.** Powierzchnie, tekst, menu, przyciski, focus, statusy dokumentów/płatności, finanse i siedem serii. Własne kolory globalnie lub dla sekcji, niezależnie dla jasnego i ciemnego trybu. Paleta i HEX, wyszukiwanie, podgląd i reset pojedynczego tokenu, zakresu i całości. Dozwolone są wyłącznie zatwierdzone tokeny i HEX; nie wstrzykujemy dowolnego CSS. Automatyczne dopasowanie chroni kontrast, w tym tekst na przyciemnianych statusach. Dotychczasowe preferencje są zachowane. Ustawienia są lokalne dla przeglądarki i nie zmieniają PDF.
9. **Ikony i czytelność.** Jedna optyczna grubość Lucide 1.75, uporządkowane rozmiary nawigacji i neutralne oprawy. Ozdobne „iskierki” zastąpiono ikonami odpowiadającymi funkcjom. Usunięto zbędne osłabianie koloru tekstu. Symbol marki pozostaje bez zmian. Statusy płatności i wykresy korzystają ze wspólnych tokenów.
10. **Safari i dostępność.** Usunięto niemal zerowe globalne przejścia, które w WebKit potrafiły pozostawić stary dziedziczony kolor przy zmianie motywu. Przy ograniczonym ruchu przejścia są rzeczywiście wyłączone. Poprawiono semantykę regionu pierwszych kroków i nawigacji prawnej. Polityka prywatności opisuje nowe dane i retencję.

Logika faktur, podatków, PDF, KSeF, Stripe, subskrypcji i uprawnień do danych firm nie jest przebudowywana. Nowa reguła dostępu dotyczy wyłącznie panelu zgłoszeń operatora.

## Weryfikacja

Dowody wykonania: `/workspace/artifacts/product-improvements-20261021/`.

- Testy: 714/714 oraz osobne 7/7; bez pominięć i wyłączeń.
- Produkcyjny build, lint, typecheck i kontrola różnic Git.
- Pełna integracja z osobnym MongoDB: 143 trasy, 203 metody, 457 kontroli HTTP; dodatkowe audyty bezpieczeństwa, przepływów, uruchomienia, importu i księgowości oraz 15 scenariuszy UI.
- Osobny test funkcji: 12 grup, Chromium i WebKit, 16 skanów axe WCAG 2.2 AA bez wykrytych naruszeń, bez nieobsłużonych błędów JS. Rozmiary 390, 768, 1440 i 1920 px; wybór i odtworzenie wykresu, izolacja palety sekcji, reset, niskokontrastowe wejście, formularz zgłoszenia, focus/ESC i panel operatora.
- Rzeczywisty lokalny SMTP: pojedyncze powiadomienie mimo równoległych ponowień; pojedynczy raport mimo ponownego wywołania procesu. Opis i e-mail klienta nie trafiają do powiadomienia. Nie jest to dowód odbioru przez dostawcę produkcyjnego ani człowieka.
- Kontrolowana awaria agregacji w odizolowanym MongoDB: niezmieniona bezpieczna odpowiedź błędu i zgodny numer incydentu w logu oraz rejestrze serwera. Surowa treść żądania nie jest zapisywana do diagnostyki.
- Odmowa dostępu do panelu operatora dla innego konta i konta bez potwierdzonego adresu. Zwykła sesja nie zastępuje tokenu operatora zadań.
- Porównane zrzuty pulpitu, ustawień, formularza na desktopie/telefonie i widoku operatora. Sprawdzenie pakietów przeglądarki nie znalazło prywatnego adresu odbiorcy powiadomień.

### Ręczna ocena wskazań axe

Pozostało 6 grup `incomplete` dla kontrastu, a nie naruszeń: tekst w środku SVG oraz tekst w/za nakładającym się modalem. Oceniono zrzuty i pary kolorów. Na białej karcie tekst główny ma 15.01:1, pomocniczy 5.61:1; na ciemnej 13.89:1 i 6.84:1. Pod modalem treść jest zasłonięta i nie jest aktywnym elementem przepływu klawiatury. Własne palety mają osobne testy kontrastu. To kontrola wskazanych ekranów, nie certyfikat zgodności całej aplikacji.

## Granice potwierdzenia produkcji

- Po publikacji osobna kontrola musi potwierdzić dokładny commit, HTML, bazę, CSS i anonimowe granice nowych API. Jej wynik jest w `production.json`, poza repo.
- Brak poświadczeń operatora Netlify w bieżącym środowisku uniemożliwia odczytanie logów harmonogramu i aktywnej konfiguracji pomiarów. Obecność harmonogramu w kodzie i udany deploy nie dowodzą jego wykonania.
- Faktyczne odebranie alarmu na wskazanej skrzynce oraz uruchomienie dodatkowego monitora na hostingu poza Netlify wymagają osobnego potwierdzenia. Szablony nie są przedstawiane jako uruchomiona usługa zewnętrzna.
- Pierwotna sporadyczna hydratacja React #418 pozostaje bez ustalonej przyczyny; nowa diagnostyka ma umożliwić zebranie danych przy powtórzeniu. Nie ogłaszamy jej naprawienia na podstawie samego braku kolejnego zdarzenia.

Instrukcja operatora: [PRODUCT-OPERATIONS.md](../../PRODUCT-OPERATIONS.md).
