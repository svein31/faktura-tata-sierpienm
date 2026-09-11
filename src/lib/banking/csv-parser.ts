import type { BankStatementTransaction } from "@/lib/types";
import { uid } from "@/lib/utils";

export interface ParsedRawTransaction {
  date: string;
  amount: number;
  title: string;
  senderName: string;
  senderAccount?: string;
  raw: string;
}

/**
 * Normalizuje polskie znaki w nagłówkach i usuwa cudzysłowy.
 */
function cleanHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/["']/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Konwertuje polski format kwoty (np. "1 250,50 PLN" lub "-150,00") na number.
 */
function parsePolishAmount(val: string): number {
  if (!val) return 0;
  const cleaned = val
    .replace(/["'PLN\s]/gi, "")
    .replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Normalizuje datę do formatu YYYY-MM-DD.
 */
function normalizeDate(val: string): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  const clean = val.replace(/["']/g, "").trim();
  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  // Format DD.MM.YYYY lub DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{2})[.-](\d{2})[.-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  }
  // Format YYYY.MM.DD
  const ymdMatch = clean.match(/^(\d{4})[.](\d{2})[.](\d{2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  }
  return clean.slice(0, 10);
}

/**
 * Dzieli wiersz CSV z uwzględnieniem cudzysłowów.
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Wykrywa delimiter (średnik lub przecinek) na podstawie pierwszych wierszy.
 */
function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
  let semicolonCount = 0;
  let commaCount = 0;
  for (const line of lines) {
    semicolonCount += (line.match(/;/g) || []).length;
    commaCount += (line.match(/,/g) || []).length;
  }
  return semicolonCount >= commaCount ? ";" : ",";
}

/**
 * Główna funkcja parsująca wyciąg bankowy CSV z banków mBank, PKO BP, ING, Santander, Millennium lub uniwersalnego.
 */
export function parseBankStatementCsv(csvText: string): ParsedRawTransaction[] {
  const delimiter = detectDelimiter(csvText);
  const rawLines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (rawLines.length === 0) return [];

  // Znajdź wiersz nagłówka
  let headerIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(rawLines.length, 25); i++) {
    const cols = splitCsvLine(rawLines[i], delimiter).map(cleanHeader);
    const hasDate = cols.some((c) => c.includes("data"));
    const hasAmount = cols.some((c) => c.includes("kwota") || c.includes("wartosc") || c.includes("amount"));
    if (hasDate && hasAmount) {
      headerIndex = i;
      headers = cols;
      break;
    }
  }

  if (headerIndex === -1) {
    // Fallback: traktuj pierwszy wiersz jako nagłówek
    headerIndex = 0;
    headers = splitCsvLine(rawLines[0], delimiter).map(cleanHeader);
  }

  // Identyfikacja kolumn
  let dateCol = headers.findIndex((h) => h.includes("data operacji") || h.includes("data transakcji") || h.includes("data"));
  let amountCol = headers.findIndex((h) => h.includes("kwota operacji") || h.includes("kwota transakcji") || h.includes("kwota") || h.includes("amount"));
  let titleCol = headers.findIndex((h) => h.includes("tytul") || h.includes("opis") || h.includes("szczegoly") || h.includes("title"));
  let senderCol = headers.findIndex((h) => h.includes("nadawca") || h.includes("kontrahent") || h.includes("odbiorca") || h.includes("nazwa"));
  let accountCol = headers.findIndex((h) => h.includes("rachunek") || h.includes("konto") || h.includes("iban") || h.includes("account"));

  if (dateCol === -1) dateCol = 0;
  if (amountCol === -1) amountCol = Math.min(1, headers.length - 1);
  if (titleCol === -1) titleCol = Math.min(2, headers.length - 1);
  if (senderCol === -1) senderCol = Math.min(3, headers.length - 1);

  const transactions: ParsedRawTransaction[] = [];

  for (let i = headerIndex + 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    const cols = splitCsvLine(line, delimiter);
    if (cols.length <= Math.max(dateCol, amountCol)) continue;

    const date = normalizeDate(cols[dateCol] || "");
    const amount = parsePolishAmount(cols[amountCol] || "");
    const title = cols[titleCol]?.replace(/^["']|["']$/g, "").trim() || "";
    const senderName = cols[senderCol]?.replace(/^["']|["']$/g, "").trim() || "";
    const senderAccount = accountCol !== -1 && cols[accountCol] ? cols[accountCol].replace(/\s/g, "").replace(/^["']|["']$/g, "") : undefined;

    // Interesują nas wyłącznie wpłaty dodatnie (przychody)
    if (amount > 0 && (title || senderName)) {
      transactions.push({
        date,
        amount,
        title,
        senderName,
        senderAccount,
        raw: line,
      });
    }
  }

  return transactions;
}

export interface MatchCandidate {
  id: string;
  number: string;
  contractorName?: string;
  contractorNip?: string;
  totalGross: number;
  paidAmount: number;
}

/**
 * Automatyczne dopasowywanie wpłat z wyciągu bankowego do faktur.
 */
export function matchTransactionsToInvoices(
  transactions: ParsedRawTransaction[],
  unpaidInvoices: MatchCandidate[]
): BankStatementTransaction[] {
  return transactions.map((tx) => {
    let matchedId: string | undefined;
    let matchedNumber: string | undefined;
    let matchedContractor: string | undefined;
    let confidence: "exact" | "high" | "low" | "none" = "none";

    const titleLower = tx.title.toLowerCase();
    const senderLower = tx.senderName.toLowerCase();

    for (const inv of unpaidInvoices) {
      const invNumLower = inv.number.toLowerCase();
      // Usunięcie znaków specjalnych dla elastycznego porównywania (np. FV/2026/001 -> fv2026001)
      const numClean = invNumLower.replace(/[\/\-_\s]/g, "");
      const titleClean = titleLower.replace(/[\/\-_\s]/g, "");

      const remainingAmount = Math.round((inv.totalGross - inv.paidAmount) * 100) / 100;
      const amountMatches = Math.abs(tx.amount - remainingAmount) < 0.05 || Math.abs(tx.amount - inv.totalGross) < 0.05;

      const numberInTitle = titleClean.includes(numClean) || titleLower.includes(invNumLower);

      if (numberInTitle && amountMatches) {
        matchedId = inv.id;
        matchedNumber = inv.number;
        matchedContractor = inv.contractorName;
        confidence = "exact";
        break;
      } else if (numberInTitle) {
        matchedId = inv.id;
        matchedNumber = inv.number;
        matchedContractor = inv.contractorName;
        confidence = "high";
      } else if (amountMatches && inv.contractorName && senderLower.includes(inv.contractorName.toLowerCase().slice(0, 10))) {
        if (confidence === "none") {
          matchedId = inv.id;
          matchedNumber = inv.number;
          matchedContractor = inv.contractorName;
          confidence = "high";
        }
      } else if (amountMatches && inv.contractorNip && (titleLower.includes(inv.contractorNip) || senderLower.includes(inv.contractorNip))) {
        if (confidence === "none") {
          matchedId = inv.id;
          matchedNumber = inv.number;
          matchedContractor = inv.contractorName;
          confidence = "high";
        }
      }
    }

    return {
      id: uid("tx"),
      date: tx.date,
      amount: tx.amount,
      title: tx.title,
      senderName: tx.senderName,
      senderAccount: tx.senderAccount,
      matchedInvoiceId: matchedId,
      matchedInvoiceNumber: matchedNumber,
      matchedContractorName: matchedContractor,
      confidence,
    };
  });
}
