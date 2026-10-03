# Zgłoszenia ze screenów: kreator, PDF, rachunki i KSeF

Baza: `main` 12dbc31 (po PR #36). Przejrzano pięć screenów rozmowy i porównano wskazane przepływy z aktualnym kodem. Wcześniejszy przegląd commitów i szerszego zakresu SaaS opisano w `2026-10-02-continuation.md`. Ten pakiet zachowuje wcześniejsze zmiany, w tym usunięcie SMS.

## Przyczyny i poprawki

| Zgłoszenie | Ustalona przyczyna / ograniczenie | Zmiana |
| --- | --- | --- |
| Zmienione daty, ale stare dane w PDF | Kreator przypisywał podglądowi ID zapisanej faktury; wspólny eksport otwierał archiwalny endpoint zamiast danych formularza. | Jawny tryb podglądu PDF używa aktualnych dat i wybranego rachunku; widok zapisanego dokumentu nadal korzysta z wersjonowanego PDF serwera. Test API sprawdza nowe daty w wersji wydruku i niezmienioną wcześniejszą wersję. |
| „Nowa faktura” nadal wypełniona tym samym nabywcą | Linki rozpoczynające dokument nie usuwały `draftInvoice`, a React zachowywał lokalny formularz na tej samej trasie. Edycja mogła dodatkowo zapisywać dane pod kluczem nowego szkicu. | Jawne rozpoczęcie nowego dokumentu zeruje tożsamość edycji i zmienia sesję kreatora. Formularz jest ponownie inicjalizowany, także bez zmiany URL. Edycja nie nadpisuje lokalnego szkicu nowej faktury. Kopiowanie/edycja pozostają osobnymi akcjami; zapis przed ponowieniem transportu zachowuje tożsamość dokumentu. |
| Zapisany wzór numeracji nie odpowiada nowej fakturze | Stary formularz mógł nadal zawierać numer poprzedniego dokumentu. | Nowy formularz nie przenosi numeru, pyta o tryb i wylicza propozycję z aktualnego wzoru firmy. Numery już wystawionych dokumentów pozostają zamrożone. |
| Niejasne konto „35…” | Bez odczytu konfiguracji konkretnej firmy nie można ustalić właściciela konta na podstawie samego screena. UI mieszało oznaczenia domyślnego, głównego i historycznie zapisanego rachunku; pole odbiorcy odczytywało nieistniejącą właściwość `beneficiary`. | Formularz pokazuje pełny numer, odbiorcę, walutę, bank i źródło rachunku oraz link do Ustawienia / Rachunki i waluty. Podgląd i HTML odczytują `beneficiaryName`; główny rachunek ma jawny snapshot podglądu. Konflikty z innymi firmami są odfiltrowane również w kreatorze. Test wybiera domyślny rachunek zamiast głównego i sprawdza snapshot zapisany przez serwer. |
| Puste miejsce przy banku na PDF | Nazwa banku jest opcjonalna i nie występuje w starszym głównym polu profilu. Nie wolno jej zgadywać ani wpisywać obcego rachunku. | UI wskazuje brak nazwy i miejsce jej konfiguracji; PDF pokazuje „nie podano”. Nowa wersja układu nie nadpisuje archiwalnych PDF. |
| Pola/VAT znikają przy podglądzie obok formularza | Tabela o minimalnej szerokości 940 px przełączała się na podstawie szerokości okna, choć kolumna formularza miała znacznie mniej miejsca. | Edytor przełącza karty/tabelę według szerokości własnego kontenera. Pola mają etykiety i pozostają czytelne także na podzielonym ekranie desktopowym. Kontrola na 320 px z rzeczywistym formatem IBAN wykryła także rozszerzanie kart centrum KSeF; rachunek i dane podmiotu mają teraz układ z łamaniem tekstu. |
| W KSeF faktura istnieje, aplikacja zmienia status dopiero po ręcznym odświeżeniu | Lista i szczegóły nie odpytywały statusu. Worker pomijał `verify_needed`. Po przyjęciu bez UPO późniejszy status nie mógł dopisać UPO. | Widoczne dokumenty są automatycznie odświeżane z ograniczeniem częstotliwości i wstrzymaniem w tle. Worker sprawdza znane referencje i opóźnione UPO, ponownie sprawdzając uprawnienia autora. Weryfikacja nie wysyła i nie kolejkuje dokumentu ponownie. |
| Zielony sukces/UPO mimo niepełnego potwierdzenia | Oś czasu traktowała sam numer KSeF jako pobrane UPO. | Numer potwierdza przyjęcie; UPO wymaga faktycznie zapisanego XML. Widok jasno rozróżnia przetwarzanie, przyjęcie i pobranie UPO oraz blokuje przyciski ponownej wysyłki podczas przetwarzania. Karta transmisji używa tego samego stanu co oś czasu, więc nie twierdzi już, że przesłany dokument nie został wysłany. |
| Formularz pozwala zmienić daty przyjętej faktury, lecz zapis pomija zmiany | Serwer dopuszczał notatki i akceptację, ignorując pozostałe przesłane dane. | Przyjęta faktura ma osobny edytor notatek. Próba zmiany dat, numeru, pozycji lub rachunku przez API kończy się jawnym 409, a nie pozornym sukcesem. |

## Weryfikacja

- Build produkcyjny, TypeScript i ESLint.
- Testy jednostkowe: reset na tej samej trasie, zachowanie tożsamości po zapisie przed transportem, bieżące dane PDF, odbiorca rachunku, rozróżnienie numeru/UPO, chronione pola, potwierdzanie niepewnej wysyłki, późniejsze UPO, stan opłacenia, brak sesji, brak ponownej transmisji oraz cofnięte uprawnienia autora.
- Izolowany MongoDB i HTTP: zapis nowych dat w najnowszym snapshotcie PDF, zachowanie starych bajtów PDF, odmowa zmiany dat zarejestrowanej faktury, zapis notatek, regresja istniejących kontroli produktu i bezpieczeństwa.
- Przeglądarka: edycja dat i rachunku, otwarcie podglądu PDF, zapis dokumentu, czysty kreator bez ponownego logowania, numeracja firmy, czytelny VAT przy podglądzie na desktopie, reset na telefonie, automatyczne przyjęcie/UPO i edycja notatek.

Wyniki i dokładne SHA w PR oraz powiązanym Verify. Nowe scenariusze używają syntetycznych firm i dokumentów. Symulowane odpowiedzi statusu MF testują UI; nie stanowią próby produkcyjnej wysyłki.

## Granice działania

Nie zmieniono produkcyjnych rachunków, danych faktur ani historycznych rozliczeń. Przed użyciem konkretnego rachunku należy wybrać prawidłowy rachunek w ustawieniach danej firmy; na podstawie screenów nie można ustalić, jaki numer powinien zastąpić „35…”. Historyczny snapshot faktury jest oznaczony jako historyczny i nie zmienia się automatycznie wraz z domyślnym kontem firmy.

Automatyczna weryfikacja KSeF potrzebuje zapisanej referencji wysyłki i aktywnej sesji dla właściwego NIP/środowiska. Bez referencji po przerwanym transporcie aplikacja nadal wymaga ręcznej weryfikacji w KSeF i nie ryzykuje duplikatu. Worker wymaga istniejącej konfiguracji harmonogramu/sekretu Netlify. Zmiana nie daje podstaw do deklarowania poprawności produkcyjnego tokena lub certyfikacji przez MF.
