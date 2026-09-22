import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { companyAccess } from "@/lib/company-write";
import { lockWarehouses } from "@/lib/warehouse/transaction";
import { getSessionUser } from "@/lib/auth";
import { ApiError, bool, cleanStr, handleApiError, json, readJson } from "@/lib/api";
import { recordAuditLog } from "@/lib/audit";
import { warehouseToDto } from "@/lib/warehouse/dto";
import { assertCanManageStock } from "@/lib/warehouse/guard";
import { isObjectId } from "@/lib/warehouse/warehouses";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function ownedWarehouse(userId: string, id: string, prisma: Prisma.TransactionClient) {
  if (!isObjectId(id)) {
    throw new ApiError(400, "Nieprawidłowy identyfikator magazynu.", "INVALID_WAREHOUSE_ID");
  }
  const warehouse = await prisma.warehouse.findFirst({ where: { id, userId } });
  if (!warehouse) throw new ApiError(404, "Nie znaleziono magazynu.", "WAREHOUSE_NOT_FOUND");
  if (warehouse.companyId) await companyAccess(prisma, userId, warehouse.companyId, "canIssueInvoices");
  return warehouse;
}

/** PATCH /api/warehouse/warehouses/[id] — edycja magazynu. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    assertCanManageStock(user);

    return await prisma.$transaction(async prisma => {
    const warehouse = await ownedWarehouse(user.id, (await params).id, prisma);
    await lockWarehouses(prisma, user.id, [warehouse.id]);
    const body = await readJson(req);

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = cleanStr(body.name, 120, "nazwa");
      if (!name) throw new ApiError(400, "Podaj nazwę magazynu.", "NAME_REQUIRED");
      data.name = name;
    }

    if (body.code !== undefined) {
      const code = cleanStr(body.code, 20, "kod").toUpperCase();
      if (!code) throw new ApiError(400, "Podaj kod magazynu.", "CODE_REQUIRED");
      if (code !== warehouse.code) {
        const duplicate = await prisma.warehouse.findFirst({
          where: { userId: user.id, code },
          select: { id: true },
        });
        if (duplicate) {
          throw new ApiError(409, `Magazyn o kodzie ${code} już istnieje.`, "WAREHOUSE_CODE_TAKEN");
        }
      }
      data.code = code;
    }

    if (body.notes !== undefined) data.notes = cleanStr(body.notes, 500, "uwagi") || null;
    if (body.isActive !== undefined) data.isActive = bool(body.isActive);

    if (body.address !== undefined) {
      const a = (body.address ?? {}) as Record<string, unknown>;
      const address = {
        street: cleanStr(a.street, 200, "adres.ulica"),
        city: cleanStr(a.city, 120, "adres.miasto"),
        postal: cleanStr(a.postal, 20, "adres.kod pocztowy"),
        country: cleanStr(a.country, 60, "adres.kraj") || "PL",
      };
      data.address = address.street || address.city || address.postal ? address : null;
    }

    if (bool(body.isDefault) && !warehouse.isDefault) {
      await prisma.warehouse.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
      data.isDefault = true;
    }

    const updated = await prisma.warehouse.update({ where: { id: warehouse.id }, data });

    await recordAuditLog({
      client: prisma, companyId: warehouse.companyId,
      userId: user.id,
      userName: user.name ?? null,
      userEmail: user.email,
      action: "warehouse.updated",
      entityType: "warehouse",
      entityId: updated.id,
      description: `Zaktualizowano magazyn ${updated.code} — ${updated.name}`,
    });

    return json({ warehouse: warehouseToDto(updated) });
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * DELETE /api/warehouse/warehouses/[id] — usunięcie magazynu.
 * Blokowane, gdy magazyn ma niezerowe stany lub jest ostatnim magazynem użytkownika.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    assertCanManageStock(user);

    return await prisma.$transaction(async prisma => {
    const warehouse = await ownedWarehouse(user.id, (await params).id, prisma);
    await lockWarehouses(prisma, user.id, [warehouse.id]);

    const total = await prisma.warehouse.count({ where: { userId: user.id } });
    if (total <= 1) {
      throw new ApiError(
        400,
        "Nie można usunąć ostatniego magazynu — system wymaga co najmniej jednego.",
        "LAST_WAREHOUSE"
      );
    }

    const nonZero = await prisma.stockItem.count({
      where: { userId: user.id, warehouseId: warehouse.id, OR: [{ quantity: { not: 0 } }, { reserved: { not: 0 } }] },
    });
    if (nonZero > 0) {
      throw new ApiError(
        400,
        `Magazyn ${warehouse.name} ma ${nonZero} pozycji z niezerowym stanem. Wyzeruj stany (RW / MM) przed usunięciem.`,
        "WAREHOUSE_NOT_EMPTY"
      );
    }

    const openStocktaking = await prisma.stocktaking.findFirst({
      where: { userId: user.id, warehouseId: warehouse.id, status: { in: ["open", "counting"] } },
      select: { number: true },
    });
    if (openStocktaking) {
      throw new ApiError(
        400,
        `W magazynie trwa remanent ${openStocktaking.number} — zamknij go przed usunięciem magazynu.`,
        "STOCKTAKING_OPEN"
      );
    }

    const history = await Promise.all([
      prisma.stockDocument.count({ where: { warehouseId: warehouse.id } }),
      prisma.stockMovement.count({ where: { warehouseId: warehouse.id } }),
      prisma.stocktaking.count({ where: { warehouseId: warehouse.id } }),
    ]);
    if (history.some(Boolean)) throw new ApiError(409, "Magazyn ma historię dokumentów. Dezaktywuj go zamiast usuwać.");
    await prisma.warehouse.delete({ where: { id: warehouse.id } });

    // Magazyn domyślny musi zawsze istnieć.
    if (warehouse.isDefault) {
      const next = await prisma.warehouse.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await prisma.warehouse.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }

    await recordAuditLog({
      client: prisma, companyId: warehouse.companyId,
      userId: user.id,
      userName: user.name ?? null,
      userEmail: user.email,
      action: "warehouse.deleted",
      entityType: "warehouse",
      entityId: warehouse.id,
      description: `Usunięto magazyn ${warehouse.code} — ${warehouse.name}`,
    });

    return json({ ok: true });
    });
  } catch (e) {
    return handleApiError(e);
  }
}
