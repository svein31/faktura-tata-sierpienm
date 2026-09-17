import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, cleanStr, handleApiError, json, num, readJson, str } from "@/lib/api";
import { stockDocumentToDto } from "@/lib/warehouse/dto";
import { assertCanManageStock } from "@/lib/warehouse/guard";
import {
  applyStockDocument,
  isStockDocumentType,
  STOCK_DOCUMENT_TYPES,
} from "@/lib/warehouse/stock-engine";
import type { StockDocumentLine } from "@/lib/warehouse/types";
import { isObjectId } from "@/lib/warehouse/warehouses";

export const runtime = "nodejs";

const MAX_LINES = 200;

/**
 * GET /api/warehouse/documents?type=&warehouseId=&from=&to=&limit=
 * Lista dokumentów magazynowych użytkownika (najnowsze pierwsze).
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "";
    const warehouseId = url.searchParams.get("warehouseId") || "";
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const limitRaw = Number(url.searchParams.get("limit") || 200);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 500) : 200;

    const issueDate: { gte?: string; lte?: string } = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) issueDate.gte = from;
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) issueDate.lte = to;

    const documents = await prisma.stockDocument.findMany({
      where: {
        userId: user.id,
        ...(isStockDocumentType(type) ? { type } : {}),
        ...(isObjectId(warehouseId) ? { warehouseId } : {}),
        ...(Object.keys(issueDate).length > 0 ? { issueDate } : {}),
      },
      include: { warehouse: { select: { name: true, code: true } } },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return json({ documents: documents.map(stockDocumentToDto) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/warehouse/documents — ręczne wystawienie dokumentu magazynowego
 * (RW / PW / MM, a także WZ / PZ bez powiązania z fakturą).
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    assertCanManageStock(user);

    const body = await readJson(req);

    const type = str(body.type).toUpperCase() as any;
    if (!isStockDocumentType(type)) {
      throw new ApiError(400, `Niepoprawny typ dokumentu magazynowego: ${str(body.type)}.`, "INVALID_TYPE");
    }

    const warehouseId = str(body.warehouseId);
    if (!warehouseId) {
      throw new ApiError(400, "Wymagane jest wskazanie magazynu.", "MISSING_WAREHOUSE");
    }

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) {
      throw new ApiError(400, "Dokument musi zawierać przynajmniej jedną pozycję.", "EMPTY_LINES");
    }
    if (rawLines.length > MAX_LINES) {
      throw new ApiError(400, `Przekroczono maksymalną liczbę pozycji (${MAX_LINES}).`, "TOO_MANY_LINES");
    }

    const lines: StockDocumentLine[] = rawLines.map((l: any) => {
      const q = num(l.quantity);
      const p = num(l.unitPriceNet);
      return {
        stockItemId: typeof l.stockItemId === "string" && l.stockItemId.trim() ? l.stockItemId.trim() : undefined,
        productId: typeof l.productId === "string" && l.productId.trim() ? l.productId.trim() : undefined,
        sku: str(l.sku),
        name: str(l.name),
        unit: str(l.unit) || "szt.",
        quantity: q,
        unitPriceNet: p,
        valueNet: num(l.valueNet) || Math.round(q * p * 100) / 100,
      };
    });

    const result = await applyStockDocument({
      userId: user.id,
      warehouseId,
      type,
      lines,
      issueDate: str(body.issueDate) || new Date().toISOString().slice(0, 10),
      contractorId: typeof body.contractorId === "string" && body.contractorId.trim() ? body.contractorId.trim() : undefined,
      contractorName: typeof body.contractorName === "string" && body.contractorName.trim() ? body.contractorName.trim() : undefined,
      targetWarehouseId: typeof body.targetWarehouseId === "string" && body.targetWarehouseId.trim() ? body.targetWarehouseId.trim() : undefined,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : undefined,
      allowNegative: Boolean(body.allowNegative),
      issuedBy: typeof body.issuedBy === "string" && body.issuedBy.trim() ? body.issuedBy.trim() : user.name || null,
      receivedBy: typeof body.receivedBy === "string" && body.receivedBy.trim() ? body.receivedBy.trim() : undefined,
    });

    return json({ document: result.document, movements: result.movements, alerts: result.alerts, warnings: result.warnings }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}