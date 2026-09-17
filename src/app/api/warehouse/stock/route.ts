import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { stockItemToDto, warehouseToDto } from "@/lib/warehouse/dto";
import { roundMoney, roundQty, sumMoney, sumQty } from "@/lib/warehouse/math";
import { isObjectId, listWarehouseRecords } from "@/lib/warehouse/warehouses";
import type { StockSummary } from "@/lib/warehouse/types";

export const runtime = "nodejs";

/**
 * GET /api/warehouse/stock?warehouseId=&search=&lowOnly=1
 * Stany magazynowe na żywo wraz z podsumowaniem (liczba pozycji, wartość, liczba alertów).
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const url = new URL(req.url);
    const warehouseId = url.searchParams.get("warehouseId") || "";
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();
    const lowOnly = ["1", "true", "yes"].includes((url.searchParams.get("lowOnly") || "").toLowerCase());

    const warehouses = await listWarehouseRecords(user.id);
    const warehouseNames = new Map(warehouses.map((w) => [w.id, w] as const));

    const rows = await prisma.stockItem.findMany({
      where: {
        userId: user.id,
        ...(isObjectId(warehouseId) ? { warehouseId } : {}),
      },
      orderBy: [{ name: "asc" }],
    });

    const withWarehouse = rows.map((row) => {
      const warehouse = warehouseNames.get(row.warehouseId);
      return stockItemToDto({
        ...row,
        warehouse: warehouse ? { name: warehouse.name, code: warehouse.code } : null,
      });
    });

    // Filtr tekstowy i „tylko niskie stany” liczymy w aplikacji — porównanie dwóch pól
    // (quantity vs minQuantity) nie jest wyrażalne w zapytaniu Prisma/Mongo.
    const filtered = withWarehouse.filter((item) => {
      if (lowOnly && !item.isLowStock) return false;
      if (!search) return true;
      return `${item.sku} ${item.name} ${item.location ?? ""}`.toLowerCase().includes(search);
    });

    const summary: StockSummary = {
      itemCount: filtered.length,
      totalValueNet: sumMoney(filtered.map((i) => i.valueNet)),
      totalQuantity: sumQty(filtered.map((i) => i.quantity)),
      alertCount: filtered.filter((i) => i.isLowStock).length,
    };

    return json({
      items: filtered,
      summary,
      warehouses: warehouses.map(warehouseToDto),
      totals: {
        allItemCount: withWarehouse.length,
        allValueNet: roundMoney(sumMoney(withWarehouse.map((i) => i.valueNet))),
        allAlertCount: withWarehouse.filter((i) => i.isLowStock).length,
        allQuantity: roundQty(sumQty(withWarehouse.map((i) => i.quantity))),
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
