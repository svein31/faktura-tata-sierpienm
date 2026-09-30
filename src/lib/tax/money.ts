/**
 * Arytmetyka kwotowa dla modułu podatkowego.
 *
 * Zaokrąglanie podatkowe to zawsze „half-up" (połowa w górę, od zera):
 *  • art. 63 § 1 Ordynacji podatkowej — podstawy opodatkowania i kwoty podatków
 *    zaokrągla się do pełnych złotych w ten sposób, że końcówki poniżej 50 groszy
 *    pomija się, a końcówki 50 groszy i więcej podwyższa się do pełnych złotych;
 *  • kwoty składek ZUS i kwoty na fakturach — do pełnych groszy, half-up.
 *
 * Surowa arytmetyka `Math.round(x * 100) / 100` zawodzi, bo zapis binarny
 * IEEE-754 przesuwa wartości „idealnie na połowie" o ~1 ulp w dół, np.
 * 3499.5 × 0,09 = 314.95499999999998 → zaokrągliłoby się do 314,95 zamiast
 * do prawidłowych 314,96 zł. Dlatego przed zaokrągleniem normalizujemy
 * wartość do 12 cyfr znaczących, co usuwa artefakt binarny, a jednocześnie
 * nie zmienia żadnej kwoty mieszczącej się w rozsądnym zakresie księgowym.
 */

/** Liczba cyfr znaczących wystarczająca do usunięcia artefaktów IEEE-754. */
const SIGNIFICANT_DIGITS = 12;

/** Normalizuje wartość, usuwając błąd reprezentacji binarnej. */
function normalize(value: number): number {
  return Number(value.toPrecision(SIGNIFICANT_DIGITS));
}

/** Zaokrąglenie half-up (od zera) do `decimals` miejsc po przecinku. */
export function roundHalfUp(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  const scaled = normalize(Math.abs(value) * factor);
  const rounded = (sign * Math.round(scaled)) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** Zaokrąglenie do pełnych groszy (2 miejsca), half-up. */
export function round2(value: number): number {
  return roundHalfUp(value, 2);
}

/** Zaokrąglenie do pełnych złotych (art. 63 § 1 Ordynacji podatkowej), half-up. */
export function roundToZloty(value: number): number {
  return roundHalfUp(value, 0);
}

/** Suma kwot z zaokrągleniem wyniku do pełnych groszy. */
export function sumMoney(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += Number.isFinite(value) ? value : 0;
  }
  return round2(total);
}

/** Procent z kwoty, zaokrąglony do pełnych groszy. */
export function percentOf(base: number, percent: number): number {
  return round2((base * percent) / 100);
}

/** Obcina wartości ujemne do zera (kwoty podatku nie mogą być ujemne). */
export function clampZero(value: number): number {
  return value > 0 ? value : 0;
}

/** Zapis kwoty w formacie wymaganym przez schematy JPK (kropka, 2 miejsca). */
export function toXmlAmount(value: number): string {
  return round2(value).toFixed(2);
}
