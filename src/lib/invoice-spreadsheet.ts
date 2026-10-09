import { VAT_RATES } from "./format";
import { normalizeInvoiceLineAmounts } from "./invoice-input";
import type { InvoiceLine, VatRate } from "./types";

/** Optional-header spreadsheet CSV/TSV; quoted separators and line breaks are data. */
function records(text: string): string[][] {
  if (text.length > 262144) throw new Error("Arkusz przekracza 256 KB.");
  const source = text.replace(/^\uFEFF/, "");
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '"') { if (quoted && source[index + 1] === '"') index++; else quoted = !quoted; }
    else if (!quoted && /[\r\n]/.test(character)) break;
    else if (!quoted && character in counts) counts[character]++;
  }
  const separator = counts["\t"] > 0 ? "\t" : counts[";"] > 0 ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "";
  quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index++; }
      else if (quoted) quoted = false;
      else if (!cell.trim()) { cell = ""; quoted = true; }
      else throw new Error("Nieprawidłowy cudzysłów w arkuszu.");
    } else if (!quoted && character === separator) { row.push(cell.trim()); cell = ""; }
    else if (!quoted && /[\r\n]/.test(character)) {
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
      if (character === "\r" && source[index + 1] === "\n") index++;
      if (rows.length > 201) throw new Error("Faktura może zawierać najwyżej 200 pozycji.");
    } else cell += character;
  }
  if (quoted) throw new Error("Niezamknięte pole w cudzysłowie.");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function numeric(cell: string, row: number, label: string) {
  const value = cell.replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) throw new Error(`Wiersz ${row}: podaj poprawną ${label}.`);
  return Number(value);
}

function vat(cell: string, row: number): VatRate {
  const value = cell.toLowerCase().replace(/%$/, "").replace(/\.$/, "").trim();
  const aliases: Record<string, VatRate> = { zwolniony: "zw", niepodlega: "np", odwrocone: "oo", "o.o": "oo" };
  const rate = aliases[value] || value;
  if (!(VAT_RATES as readonly string[]).includes(rate)) throw new Error(`Wiersz ${row}: nieobsługiwana stawka VAT „${cell}”.`);
  return rate as VatRate;
}

/** Invalid financial values never silently become another quantity, price or VAT. */
export function parseInvoiceSpreadsheet(text: string, correction = false): InvoiceLine[] {
  const rows = records(text);
  if (rows.length && ["nazwa", "produkt", "usługa", "pozycja", "name"].includes(rows[0][0].toLowerCase())) rows.shift();
  if (rows.length > 200) throw new Error("Faktura może zawierać najwyżej 200 pozycji.");
  return rows.map((cells, index) => {
    const row = index + 1;
    if (cells.length < 2 || cells.length > 5 || !cells[0] || cells[0].length > 500) throw new Error(`Wiersz ${row}: podaj nazwę i od 2 do 5 kolumn zgodnie z opisem.`);
    let quantity = 1, unit = "szt.", netPrice: number, vatRate: VatRate = "23";
    if (cells.length === 2) netPrice = numeric(cells[1], row, "cenę netto");
    else {
      quantity = numeric(cells[1], row, "ilość");
      if (cells.length === 3) netPrice = numeric(cells[2], row, "cenę netto");
      else if (cells.length === 4 && /^[+-]?(?:\d|[.,]\d)/.test(cells[2])) { netPrice = numeric(cells[2], row, "cenę netto"); vatRate = vat(cells[3], row); }
      else { unit = cells[2] || "szt."; netPrice = numeric(cells[3], row, "cenę netto"); if (cells.length === 5) vatRate = vat(cells[4], row); }
    }
    const line = normalizeInvoiceLineAmounts({ id: `spreadsheet-${index}`, name: cells[0], quantity, unit, netPrice, vatRate });
    if ((correction ? line.quantity === 0 : line.quantity <= 0) || Math.abs(quantity) > 1e9 || netPrice < 0 || netPrice > 1e9 || unit.length > 30) throw new Error(`Wiersz ${row}: sprawdź zakres ilości, ceny i jednostkę. Ujemna ilość jest dostępna tylko dla korekt.`);
    return line;
  });
}
