# Google Analytics 4 — FakturaProsto

Strona korzysta z identyfikatora pomiaru **`G-4P218PFSBX`** dla **`https://fakturaprosto.pl`**. Jest to publiczny identyfikator strumienia GA4, a nie sekret. Nie należy dodawać drugiego tagu Google w HTML ani przez Google Tag Manager.

## Zakres integracji

- Tag Google ładuje się dopiero po aktualnej zgodzie na analitykę i wyłącznie na dozwolonych publicznych stronach. Odmowa nie wysyła także pomiaru bez cookies do Google.
- Dozwolone adresy to dokładne ścieżki oznaczone `index: true` w `src/lib/seo/onpage.json`; strony prawne i prywatne nie są automatycznie dodawane do pomiaru. Przeglądarki sygnalizujące Do Not Track lub Global Privacy Control również nie są mierzone.
- Wysyłane są odsłony stron publicznych. Panel, logowanie, rejestracja, konto i inne strony prywatne są wyłączone. Do GA4 nie są przekazywane dane faktur, kontrahentów, kont, płatności, e-maile, NIP-y ani kwoty.
- `page_location` zawiera publiczny adres bez parametrów zapytania i fragmentu. `page_referrer` zawiera tylko protokół i domenę, bez ścieżki, parametrów i fragmentu. Ta konfiguracja celowo nie zachowuje kampanii UTM.
- Google Signals, personalizacja reklam oraz `ad_storage`, `ad_user_data` i `ad_personalization` są wyłączone. Wybór „Akceptuj wszystkie” ich nie włącza.
- Cookies `_ga` i `_ga_4P218PFSBX` są ograniczone do bieżącego hosta, mają czas życia 30 dni i `cookie_update: false` — kolejne odsłony nie odnawiają terminu.
- Wycofanie zgody zatrzymuje kolejne zdarzenia i czyści cookies GA4 z przeglądarki. Nie usuwa automatycznie danych historycznych już przesłanych do Google.

Własny pomiar pilota i wydajności to odrębny mechanizm z własną retencją do 30 dni. Nie należy utożsamiać jej ani czasu życia cookies z retencją danych w usłudze Google Analytics.

## Ustawienia w Google Analytics

1. W **Administracja → Strumienie danych → strumień sieciowy** sprawdź adres `https://fakturaprosto.pl` i identyfikator `G-4P218PFSBX`.
2. **Wyłącz cały „Pomiar zaawansowany”** dla tego strumienia. Integracja samodzielnie wysyła dozwolone odsłony. Automatyczne odsłony historii przeglądarki, formularze, kliknięcia i inne pomiary mogłyby poszerzyć zakres zbieranych danych lub zliczać odsłony podwójnie.
3. W **Administracja → Zbieranie i modyfikowanie danych → Przechowywanie danych** ustaw retencję danych użytkowników i zdarzeń na **2 miesiące** oraz wyłącz **„Resetuj przy nowej aktywności”**. Zapisz ustawienia. Kod strony nie zmienia tych ustawień i nie potwierdza, że zostały zapisane. Retencja ta nie określa czasu przechowywania wszystkich raportów zbiorczych.
4. Pozostaw wyłączone **Google Signals** i funkcje reklamowe. Nie dodawaj dodatkowych tagów, pomiaru User-ID, danych użytkowników ani automatycznego zbierania danych z formularzy.

## Sprawdzenie po wdrożeniu produkcyjnym

1. Otwórz `https://fakturaprosto.pl` w nowym oknie prywatnym. Przed zgodą i po odrzuceniu analityki nie powinno być żądań do `googletagmanager.com` ani `google-analytics.com` związanych z tą integracją, ani cookies `_ga`.
2. Zaakceptuj analitykę, odwiedź stronę główną i inną publiczną stronę. W **Raporty → Czas rzeczywisty** sprawdź obecność odsłon. Aktualizacja może potrwać kilka minut; blokada reklam lub brak zgody uniemożliwi ten test.
3. W narzędziach deweloperskich przeglądarki, w zakładce **Network**, sprawdź żądania GA4 `collect`. Adres strony nie może mieć query ani hash, a odesłanie nie może mieć ścieżki. Wejście do logowania, rejestracji lub panelu nie może wysyłać kolejnej odsłony GA4.
4. Wycofaj zgodę przez **Ustawienia prywatności / Cookies**. Cookies `_ga` i `_ga_4P218PFSBX` powinny zniknąć, a kolejne przejścia po stronie nie powinny wysyłać zdarzeń GA4.
5. **DebugView** jest narzędziem diagnostycznym dla zdarzeń oznaczonych `debug_mode`. Standardowy ruch produkcyjny bez takiego oznaczenia sprawdzaj w raporcie czasu rzeczywistego. Jeśli potrzebujesz DebugView, użyj tymczasowo Google Analytics Debugger w osobnym profilu testowym, wyłącznie na publicznych stronach; po teście wyłącz rozszerzenie. Nie włączaj automatycznego pomiaru ani nie przekazuj danych prywatnych w ramach debugowania.

Statystyki zaczną obejmować dopiero ruch po wdrożeniu i po zgodzie odwiedzających. Nie da się odtworzyć wcześniejszych odwiedzin. Integracja celowo nie mierzy zdarzeń wewnątrz aplikacji ani płatności, więc GA4 nie jest raportem liczby faktur lub przychodów.

Informacje o przetwarzaniu danych przez Google: [polityka prywatności](https://policies.google.com/privacy?hl=pl), [warunki przetwarzania danych](https://business.safety.google/adsprocessorterms/) i [mechanizmy transferu danych](https://policies.google.com/privacy/frameworks?hl=pl).
