/** Company-specific numbering. The number and its date are frozen on issue. */
export const DEFAULT_INVOICE_PATTERN = "{PREFIX} {NN}/{MM}/{YYYY}";

const TOKEN = /\{(PREFIX|N{1,8}|MM|YYYY|RRRR)\}|N{2,8}|MM|YYYY|RRRR/g;
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
  if (parts.some(part => part.token === "MM") && !parts.some(part => part.token === "YYYY" || part.token === "RRRR")) throw new Error("Numeracja miesięczna wymaga także roku RRRR.");
  if (parts.some(part => part.literal && /[{}]/.test(part.literal))) throw new Error("Nieznany znacznik we wzorze numeracji.");
  return parts;
}

function literalRegex(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
export function invoicePrefix(type: string, isCorrection?: boolean, isProforma?: boolean) {
  return isCorrection ? "KOR" : isProforma ? "PRO" : type === "purchase" ? "FZ" : "FV";
}

export function nextFormattedInvoiceNumber(pattern: string, numbers: string[], date: string, prefix: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) throw new Error("Nieprawidłowa data wystawienia.");
  const parts = parseInvoicePattern(pattern);
  const [year, month] = date.split("-");
  const regex = new RegExp("^" + parts.map(part => {
    if (part.literal !== undefined) return literalRegex(part.literal);
    if (part.token === "PREFIX") return literalRegex(prefix);
    if (part.token === "MM") return month;
    if (part.token === "YYYY" || part.token === "RRRR") return year;
    return "(\\d+)";
  }).join("") + "$");
  let max = 0;
  for (const number of numbers) {
    const matched = regex.exec(number);
    if (matched) max = Math.max(max, Number(matched[1]));
  }
  // If the pattern has no year/month marker, matching every previous number keeps it unique.
  const next = max + 1;
  return parts.map(part => {
    if (part.literal !== undefined) return part.literal;
    if (part.token === "PREFIX") return prefix;
    if (part.token === "MM") return month;
    if (part.token === "YYYY" || part.token === "RRRR") return year;
    return String(next).padStart(part.token!.length, "0");
  }).join("");
}
