import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";

export type PeriodDocument = { companyId?: string | null; issueDate: unknown };

export function accountingMonth(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, "Dokument wymaga poprawnej daty wystawienia RRRR-MM-DD.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ApiError(400, "Nieprawidłowa data wystawienia dokumentu.");
  return value.slice(0, 7);
}

export function periodKeys(documents: PeriodDocument[]) {
  const keys = new Map<string, { id: string; companyId: string; month: string }>();
  for (const document of documents) {
    // Unassigned legacy documents are not part of a company's accounting period.
    if (!document.companyId) continue;
    const month = accountingMonth(document.issueDate);
    const id = createHash("sha256").update(`accounting-period:${document.companyId}:${month}`).digest("hex").slice(0, 24);
    keys.set(id, { id, companyId: document.companyId, month });
  }
  return [...keys.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Must share the transaction with the financial write. A read-only check cannot serialize against closing. */
export async function assertAccountingPeriodsOpen(tx: Prisma.TransactionClient, documents: PeriodDocument[]) {
  for (const key of periodKeys(documents)) {
    const period = await tx.accountingPeriod.upsert({
      where: { id: key.id },
      create: { ...key, operationKey: randomUUID() },
      update: { operationKey: randomUUID() },
    });
    if (period.status !== "open") throw new ApiError(409, `Okres ${key.month} jest zamknięty. Właściciel musi ponownie otworzyć okres przed zmianą dokumentów.`);
  }
}
