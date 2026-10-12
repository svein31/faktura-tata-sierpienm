import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, cleanStr, handleApiError, json, num, readJson } from "@/lib/api";
import { stockItemToDto } from "@/lib/warehouse/dto";
import { assertCanManageStock } from "@/lib/warehouse/guard";
import { roundQty } from "@/lib/warehouse/math";
import { isObjectId } from "@/lib/warehouse/warehouses";
import { companyWriteAccess } from "@/lib/company-write";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/warehouse/stock/[id] — edycja stanu minimalnego i lokalizacji pozycji. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    assertCanManageStock(user);

    const id = (await params).id;
    if (!isObjectId(id)) {
      throw new ApiError(400, "Nieprawidłowy identyfikator pozycji magazynowej.", "INVALID_ID");
    }

    const item = await prisma.stockItem.findFirst({ where: { id, userId: user.id } });
    if (!item) {
      throw new ApiError(404, "Nie znaleziono pozycji magazynowej.", "STOCK_ITEM_NOT_FOUND");
    }

    const body = await readJson(req);
    const data: Record<string, unknown> = {};

    if (body.minQuantity !== undefined) {
      const minQuantity = roundQty(num(body.minQuantity));
      if (minQuantity < 0) {
        throw new ApiError(400, "Stan minimalny nie może być ujemny.", "MIN_QUANTITY_INVALID");
      }
      data.minQuantity = minQuantity;
      // Zmiana progu zeruje throttling powiadomień, by kolejny alert dotarł natychmiast.
      data.lowStockAlertedAt = null;
    }

    if (body.location !== undefined) {
      data.location = cleanStr(body.location, 60, "lokalizacja") || null;
    }

    if (Object.keys(data).length === 0) {
      throw new ApiError(400, "Brak pól do aktualizacji (minQuantity, location).", "NOTHING_TO_UPDATE");
    }

    const updated = await prisma.$transaction(async tx => {
      const current = await tx.stockItem.findFirst({ where: { id: item.id, userId: user.id }, include: { warehouse: { select: { companyId: true } } } });
      if (!current) throw new ApiError(404, "Nie znaleziono pozycji magazynowej.", "STOCK_ITEM_NOT_FOUND");
      if (current.warehouse.companyId) await companyWriteAccess(tx, user.id, current.warehouse.companyId, "canIssueInvoices");
      return tx.stockItem.update({
        where: { id: current.id },
        data,
        include: { warehouse: { select: { name: true, code: true } } },
      });
    });

    return json({ item: stockItemToDto(updated) });
  } catch (e) {
    return handleApiError(e);
  }
}
