/**
 * Numeracja dokumentów magazynowych.
 *
 * Dokumenty magazynowe: `{TYP}/{NNN}/{MM}/{RRRR}` — np. `WZ/001/03/2026`, `MM/003/03/2026`.
 *   • oddzielna seria dla każdego typu dokumentu (WZ, PZ, RW, PW, MM),
 *   • seria miesięczna — w nowym miesiącu numeracja startuje od 001,
 *   • numer kolejny zawsze 3-cyfrowy z zerami wiodącymi; powyżej 999 rośnie do 4 cyfr.
 *
 * Remanent: `RM/{NNN}/{RRRR}` — seria roczna (np. `RM/001/2026`).
 *
 * Kolizja unikalności `@@unique([userId, number])` (równoległe żądania) jest obsługiwana
 * przez retry z inkrementacją numeru — maksymalnie 5 prób.
 */

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { StockDocumentType } from "@/lib/types";

const MAX_ATTEMPTS = 5;

/** Formatuje numer kolejny: 3 cyfry z zerami wiodącymi, powyżej 999 naturalnie 4 cyfry. */
export function formatSequence(seq: number): string {
  const safe = Math.max(1, Math.floor(seq));
  return safe <= 999 ? String(safe).padStart(3, "0") : String(safe);
}

/** Rozbija datę ISO (`YYYY-MM-DD`) na części; dla wartości nieparsowalnej używa „dziś”. */
export function datePartsOf(date: string): { year: string; month: string } {
  const raw = typeof date === "string" ? date.trim() : "";
  const match = /^(\d{4})-(\d{2})/.exec(raw);
  if (match) return { year: match[1], month: match[2] };

  const parsed = raw ? new Date(raw) : new Date();
  const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, "0"),
  };
}

/** Wyciąga numer kolejny z numeru dokumentu (`WZ/012/03/2026` → 12). */
function sequenceFromNumber(number: string, prefix: string, suffix: string): number {
  if (!number.startsWith(`${prefix}/`) || !number.endsWith(suffix)) return 0;
  const middle = number.slice(prefix.length + 1, number.length - suffix.length);
  const seq = Number.parseInt(middle, 10);
  return Number.isFinite(seq) && seq > 0 ? seq : 0;
}

/**
 * Zwraca kolejny wolny numer dokumentu magazynowego dla danego typu, miesiąca i użytkownika.
 * Format: `{TYP}/{NNN}/{MM}/{RRRR}`.
 */
export async function nextStockDocumentNumber(
  userId: string,
  type: StockDocumentType,
  date: string
): Promise<string> {
  const { year, month } = datePartsOf(date);
  const suffix = `/${month}/${year}`;

  const existing = await prisma.stockDocument.findMany({
    where: { userId, type, number: { endsWith: suffix } },
    select: { number: true },
  });

  let seq = 0;
  for (const row of existing) {
    seq = Math.max(seq, sequenceFromNumber(row.number, type, suffix));
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `${type}/${formatSequence(seq + 1 + attempt)}${suffix}`;
    const clash = await prisma.stockDocument.findFirst({
      where: { userId, number: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }

  throw new ApiError(
    409,
    `Nie udało się wygenerować numeru dokumentu ${type} — spróbuj ponownie.`,
    "NUMBERING_CONFLICT"
  );
}

/**
 * Zwraca kolejny wolny numer remanentu dla danego roku i użytkownika.
 * Format: `RM/{NNN}/{RRRR}`.
 */
export async function nextStocktakingNumber(userId: string, date: string): Promise<string> {
  const { year } = datePartsOf(date);
  const suffix = `/${year}`;

  const existing = await prisma.stocktaking.findMany({
    where: { userId, number: { endsWith: suffix } },
    select: { number: true },
  });

  let seq = 0;
  for (const row of existing) {
    seq = Math.max(seq, sequenceFromNumber(row.number, "RM", suffix));
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `RM/${formatSequence(seq + 1 + attempt)}${suffix}`;
    const clash = await prisma.stocktaking.findFirst({
      where: { userId, number: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }

  throw new ApiError(
    409,
    "Nie udało się wygenerować numeru remanentu — spróbuj ponownie.",
    "NUMBERING_CONFLICT"
  );
}
