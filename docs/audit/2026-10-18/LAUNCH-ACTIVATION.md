# Przygotowanie premiery: pierwsze kroki, film i pomiar aktywacji

Data: 2026-10-18. Zakres: punkty 2, 3 i 5 z uzgodnionych prac przed premierą.

Stan raportu: kontrola przed publikacją. Zmiany zweryfikowano lokalnie, w tym w trzech silnikach przeglądarkowych. Ostateczny SHA i kontrola produkcji wymagają osobnego potwierdzenia po wdrożeniu.

## Pierwszy start użytkownika

- Dashboard prowadzi przez dane firmy, przygotowanie zapisanego szkicu i podgląd dokumentu. Stan wynika z zapisanych danych właściwej firmy, a nie z otwarcia przewodnika.
- Dane sprzedawcy obejmują poprawny format NIP, nazwę i adres. Link do zapisanego dokumentu pochodzi z autoryzowanego, ograniczonego do firmy odczytu. Koszty, proformy, korekty oraz dokumenty anulowane nie zaliczają pierwszego dokumentu sprzedaży.
- Pięcioetapowy przewodnik objaśnia kreator, podgląd, KSeF oraz ochronę konta. Demo, test i produkcja KSeF są jasno rozróżnione; zapisany token nie jest przedstawiany jako dowód poprawnego połączenia.
- Akcje respektują uprawnienia. Ukrycie sekcji i przeczytanie przewodnika są osobnymi preferencjami, przypisanymi do użytkownika i firmy; nie oznaczają ukończenia konfiguracji.

## Wygenerowany film produktowy

[Film MP4](../../../public/media/fakturaprosto-demo.mp4): **69,8 s, 1920 × 1080, 24 kl./s, H.264/AAC, 7 899 402 bajty**, MP4 faststart. Materiał wykorzystuje zrzuty rzeczywistego interfejsu na odizolowanych danych demonstracyjnych i rzeczywisty lokalny eksport PDF. Pokazuje profil firmy, szkic, podgląd PDF, osobną korektę, listę faktur i terminarz. Nie pokazuje rzeczywistej transmisji KSeF ani płatności.

Plansze, animacje i oryginalny podkład ambientowy powstały na potrzeby projektu; muzykę zsyntetyzowano bez zewnętrznych sampli. **Film nie ma lektora.** Towarzyszą mu plakat WebP, osiem polskich napisów WebVTT oraz transkrypcja. Scenariusz i odtwarzalny proces generowania opisano w [scripts/media/README.md](../../../scripts/media/README.md).

Sekcja strony głównej ładuje plakat leniwie, a źródło MP4 dodaje dopiero po kliknięciu odtwarzania. Odtwarzacz ma natywne sterowanie, polskie napisy, pobieranie i tekstowy opis filmu. Nie używa zewnętrznego odtwarzacza ani autoplay przed działaniem użytkownika.

## Pomiar skuteczności startu

Rozbudowano istniejący własny pomiar, bez tworzenia drugiego systemu analitycznego:

- Serwer rejestruje rejestrację, pierwszą wystawioną fakturę, potwierdzenie KSeF i aktywną subskrypcję Pro. Dodano brakujący przypadek wystawienia wcześniej zapisanego szkicu po zatwierdzeniu transakcji. Szkic i proforma nie oznaczają aktywacji; trial i dostęp gratisowy nie oznaczają płatnej konwersji.
- Czas zdarzenia jest przechwytywany przed odroczeniem zapisu przez `after()`; równoległe zapisy zachowują najwcześniejszą obserwację.
- Prywatny raport rozdziela surowe obserwacje od chronologicznego lejka, pokazuje konwersję, nieukończone kroki i średni czas od rejestracji do pierwszej wystawionej faktury. Pro pozostaje gałęzią po rejestracji. Stan aktywnej subskrypcji nie jest raportem rozliczonego przychodu.
- Raport pokazuje wszystkie 16 grup Web Vitals. Brak danych daje `p75: null`, a mniej niż 200 próbek — `insufficient_samples`. Późniejsza nawigacja SPA nie zmienia klasy pierwotnego dokumentu. Nie jest to pomiar gotowości każdej kolejnej trasy panelu.
- Obowiązuje aktualna, dobrowolna zgoda analityczna, DNT/GPC oraz 30-dniowa retencja. Wycofanie zgody usuwa pomiar z zabezpieczeniem przed opóźnionymi zapisami; błąd usunięcia można ponowić po powrocie sieci lub do okna.
- Własny pomiar nie zawiera URL-i, danych dokumentów, kwot, NIP-ów ani e-maili. GA4 pozostaje na dozwolonych publicznych stronach; kliknięcia rejestracji/demo nie są utożsamiane z kontami lub zakupami. Nie dodano publicznego API raportu.

## Wykonana walidacja

| Kontrola lokalna | Wynik |
| --- | --- |
| Pełne testy jednostkowe | 637/637 PASS, bez pominięć |
| Testy wymaganych poprawek | 7/7 PASS |
| Produkcyjny build, TypeScript, ESLint | PASS |
| Skupione testy pomiaru, tras biznesowych, prywatności GA i uprawnień faktur | 36/36 PASS; część pokrywa się z pełną pulą |
| Izolowany MongoDB replica set | PASS: rzeczywiste indeksy TTL, deduplikacja, chronologia, czas zdarzeń, p75 i wycofanie zgody przy równoległych zapisach |
| Odtworzenie filmu w Chromium | PASS: kodeki, faststart, przewijanie 3/35/67 s, osiem polskich napisów, brak błędów strony |
| Nowy UI: Chromium/WebKit/Firefox | PASS, 14 grup: responsywne plakaty bez pobrania MP4, odtwarzanie/napisy w Chromium i WebKit, przewodnik, zakres firmy, ukrywanie i zachowanie szkicu we wszystkich trzech silnikach |

Test UI zakończył się kodem 0, bez błędów `pageerror`, wywołań dostawców i zapisów finansowych. Pierwsze próby testu czekały na automatyczne napisy w WebKit, podczas gdy preferencja przeglądarki pozostawiała je wyłączone (`mode=disabled`, `readyState=0`). Końcowy test sprawdza także jawne wybranie polskich napisów w odtwarzaczu. W logu Firefox zachowano pojedynczy diagnostyczny komunikat konsoli `InvalidStateError: Navigated away from page`; nie jest to deklaracja całkowicie pustej konsoli.

Logi pełnej walidacji znajdują się w katalogu roboczym `/workspace/artifacts/launch-activation-20261018/`; dowody testów pomiaru w `/workspace/artifacts/launch-2026-10-18/metrics/`. Są to dowody lokalne, nie potwierdzenie konfiguracji usług produkcyjnych.

## Stan pomiaru na produkcji i uruchomienie

**Pomiar produkcyjny obecnie nie jest aktywny.** Kontrola z 2026-10-18 12:42 UTC, przed tym wydaniem, użyła aktualnej zgody analitycznej bez DNT/GPC: wizyta zwróciła HTTP 204, lecz nie utworzyła cookie `fakturo_pilot`; natychmiastowe wycofanie zwróciło 204 i nagłówek czyszczący cookie. Samo 204 nie dowodzi zapisu — tak odpowiada także wyłączony kolektor. Nie tworzono kont, faktur ani płatności.

Narzędzie Netlify MCP nadal żąda ponownego OAuth mimo odnowienia połączenia przez właściciela. Obecność poprawnego dedykowanego sekretu oraz zastosowanie produkcyjnej migracji 020 pozostają niepotwierdzone. Nie dodano fallbacku sekretu ani automatycznego uruchomienia pomiaru. Migracja 020 nie wykonuje się samoczynnie podczas zwykłego builda lub startu aplikacji.

Operator może zakończyć konfigurację bez przekazywania sekretów na czacie:

1. W menedżerze hostingu ustawić osobny, losowy `PILOT_METRICS_SECRET` o długości co najmniej 32 znaków dla produkcyjnych Functions, następnie wdrożyć konfigurację. Nie używać prefiksu `NEXT_PUBLIC_` ani klucza z repozytorium.
2. Z własnego chronionego serwera, istniejącym procesem `scripts/migrate-data.mjs`, zastosować migrację `020-pilot-metrics`. Potwierdzić TTL `expiresAt` / `expireAfterSeconds: 0` na `PilotMetric` i `PilotVital`; nie drukować poświadczeń bazy.
3. Powtórzyć zgodę i wycofanie w osobnym profilu przeglądarki: wymagane są utworzenie HttpOnly/Secure/SameSite=Lax cookie po opt-in oraz jego wygaśnięcie po skutecznym DELETE. Odrzucenie zgody nie może tworzyć cookie ani wysyłać próbek.
4. Uruchomić `node scripts/ops/pilot-report.mjs` z osobnym `PILOT_REPORT_DATABASE_URL` o uprawnieniach tylko do odczytu kolekcji pomiaru. Skrypt nie dziedziczy produkcyjnego `DATABASE_URL`; zachować wyłącznie zagregowany wynik. Rzeczywiste etapy biznesowe potwierdzić podczas legalnych działań uczestników pilota, bez fabrykowania konwersji.

Szczegóły retencji, ograniczeń i procedury znajdują się w [OPS-PILOT.md](../../OPS-PILOT.md). Osiągnięcie celu ładowania poniżej 4 s na wolniejszym telefonie ani wyników rzeczywistych konwersji nie jest przedmiotem tego raportu.
