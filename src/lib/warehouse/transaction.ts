import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";

/** A real write serializes stock changes and inventory snapshots across server processes. */
export async function lockWarehouses(tx: Prisma.TransactionClient, userId: string, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const result = await tx.warehouse.updateMany({ where: { id, userId }, data: { operationKey: randomUUID() } });
    if (result.count !== 1) throw new ApiError(404, "Nie znaleziono magazynu.");
  }
}

export async function assertNoStocktaking(tx: Prisma.TransactionClient, warehouseId: string, closingId?: string) {
  const active = await tx.stocktaking.findFirst({ where: { warehouseId, status: { in: ["open", "counting"] } } });
  if (active && active.id !== closingId) throw new ApiError(409, `Magazyn jest zablokowany na czas remanentu ${active.number}.`, "STOCKTAKING_LOCKED");
}
