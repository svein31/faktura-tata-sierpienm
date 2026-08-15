"use client";

/**
 * Dźwięk powiadomień generowany w całości przez Web Audio API (bez plików).
 *
 * Polityka autoplay przeglądarek: AudioContext musi zostać utworzony/wznowiony
 * w ramach gestu użytkownika (klik). Dlatego:
 *  - `unlockAudio()` wywoływany jest przy pierwszym kliknięciu (przełącznik
 *    dźwięku / przycisk „Test” / dowolny klik na stronie),
 *  - późniejsze odtwarzanie (polling → nowe powiadomienie) korzysta z tego
 *    samego, odblokowanego kontekstu.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Tworzy/wznawia kontekst audio — musi być wywołane z gestu użytkownika. */
export function unlockAudio(): boolean {
  const c = getCtx();
  if (!c) return false;
  if (c.state === "suspended") void c.resume();
  return true;
}

export function audioSupported(): boolean {
  return typeof window !== "undefined" && !!(
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain = 0.16) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.05);
}

/**
 * Krótki, przyjemny „pling" (dwa dźwięki). Nie rzuca wyjątków — bezpieczny
 * przy zablokowanym autoplay (wtedy po prostu nic nie gra).
 */
export function playNotificationSound(): void {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    const t0 = c.currentTime + 0.02;
    tone(c, 880, t0 - c.currentTime, 0.14, "sine");
    tone(c, 1318.5, t0 - c.currentTime + 0.12, 0.22, "sine");
  } catch {
    /* autoplay blocked — ignorujemy */
  }
}
