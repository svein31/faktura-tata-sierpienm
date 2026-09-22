import { isIsoCalendarDate } from "@/lib/nbp";

export type OcrCandidate = { value: string | number; text: string; page: number; line: number; confidence: null };
export type OcrLine = { name: string; quantity: number; unit: string; totalNet: number; totalVat: number; totalGross: number; source: { page: number; line: number; text: string }; confidence: null };
export type OcrExtraction = { fields: Record<string, OcrCandidate[]>; lines: OcrLine[]; warnings: string[]; confidence: null; method: "labelled-text-v1" };

/** Numbers are suggestions from visible text, never guessed VAT or statistical confidence. */
export function ocrNumber(text: string): number | null {
  let value = text.trim().replace(/[\u00a0\u202f ]/g, "").replace(/(?:PLN|EUR|USD|zł)$/i, "");
  if (value.includes(",") && value.includes(".")) {
    if (/^-?\d{1,3}(?:\.\d{3})+,\d{1,3}$/.test(value)) value = value.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(?:,\d{3})+\.\d{1,3}$/.test(value)) value = value.replace(/,/g, "");
    else return null;
  } else value = value.replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= 1e10 ? number : null;
}

const normalized = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[.:]/g, "").trim();
const columns = (text: string) => text.split(/\t|\|| {2,}/).map(s => s.trim()).filter(Boolean);
const aliases: Record<string, string[]> = { name: ["nazwa", "nazwa towaru/uslugi", "opis", "description"], quantity: ["ilosc", "quantity", "qty"], unit: ["jm", "jednostka", "unit"], totalNet: ["wartosc netto", "netto", "net amount"], totalVat: ["kwota vat", "wartosc vat", "vat amount"], totalGross: ["wartosc brutto", "brutto", "gross amount"] };

export function extractOcrFields(pages: string[]): OcrExtraction {
  const result: OcrExtraction = { fields: {}, lines: [], warnings: [], confidence: null, method: "labelled-text-v1" };
  const add = (field: string, value: string | number | null, text: string, page: number, line: number) => {
    if (value === null || value === "") return;
    const values = result.fields[field] ||= [];
    if (values.length < 10 && !values.some(c => c.value === value)) values.push({ value, text: text.slice(0, 500), page, line, confidence: null });
  };
  for (const [pageIndex, page] of pages.slice(0, 100).entries()) {
    let seller = false, header: Record<string, number> | null = null, headerSize = 0;
    const lines = page.slice(0, 100000).split(/\r?\n/);
    for (const [lineIndex, raw] of lines.entries()) {
      const text = raw.trim().slice(0, 2000), pageNo = pageIndex + 1, lineNo = lineIndex + 1;
      if (/^(?:nabywca|odbiorca|buyer|customer)\b/i.test(text)) seller = false;
      const sellerMatch = /^(?:sprzedawca|wystawca|seller)\s*:\s*(.*)$/i.exec(text);
      if (sellerMatch) { seller = true; add("contractorName", sellerMatch[1], text, pageNo, lineNo); }
      const nip = /\bNIP\s*:?\s*((?:PL\s*)?[\d -]{10,20})/i.exec(text);
      if (seller && nip) { const digits = nip[1].replace(/\D/g, ""); if (digits.length === 10) add("nip", digits, text, pageNo, lineNo); }
      const number = /^(?:faktura(?:\s+VAT)?(?:\s+(?:nr|numer))?|invoice(?:\s+(?:no|number))?)\s*[:#]?\s+([^\s].{0,99})$/i.exec(text);
      if (number && /\d/.test(number[1])) add("number", number[1].trim(), text, pageNo, lineNo);
      const date = /^(?:data wystawienia|issue date)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4})\s*$/i.exec(text);
      if (date) { const parts = date[1].split(/[./]/), value = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : date[1]; if (isIsoCalendarDate(value)) add("issueDate", value, text, pageNo, lineNo); }
      const currency = /^(?:waluta|currency)\s*:?\s*([A-Z]{3})\s*$/i.exec(text);
      if (currency) add("currency", currency[1].toUpperCase(), text, pageNo, lineNo);
      const totals: [string, RegExp][] = [["totalNet", /^(?:razem netto|suma netto|total net)\s*:?\s*(.+)$/i], ["totalVat", /^(?:razem VAT|suma VAT|total VAT)\s*:?\s*(.+)$/i], ["totalGross", /^(?:razem brutto|suma brutto|total gross)\s*:?\s*(.+)$/i]];
      for (const [field, pattern] of totals) { const match = pattern.exec(text); if (match) add(field, ocrNumber(match[1]), text, pageNo, lineNo); }
      const cells = columns(raw), mapping: Record<string, number> = {};
      for (const [field, names] of Object.entries(aliases)) { const index = cells.findIndex(cell => names.includes(normalized(cell))); if (index >= 0) mapping[field] = index; }
      if (["name", "quantity", "totalNet", "totalVat", "totalGross"].every(key => key in mapping)) { header = mapping; headerSize = cells.length; continue; }
      if (!header || cells.length !== headerSize || /^(?:razem|suma|total)\b/i.test(text)) continue;
      const quantity = ocrNumber(cells[header.quantity]), totalNet = ocrNumber(cells[header.totalNet]), totalVat = ocrNumber(cells[header.totalVat]), totalGross = ocrNumber(cells[header.totalGross]);
      if ([quantity, totalNet, totalVat, totalGross].some(v => v === null) || !cells[header.name] || result.lines.length >= 200) continue;
      result.lines.push({ name: cells[header.name].slice(0, 200), quantity: quantity!, unit: header.unit === undefined ? "" : cells[header.unit].slice(0, 20), totalNet: totalNet!, totalVat: totalVat!, totalGross: totalGross!, source: { page: pageNo, line: lineNo, text: text.slice(0, 500) }, confidence: null });
    }
  }
  if (Object.values(result.fields).some(values => values.length > 1)) result.warnings.push("Odczyt zawiera różne propozycje dla tego samego pola. Wybierz wartość według oryginału.");
  if (!result.lines.length) result.warnings.push("Nie rozpoznano jednoznacznej tabeli pozycji. Pozycje wymagają ręcznego opracowania.");
  result.warnings.push("OCR.space nie dostarcza w tym formacie pewności poszczególnych pól. Propozycje z etykiet tekstowych wymagają sprawdzenia.");
  return result;
}
