/** Company-specific numbering. The number and its date are frozen on issue. */
export const DEFAULT_INVOICE_PATTERN = "{PREFIX} {NN}/{MM}/{YYYY}";

export const INVOICE_NUMBER_PRESETS = [
  { label: "Numer / miesiąc / rok", pattern: "{PREFIX} {NN}/{MM}/{YYYY}" },
  { label: "Numer / rok", pattern: "{NN}/{YYYY}" },
  { label: "Dzień / miesiąc / rok / numer", pattern: "{DD}/{MM}/{YYYY}/{NN}" },
  { label: "Miesiąc / numer", pattern: "{MM}/{NN}" },
  { label: "Tydzień / numer", pattern: "{WW}/{NN}" },
  { label: "Rok ISO / tydzień / numer", pattern: "{GGGG}/{WW}/{NN}" },
  { label: "Nazwa / rok / numer", pattern: "FA/{YYYY}/{NNNN}" },
];

const TOKEN = new RegExp(String.raw`\{(PREFIX|N{1,8}|DD|MM|WW|YYYY|RRRR|GGGG)\}|(?<![\p{L}\p{N}_])(?:N{2,8}|DD|MM|WW|YYYY|RRRR|GGGG)(?![\p{L}\p{N}_])`, "gu");
type Part = { token?: string; literal?: string };

export function parseInvoicePattern(pattern: string): Part[] {
  if (!pattern || pattern.length > 80 || /[\r\n<>\\]/.test(pattern)) throw new Error("Nieprawidłowy wzór numeracji (maks. 80 znaków, bez znaków specjalnych).");
  const parts: Part[] = [];
  let offset = 0;
  for (const match of pattern.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > offset) parts.push({ literal: pattern.slice(offset, index) });
    parts.push({ token: match[1] || match[0] });
    offset = index + match[0].length;
  }
  if (offset < pattern.length) parts.push({ literal: pattern.slice(offset) });
  if (!parts.some(part => part.token && /^N+$/.test(part.token))) throw new Error("Wzór musi zawierać licznik NN lub {NNNN}.");
  if (parts.filter(part => part.token && /^N+$/.test(part.token)).length !== 1) throw new Error("Wzór może zawierać tylko jeden licznik.");
  if (parts.some(part => part.literal && /[{}]/.test(part.literal))) throw new Error("Nieznany znacznik we wzorze numeracji.");
  const length = parts.reduce((sum, part) => sum + (part.literal?.length ?? (part.token === "PREFIX" ? 3 : /^(YYYY|RRRR|GGGG)$/.test(part.token!) ? 4 : /^N+$/.test(part.token!) ? part.token!.length : 2)), 0);
  if (length > 50) throw new Error("Numer faktury może mieć maksymalnie 50 znaków. Skróć wzór.");
  return parts;
}

function literalRegex(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
export function invoicePrefix(type: string, isCorrection?: boolean, isProforma?: boolean) {
  return isCorrection ? "KOR" : isProforma ? "PRO" : type === "purchase" ? "FZ" : "FV";
}

export function nextFormattedInvoiceNumber(pattern: string, numbers: string[], date: string, prefix: string): string {
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error("Nieprawidłowa data wystawienia.");
  const parts = parseInvoicePattern(pattern);
  const [year, month, day] = date.split("-");
  const thursday = new Date(parsedDate);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const isoYear = thursday.getUTCFullYear();
  const week = String(Math.ceil(((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0");
  const values: Record<string, string> = { PREFIX: prefix, YYYY: year, RRRR: year, MM: month, DD: day, WW: week, GGGG: String(isoYear) };
  const regex = new RegExp("^" + parts.map(part => {
    if (part.literal !== undefined) return literalRegex(part.literal);
    if (values[part.token!]) return literalRegex(values[part.token!]);
    return "(\\d+)";
  }).join("") + "$");
  let max = 0;
  for (const number of numbers) {
    const matched = regex.exec(number);
    if (matched) {
      const counter = Number(matched[1]);
      if (!Number.isSafeInteger(counter)) throw new Error("Licznik numeracji przekracza obsługiwany zakres.");
      max = Math.max(max, counter);
    }
  }
  // If the pattern has no year/month marker, matching every previous number keeps it unique.
  const next = max + 1;
  if (!Number.isSafeInteger(next)) throw new Error("Licznik numeracji przekracza obsługiwany zakres.");
  const result = parts.map(part => {
    if (part.literal !== undefined) return part.literal;
    if (values[part.token!]) return values[part.token!];
    return String(next).padStart(part.token!.length, "0");
  }).join("");
  if (result.length > 50) throw new Error("Numer faktury może mieć maksymalnie 50 znaków. Skróć wzór.");
  return result;
}

/** Only the explicitly selected numeric fragment becomes a counter; other text stays literal. */
export function invoicePatternFromExample(example: string, fragmentIndex: number): string {
  const fragments = [...example.matchAll(/\d+/g)];
  const fragment = fragments[fragmentIndex];
  if (!fragment || !Number.isInteger(fragmentIndex)) throw new Error("Wybierz fragment numeru, który ma być licznikiem.");
  const index = fragment.index!;
  const pattern = example.slice(0, index) + `{${"N".repeat(Math.min(8, fragment[0].length))}}` + example.slice(index + fragment[0].length);
  parseInvoicePattern(pattern);
  return pattern;
}
