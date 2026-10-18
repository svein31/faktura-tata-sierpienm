# Film produktowy FakturaProsto

Oryginalny film Full HD przedstawia rzeczywisty interfejs aplikacji na
tymczasowym koncie demonstracyjnym. Scenariusz obejmuje profil firmy, pierwszy
szkic, rzeczywisty eksport PDF, przygotowanie osobnej korekty, listę faktur oraz
terminarz. W filmie nie ma transmisji do KSeF, prawdziwych klientów ani płatności.

## Pliki publikowane

- `public/media/fakturaprosto-demo.mp4` — 1920 × 1080, 24 kl./s, H.264 + AAC,
  metadane MP4 na początku pliku (`faststart`), około 70 sekund.
- `public/media/fakturaprosto-demo.webp` — plakat 1600 × 900.
- `public/media/fakturaprosto-demo.pl.vtt` — polskie napisy WebVTT.
- `public/media/fakturaprosto-demo.transcript.txt` — pełny opis treści filmu.

Typografia korzysta z dołączonego DejaVu Sans (licencja:
`public/fonts/LICENSE-DejaVu.txt`). Wszystkie plansze, animacje i muzyka powstały
na potrzeby projektu. Podkład ambientowy jest syntetyzowany z fal sinusoidalnych;
nie wykorzystuje sampli, cudzych utworów, głosów ani usług AI. Film działa także
bez dźwięku. Właściwy interfejs aplikacji pochodzi ze zrzutów Playwright;
nie został wygenerowany przez model obrazów.

## Odtworzenie materiału

Wymagane: zależności projektu, Chromium, `ffmpeg`, `ffprobe`, `pdftoppm`
oraz lokalny MongoDB obsługiwany przez `mongodb-memory-server`. Najpierw
przygotuj zwykły produkcyjny build aplikacji (`npm run build`).

```bash
MONGOMS_SYSTEM_BINARY=/sciezka/do/mongod \
CHROMIUM_EXECUTABLE=/usr/bin/chromium \
node scripts/media/capture-product-demo.mjs /sciezka/do/zbudowanej/aplikacji

CHROMIUM_EXECUTABLE=/usr/bin/chromium \
node scripts/media/render-product-demo.mjs

node scripts/media/verify-product-demo.mjs
```

Pierwszy skrypt uruchamia osobny MongoDB replica set i Next.js na losowym porcie
loopback. Przyjmuje wyłącznie własną, nową bazę; nie korzysta z odziedziczonego
`DATABASE_URL`. Dostawcy zewnętrzni są zablokowani zarówno w serwerze, jak i w
przeglądarce. Rzeczywisty PDF pochodzi z lokalnego endpointu aplikacji.
Wszystkie procesy i baza tymczasowa są sprzątane po zakończeniu.

Scenariusz, teksty i czasy znajdują się w `demo-storyboard.json`. Pośrednie
zrzuty, plansze HTML/PNG, oryginalny WAV, manifesty i arkusz kontrolny trafiają
do ignorowanego przez Git katalogu `artifacts/product-demo/`.

Renderowanie weryfikuje kodeki, rozdzielczość, długość i limit 12 MiB. Manifest
zawiera SHA-256 filmu, rewizję aplikacji i wynik kontroli izolacji. Przed
publikacją należy obejrzeć arkusz `contact-sheet.jpg` oraz początek, środek
i koniec filmu.

Na stronie film powinien otrzymać źródło dopiero po działaniu użytkownika,
bez autoplay i automatycznego pobierania MP4. Plakat może być ładowany leniwie.
Odtwarzacz powinien udostępniać sterowanie klawiaturą, napisy i transkrypcję.
