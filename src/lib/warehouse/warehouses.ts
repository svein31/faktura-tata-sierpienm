/**
 * Obsługa magazynów: automatyczne utworzenie magazynu głównego,
 * rozwiązywanie magazynu domyślnego i walidacja przynależności do użytkownika.
 */

import type { Warehouse as DbWarehouse } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";

export const DEFAULT_WAREHOUSE_CODE = "MAG";
export const DEFAULT_WAREHOUSE_NAME = "Magazyn główny";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export function isObjectId(v: unknown): v is string {
  return typeof v === "string" && OBJECT_ID.test(v);
}

/**
 * Zwraca magazyn domyślny użytkownika. Gdy użytkownik nie ma jeszcze żadnego magazynu,
 * tworzy „Magazyn główny” (kod `MAG`, `isDefault: true`).
 */
export async function ensureDefaultWarehouse(userId: string, prisma: Prisma.TransactionClient = defaultPrisma): Promise<DbWarehouse> {
  const existing = await prisma.warehouse.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (existing) return existing;

  try {
    return await prisma.warehouse.create({
      data: {
        userId,
        code: DEFAULT_WAREHOUSE_CODE,
        name: DEFAULT_WAREHOUSE_NAME,
        isDefault: true,
        isActive: true,
      },
    });
  } catch {
    // Wyścig równoległych żądań — magazyn powstał w innym wątku.
    const retry = await prisma.warehouse.findFirst({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    if (retry) return retry;
    throw new ApiError(500, "Nie udało się utworzyć magazynu głównego.", "WAREHOUSE_INIT_FAILED");
  }
}

/**
 * Zwraca wskazany magazyn użytkownika lub magazyn domyślny, gdy `warehouseId` jest pusty.
 * Rzuca `ApiError(404)`, gdy magazyn nie istnieje lub należy do innego użytkownika.
 */
export async function resolveWarehouse(
  userId: string,
  warehouseId?: string | null,
  prisma: Prisma.TransactionClient = defaultPrisma
): Promise<DbWarehouse> {
  if (!warehouseId) return ensureDefaultWarehouse(userId, prisma);
  if (!isObjectId(warehouseId)) {
    throw new ApiError(400, "Nieprawidłowy identyfikator magazynu.", "INVALID_WAREHOUSE_ID");
  }

  const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, userId } });
  if (!warehouse) {
    throw new ApiError(404, "Nie znaleziono magazynu.", "WAREHOUSE_NOT_FOUND");
  }
  return warehouse;
}

/** Zwraca wszystkie magazyny użytkownika (magazyn domyślny pierwszy). */
export async function listWarehouseRecords(userId: string, prisma: Prisma.TransactionClient = defaultPrisma): Promise<DbWarehouse[]> {
  const rows = await prisma.warehouse.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (rows.length > 0) return rows;
  const created = await ensureDefaultWarehouse(userId, prisma);
  return [created];
}
