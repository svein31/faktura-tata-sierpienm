/**
 * Zaokrąglanie w module magazynowym.
 *
 * Wszystkie operacje używają zaokrąglenia handlowego (half-up, „od zera”),
 * z korektą błędu reprezentacji zmiennoprzecinkowej — dzięki `toPrecision(12)`
 * wartości typu `2.675 * 100 = 267.49999999999997` są prawidłowo zaokrąglane w górę.
 */

function roundTo(value: unknown, digits: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n === 0) return 0;

  const factor = 10 ** digits;
  const scaled = Math.abs(n) * factor;
  // Normalizacja do 12 cyfr znaczących usuwa artefakty IEEE-754 przed zaokrągleniem.
  const normalized = Number(scaled.toPrecision(12));
  const rounded = Math.round(normalized);
  return (n < 0 ? -rounded : rounded) / factor;
}

/** Kwoty — 2 miejsca po przecinku. */
export function roundMoney(value: unknown): number {
  return roundTo(value, 2);
}

/** Ilości — 3 miejsca po przecinku. */
export function roundQty(value: unknown): number {
  return roundTo(value, 3);
}

/** Bezpieczna suma kwot (zaokrąglana po każdym kroku, by nie kumulować błędu). */
export function sumMoney(values: number[]): number {
  return values.reduce((acc, v) => roundMoney(acc + roundMoney(v)), 0);
}

/** Bezpieczna suma ilości. */
export function sumQty(values: number[]): number {
  return values.reduce((acc, v) => roundQty(acc + roundQty(v)), 0);
}

/** Formatowanie ilości na potrzeby komunikatów (bez zbędnych zer). */
export function qtyLabel(value: number): string {
  const rounded = roundQty(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}
