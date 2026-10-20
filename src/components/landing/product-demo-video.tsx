"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Film, Play } from "lucide-react";

const media = "/media/fakturaprosto-demo";

/** No video source or third-party player is loaded before the visitor asks. */
export function ProductDemoVideo() {
  const [opened, setOpened] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const video = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!opened) return;
    video.current?.focus();
    // Native controls remain available if the browser requires another press.
    void video.current?.play().catch(() => {});
  }, [opened]);

  return (
    <section id="film" aria-labelledby="product-film-heading" className="scroll-mt-24 px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:mb-8 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Film aria-hidden="true" className="size-4" /> Zobacz aplikację w praktyce</p>
            <h2 id="product-film-heading" className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Od pierwszego szkicu do porządku w finansach.</h2>
            <p id="product-film-description" className="mt-3 text-sm leading-relaxed text-muted-foreground">Poznaj przygotowanie faktury, podgląd PDF, korekty i terminarz. Rzeczywisty interfejs, dane demonstracyjne.</p>
          </div>
          <span className="self-start rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-muted-foreground lg:self-auto">1 min 10 s · Full HD · Polskie napisy</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="relative aspect-video">
            {opened ? (
              <video ref={video} controls playsInline preload="metadata" tabIndex={0} poster={`${media}.webp`} aria-label="Film demonstracyjny FakturaProsto" aria-describedby="product-film-description product-film-disclosure" onError={() => setFailed(true)} className="h-full w-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                <source src={`${media}.mp4`} type="video/mp4" />
                <track kind="captions" src={`${media}.pl.vtt`} srcLang="pl" label="Polskie napisy" default />
                Twoja przeglądarka nie obsługuje tego filmu. Skorzystaj z linku do pobrania poniżej.
              </video>
            ) : (
              <button type="button" onClick={() => setOpened(true)} aria-label="Odtwórz prezentację · 1:10 — film demonstracyjny FakturaProsto" className="group relative block h-full w-full overflow-hidden text-white focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white">
                <Image src={`${media}.webp`} alt="FakturaProsto: faktury, podgląd PDF, korekty i terminarz na danych demonstracyjnych" width={1600} height={900} sizes="(max-width: 1200px) 100vw, 1152px" loading="lazy" unoptimized className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full border border-border bg-primary text-primary-foreground shadow-sm transition-colors duration-150 group-hover:bg-primary/90 sm:size-16"><Play className="size-6 fill-current" /></span>
                </span>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-card px-3 py-2 text-center text-xs font-medium text-foreground sm:bottom-6 sm:text-sm">Odtwórz prezentację · 1:10</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-6">
            <p id="product-film-disclosure">Dane demonstracyjne · Bez wysyłki do KSeF · Film z muzyką, bez lektora</p>
            <a href={`${media}.mp4`} download className="inline-flex min-h-11 items-center font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-primary">Pobierz film</a>
          </div>
        </div>
        {failed && <p role="status" className="mt-3 text-sm text-muted-foreground">Nie udało się odtworzyć filmu. Możesz pobrać go powyżej albo przeczytać opis poniżej.</p>}
        <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <details className="min-w-0 max-w-3xl text-sm text-muted-foreground">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-foreground underline decoration-border underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">Przeczytaj opis filmu</summary>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs leading-relaxed">
              <li>Uzupełnij nazwę, NIP i adres sprzedawcy oraz numerację dokumentów.</li>
              <li>Wybierz kontrahenta, dodaj pozycję i cenę. Sprawdź kwoty w podglądzie. Przygotowanie szkicu nie wysyła go do KSeF.</li>
              <li>Sprawdź dane, daty i sumy. Zapisany dokument możesz pobrać jako PDF.</li>
              <li>Przygotuj osobną fakturę korygującą: podaj przyczynę i poprawne wartości. Oryginał pozostaje zachowany.</li>
              <li>Wyszukuj dokumenty na liście i sprawdzaj ich statusy. W terminarzu zobaczysz wpływy, wydatki oraz terminy płatności.</li>
            </ol>
            <p className="mt-2 text-xs leading-relaxed">Terminy podatkowe są ogólne i zależą od sposobu rozliczania firmy. Nagranie nie przedstawia rzeczywistej transmisji do KSeF.</p>
          </details>
          <Link prefetch={false} href="/demo" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-foreground">Wypróbuj demo bez logowania <ArrowRight aria-hidden="true" className="size-4" /></Link>
        </div>
      </div>
    </section>
  );
}
