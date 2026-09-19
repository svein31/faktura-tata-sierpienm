import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { inventoryQuery, warehouseReadScope } from "@/lib/warehouse/read-scope";

export const runtime = "nodejs";
const PAGE_SIZE = 30;

/** Read-only, company-scoped API. Does not create a default warehouse on GET. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany." }, { status: 401 });
    const params = new URL(req.url).searchParams;
    const q = inventoryQuery(params);
    const scope = await warehouseReadScope(user.id, params.get("companyId"));
    const warehouses = await prisma.warehouse.findMany({
      where: scope, select: { id: true, name: true, code: true, isActive: true }, orderBy: [{ code: "asc" }, { id: "asc" }],
    });
    if (q.warehouseId && !warehouses.some(w => w.id === q.warehouseId)) throw new ApiError(404, "Nie znaleziono magazynu w tym widoku.");
    const warehouseIds = q.warehouseId ? [q.warehouseId] : warehouses.map(w => w.id);
    const warehouseId = { in: warehouseIds };
    if (q.itemId && !await prisma.stockItem.findFirst({ where: { id: q.itemId, warehouseId }, select: { id: true } })) {
      throw new ApiError(404, "Nie znaleziono pozycji w tym widoku.");
    }
    const after = q.cursor ? { id: { lt: q.cursor } } : {};
    const search = { contains: q.search, mode: "insensitive" as const };
    let rows: unknown[];
    let nextCursor: string | null = null;
    let total = 0;
    if (q.view === "stock") {
      const where: Prisma.StockItemWhereInput = {
        warehouseId,
        ...(q.search ? { OR: [{ name: search }, { sku: search }, { location: search }] } : {}),
        ...(q.lowOnly ? { minQuantity: { gt: 0 }, quantity: { lte: prisma.stockItem.fields.minQuantity } } : {}),
      };
      const [items, count] = await Promise.all([
        prisma.stockItem.findMany({ where: { ...where, ...after }, orderBy: { id: "desc" }, take: PAGE_SIZE + 1,
          select: { id: true, warehouseId: true, sku: true, name: true, unit: true, quantity: true, reserved: true, minQuantity: true, location: true, lastMovementAt: true } }),
        prisma.stockItem.count({ where }),
      ]);
      total = count;
      if (items.length > PAGE_SIZE) nextCursor = items[PAGE_SIZE - 1].id;
      rows = items.slice(0, PAGE_SIZE).map(item => ({ ...item, available: Math.round((item.quantity - item.reserved) * 1000) / 1000, isLowStock: item.minQuantity > 0 && item.quantity <= item.minQuantity }));
    } else if (q.view === "documents") {
      const where: Prisma.StockDocumentWhereInput = { warehouseId,
        ...(q.search ? { OR: [{ number: search }, { contractorName: search }, { sourceNumber: search }] } : {}),
      };
      const [documents, count] = await Promise.all([
        prisma.stockDocument.findMany({ where: { ...where, ...after }, orderBy: { id: "desc" }, take: PAGE_SIZE + 1,
          select: { id: true, warehouseId: true, number: true, type: true, status: true, issueDate: true, contractorName: true, lines: true } }),
        prisma.stockDocument.count({ where }),
      ]);
      total = count;
      if (documents.length > PAGE_SIZE) nextCursor = documents[PAGE_SIZE - 1].id;
      // A linked source/target may belong to a different historical company: don't expose it.
      // The old schema has no currency; do not guess PLN or aggregate monetary values.
      rows = documents.slice(0, PAGE_SIZE).map(doc => ({ ...doc, lines: Array.isArray(doc.lines) ? doc.lines.map(raw => {
        const line = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
        return { sku: String(line.sku ?? ""), name: String(line.name ?? ""), unit: String(line.unit ?? ""), quantity: Number(line.quantity) || 0 };
      }) : [] }));
    } else {
      const where: Prisma.StockMovementWhereInput = { warehouseId, ...(q.itemId ? { stockItemId: q.itemId } : {}),
        ...(q.search ? { OR: [{ name: search }, { sku: search }] } : {}),
      };
      const [movements, count] = await Promise.all([
        prisma.stockMovement.findMany({ where: { ...where, ...after }, orderBy: { id: "desc" }, take: PAGE_SIZE + 1,
          select: { id: true, warehouseId: true, sku: true, name: true, quantityChange: true, quantityBefore: true, quantityAfter: true, createdAt: true } }),
        prisma.stockMovement.count({ where }),
      ]);
      total = count;
      if (movements.length > PAGE_SIZE) nextCursor = movements[PAGE_SIZE - 1].id;
      rows = movements.slice(0, PAGE_SIZE);
    }
    return json({ warehouses, rows, nextCursor, total, view: q.view });
  } catch (error) { return handleApiError(error); }
}
