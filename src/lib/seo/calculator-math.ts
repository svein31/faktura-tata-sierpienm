// Values cross a decimal-input boundary here. Keep intermediate products exact,
// even when the input cents fit in a Number but multiplying by VAT would not.
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const HUNDRED = BigInt(100);
const TWO = BigInt(2);
const pln = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

export function parseGrosz(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized.length > 32 || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fractional = ""] = normalized.split(".");
  const amount = BigInt(whole) * HUNDRED + BigInt(fractional.padEnd(2, "0"));
  return amount <= MAX_CENTS ? Number(amount) : null;
}

function roundedRatio(numerator: bigint, denominator: bigint): bigint {
  // Nonnegative amounts, round half up to a whole grosz.
  return (numerator + denominator / TWO) / denominator;
}

export function calculateVat(cents: number | null, direction: "net" | "gross", rate: number) {
  if (cents === null || !Number.isSafeInteger(cents) || cents < 0 || ![23, 8, 5, 0].includes(rate)) return null;
  const amount = BigInt(cents);
  const net = direction === "net" ? amount : roundedRatio(amount * HUNDRED, BigInt(100 + rate));
  const gross = direction === "gross" ? amount : amount + roundedRatio(amount * BigInt(rate), HUNDRED);
  if (net > MAX_CENTS || gross > MAX_CENTS) return null;
  return { net: Number(net), vat: Number(gross - net), gross: Number(gross) };
}

export function formatPlnCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError("Invalid calculator amount");
  const exact = BigInt(cents);
  const fraction = String(exact % HUNDRED).padStart(2, "0");
  return pln.formatToParts(exact / HUNDRED).map(part => part.type === "fraction" ? fraction : part.value).join("");
}
