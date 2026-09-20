/**
 * Silnik stanów magazynowych — serce modułu WMS.
 *
 * Odpowiada za:
 *  • naniesienie dokumentu magazynowego (WZ / PZ / RW / PW / MM) na stany,
 *  • wycenę metodą średniej ważonej (przyjęcie aktualizuje średnią, wydanie wycenia po średniej),
 *  • zapis nieusuwalnego śladu audytowego (`StockMovement` z `quantityBefore`/`quantityAfter`),
 *  • blokadę stanów ujemnych (z możliwością świadomego dopuszczenia),
 *  • parę dokumentów przy przesunięciu międzymagazynowym (MM),
 *  • alerty niskiego stanu wraz z powiadomieniem (throttling 24 h),
 *  • anulowanie dokumentu przez naniesienie ruchów odwrotnych (bez usuwania historii).
 *
 * Dokument, stany, ruchy, alerty i audyt są zapisywane w jednej transakcji MongoDB.
 * Konflikt zapisu jest zwracany do klienta; nie odtwarzamy starych stanów kompensacją.
 */

import type {
  Prisma,
  StockDocument as DbStockDocument,
  StockItem as DbStockItem,
  StockMovement as DbStockMovement,
  Warehouse as DbWarehouse,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { recordAuditLog } from "@/lib/audit";
import type { StockDirection, StockDocumentType } from "@/lib/types";
import { stockDocumentToDto, stockMovementToDto, toJsonValue } from "./dto";
import { qtyLabel, roundMoney, roundQty, sumMoney, sumQty } from "./math";
import { nextStockDocumentNumber } from "./numbering";
import type {
  ApplyStockDocumentParams,
  ApplyStockDocumentResult,
  CancelStockDocumentResult,
  LowStockAlert,
  StockDocumentLine,
} from "./types";
import { resolveWarehouse } from "./warehouses";
import { lockWarehouses, assertNoStocktaking } from "./transaction";
import { companyAccess } from "@/lib/company-write";

export const STOCK_DOCUMENT_TYPES: StockDocumentType[] = ["WZ", "PZ", "RW", "PW", "MM"];

const LOW_STOCK_THROTTLE_MS = 24 * 60 * 60 * 1000;

/** Kierunek ruchu dla danego typu dokumentu. */
export function directionForType(type: StockDocumentType): StockDirection {
  switch (type) {
    case "PZ":
    case "PW":
      return "in";
    case "WZ":
    case "RW":
      return "out";
    case "MM":
      return "transfer";
    default:
      throw new ApiError(400, `Nieznany typ dokumentu magazynowego: ${String(type)}.`, "INVALID_TYPE");
  }
}

export function isStockDocumentType(v: unknown): v is StockDocumentType {
  return typeof v === "string" && (STOCK_DOCUMENT_TYPES as string[]).includes(v);
}

/** Zastępcze SKU dla pozycji bez własnego symbolu (np. produkt z katalogu bez SKU). */
export function fallbackSku(name: string): string {
  const base = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/gi, "l")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base ? `AUTO-${base}` : "AUTO-POZYCJA";
}

/** Normalizacja i walidacja pozycji dokumentu. */
export function normalizeDocumentLines(lines: unknown): StockDocumentLine[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ApiError(400, "Dokument magazynowy musi mieć co najmniej jedną pozycję.", "EMPTY_LINES");
  }
  if (lines.length > 200) throw new ApiError(400, "Dokument może zawierać maksymalnie 200 pozycji.");

  return lines.map((raw, index) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const name = typeof l.name === "string" ? l.name.trim() : "";
    if (!name) {
      throw new ApiError(400, `Pozycja ${index + 1}: podaj nazwę towaru.`, "LINE_NAME_REQUIRED");
    }

    if (typeof l.quantity !== "number" || !Number.isFinite(l.quantity) || l.quantity > 1e9) throw new ApiError(400, "Nieprawidłowa ilość.");
    if (typeof l.unitPriceNet !== "number" || !Number.isFinite(l.unitPriceNet) || l.unitPriceNet < 0 || l.unitPriceNet > 1e9) throw new ApiError(400, "Nieprawidłowa cena.");
    const quantity = roundQty(l.quantity);
    if (!(quantity > 0)) {
      throw new ApiError(
        400,
        `Pozycja „${name}”: ilość musi być większa od zera.`,
        "LINE_QUANTITY_INVALID"
      );
    }

    const unitPriceNet = roundMoney(l.unitPriceNet);
    if (unitPriceNet < 0) {
      throw new ApiError(
        400,
        `Pozycja „${name}”: cena netto nie może być ujemna.`,
        "LINE_PRICE_INVALID"
      );
    }

    const sku = (typeof l.sku === "string" ? l.sku.trim() : "") || fallbackSku(name);
    const unit = (typeof l.unit === "string" ? l.unit.trim() : "") || "szt.";

    return {
      stockItemId: typeof l.stockItemId === "string" && l.stockItemId ? l.stockItemId : undefined,
      productId: typeof l.productId === "string" && l.productId ? l.productId : undefined,
      sku: sku.slice(0, 80),
      name: name.slice(0, 200),
      unit: unit.slice(0, 20),
      quantity,
      unitPriceNet,
      valueNet: roundMoney(quantity * unitPriceNet),
    };
  });
}

/* ── Alert niskiego stanu ────────────────────────────────────────────────── */

/**
 * Sprawdza próg stanu minimalnego. Zwraca alert, gdy `quantity <= minQuantity && minQuantity > 0`.
 * Powiadomienie w dzwonku tworzone jest nie częściej niż raz na 24 h dla tej samej pozycji.
 */
async function checkLowStock(
  item: DbStockItem,
  warehouse: DbWarehouse,
  prisma: Prisma.TransactionClient
): Promise<LowStockAlert | null> {
  const quantity = roundQty(item.quantity);
  const minQuantity = roundQty(item.minQuantity);
  if (!(minQuantity > 0) || quantity > minQuantity) return null;

  const last = item.lowStockAlertedAt ? item.lowStockAlertedAt.getTime() : 0;
  const shouldNotify = Date.now() - last >= LOW_STOCK_THROTTLE_MS;

  if (shouldNotify) {
    await prisma.notification
      .create({
        data: {
          userId: item.userId,
          kind: "system",
          title: "Niski stan magazynowy",
          body: `${item.name} (${item.sku}) — stan ${qtyLabel(quantity)} ${item.unit} przy minimum ${qtyLabel(minQuantity)} ${item.unit} w magazynie ${warehouse.name}.`,
          link: "/warehouse",
        },
      });
    await prisma.stockItem
      .update({ where: { id: item.id }, data: { lowStockAlertedAt: new Date() } });
  }

  return {
    stockItemId: item.id,
    warehouseId: item.warehouseId,
    warehouseName: warehouse.name,
    productId: item.productId ?? null,
    sku: item.sku,
    name: item.name,
    unit: item.unit,
    quantity,
    minQuantity,
    deficit: roundQty(Math.max(0, minQuantity - quantity)),
    notified: shouldNotify,
  };
}

/* ── Naniesienie jednego dokumentu ───────────────────────────────────────── */

interface IssueInput {
  userId: string;
  warehouse: DbWarehouse;
  type: StockDocumentType;
  direction: Exclude<StockDirection, "transfer">;
  lines: StockDocumentLine[];
  issueDate: string;
  sourceType: string;
  sourceId: string | null;
  sourceNumber: string | null;
  contractorId: string | null;
  contractorName: string | null;
  targetWarehouse: DbWarehouse | null;
  notes: string | null;
  isAutomatic: boolean;
  allowNegative: boolean;
  number: string;
  issuedBy: string | null;
  receivedBy: string | null;
}

interface IssueOutput {
  document: DbStockDocument;
  movements: DbStockMovement[];
  alerts: LowStockAlert[];
  warnings: string[];
}

/** Wyszukuje pozycję magazynową po SKU w obrębie magazynu (z izolacją najemcy). */
async function findStockItem(
  userId: string,
  warehouseId: string,
  sku: string,
  prisma: Prisma.TransactionClient
): Promise<DbStockItem | null> {
  return prisma.stockItem.findFirst({ where: { userId, warehouseId, sku } });
}

/** Tworzy brakującą pozycję magazynową (stan startowy 0). */
async function createStockItem(
  userId: string,
  warehouse: DbWarehouse,
  line: StockDocumentLine,
  prisma: Prisma.TransactionClient
): Promise<DbStockItem> {
  let productId = line.productId ?? null;
  let minQuantity = 0;

  const product = productId
    ? await prisma.product.findFirst({ where: { id: productId, userId, companyId: warehouse.companyId } })
    : await prisma.product.findFirst({ where: { userId, sku: line.sku, ...(warehouse.companyId ? { companyId: warehouse.companyId } : { OR: [{ companyId: null }, { companyId: { isSet: false } }] }) } });

  if (product) {
    productId = product.id;
    minQuantity = roundQty(product.minQuantity);
  }

  return prisma.stockItem.create({
      data: {
        userId,
        warehouseId: warehouse.id,
        productId,
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        quantity: 0,
        reserved: 0,
        minQuantity,
        avgPurchasePrice: 0,
        lastPurchasePrice: 0,
        valueNet: 0,
      },
    });
}

/** Sumuje zapotrzebowanie per SKU (jedna pozycja może wystąpić w wielu liniach). */
function aggregateBySku(lines: StockDocumentLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    map.set(line.sku, roundQty((map.get(line.sku) ?? 0) + line.quantity));
  }
  return map;
}

/**
 * Pre-flight dla wydań: sprawdza dostępność stanu PRZED jakimkolwiek zapisem.
 * Zwraca ostrzeżenia, gdy operacja jest dopuszczona mimo zejścia poniżej zera.
 */
async function preflightOut(input: IssueInput, prisma: Prisma.TransactionClient): Promise<string[]> {
  const warnings: string[] = [];
  const needed = aggregateBySku(input.lines);

  for (const [sku, quantity] of needed) {
    const line = input.lines.find((l) => l.sku === sku)!;
    const item = await findStockItem(input.userId, input.warehouse.id, sku, prisma);

    if (!item) {
      if (!input.allowNegative) {
        throw new ApiError(
          400,
          `Pozycja „${line.name}” (SKU ${sku}) nie występuje w magazynie ${input.warehouse.name} — nie można jej wydać.`,
          "STOCK_ITEM_NOT_FOUND"
        );
      }
      warnings.push(
        `Pozycja „${line.name}” (SKU ${sku}) nie istniała w magazynie ${input.warehouse.name} — utworzono ją ze stanem ujemnym.`
      );
      continue;
    }

    const after = roundQty(item.quantity - quantity);
    if (after < 0) {
      if (!input.allowNegative) {
        throw new ApiError(
          400,
          `Brak wystarczającego stanu dla pozycji „${item.name}” (SKU ${sku}) w magazynie ${input.warehouse.name}: stan ${qtyLabel(item.quantity)} ${item.unit}, wymagane ${qtyLabel(quantity)} ${item.unit}, brakuje ${qtyLabel(Math.abs(after))} ${item.unit}.`,
          "INSUFFICIENT_STOCK"
        );
      }
      warnings.push(
        `Pozycja „${item.name}” (SKU ${sku}) zejdzie poniżej zera: stan po operacji ${qtyLabel(after)} ${item.unit}.`
      );
    }
  }

  return warnings;
}

/** Tworzy dokument i nanosi wszystkie jego pozycje na stany magazynowe. */
async function issueDocument(input: IssueInput, prisma: Prisma.TransactionClient): Promise<IssueOutput> {
  const warnings: string[] =
    input.direction === "out" ? await preflightOut(input, prisma) : [];

  const totalQuantity = sumQty(input.lines.map((l) => l.quantity));
  const totalValueNet = sumMoney(input.lines.map((l) => l.valueNet));

  const document = await prisma.stockDocument.create({
    data: {
      userId: input.userId,
      warehouseId: input.warehouse.id,
      number: input.number,
      type: input.type,
      direction: input.direction,
      status: "issued",
      issueDate: input.issueDate,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceNumber: input.sourceNumber,
      isAutomatic: input.isAutomatic,
      contractorId: input.contractorId,
      contractorName: input.contractorName,
      targetWarehouseId: input.targetWarehouse ? input.targetWarehouse.id : null,
      targetWarehouseName: input.targetWarehouse ? input.targetWarehouse.name : null,
      lines: toJsonValue(input.lines),
      totalQuantity,
      totalValueNet,
      notes: input.notes,
      issuedBy: input.issuedBy,
      receivedBy: input.receivedBy,
    },
  });

  const reason = input.sourceNumber
    ? `${input.type} ${input.number} — ${input.sourceType} ${input.sourceNumber}`
    : `${input.type} ${input.number}`;

  const movements: DbStockMovement[] = [];
  const alertsByItem = new Map<string, LowStockAlert>();

  try {
    for (const line of input.lines) {
      let item = await findStockItem(input.userId, input.warehouse.id, line.sku, prisma);
      if (!item) {
        item = await createStockItem(input.userId, input.warehouse, line, prisma);

      }

      const before = roundQty(item.quantity);
      const quantityChange = input.direction === "in" ? line.quantity : -line.quantity;
      const after = roundQty(before + quantityChange);

      let avgPurchasePrice = roundMoney(item.avgPurchasePrice);
      let lastPurchasePrice = roundMoney(item.lastPurchasePrice);
      let movementPrice = avgPurchasePrice;

      if (input.direction === "in") {
        // Średnia ważona: (stan × średnia + przyjęto × cena przyjęcia) / (stan + przyjęto)
        if (before <= 0) {
          avgPurchasePrice = line.unitPriceNet;
        } else if (after > 0) {
          avgPurchasePrice = roundMoney(
            (before * avgPurchasePrice + line.quantity * line.unitPriceNet) / after
          );
        }
        lastPurchasePrice = line.unitPriceNet;
        movementPrice = line.unitPriceNet;
      } else {
        // Rozchód wyceniany po średniej ważonej — średnia pozostaje bez zmian.
        movementPrice = avgPurchasePrice > 0 ? avgPurchasePrice : line.unitPriceNet;
      }

      const valueNet = roundMoney(after * avgPurchasePrice);
      const now = new Date();

      const updated = await prisma.stockItem.update({
        where: { id: item.id },
        data: {
          quantity: after,
          avgPurchasePrice,
          lastPurchasePrice,
          valueNet,
          lastMovementAt: now,
          // Wyjście ze stanu alertowego zeruje throttling, by kolejny spadek powiadomił od razu.
          ...(item.minQuantity > 0 && after > item.minQuantity ? { lowStockAlertedAt: null } : {}),
          ...(item.name !== line.name ? { name: line.name } : {}),
          ...(line.productId && !item.productId ? { productId: line.productId } : {}),
        },
      });

      const movement = await prisma.stockMovement.create({
        data: {
          userId: input.userId,
          warehouseId: input.warehouse.id,
          stockItemId: item.id,
          documentId: document.id,
          documentNumber: document.number,
          documentType: input.type,
          sku: line.sku,
          name: line.name,
          quantityChange,
          quantityBefore: before,
          quantityAfter: after,
          unitPriceNet: movementPrice,
          valueNet: roundMoney(quantityChange * movementPrice),
          reason,
        },
      });
      movements.push(movement);

      const alert = await checkLowStock(updated, input.warehouse, prisma);
      if (alert) alertsByItem.set(alert.stockItemId, alert);
    }
  } catch (e) {
    throw e; // The enclosing transaction rolls back every write.
  }

  const valuedLines = input.lines.map((line, index) => ({ ...line, unitPriceNet: movements[index].unitPriceNet, valueNet: roundMoney(Math.abs(movements[index].valueNet)) }));
  const valuedDocument = await prisma.stockDocument.update({ where: { id: document.id }, data: { lines: toJsonValue(valuedLines), totalValueNet: sumMoney(valuedLines.map(line => line.valueNet)) } });
  return {
    document: valuedDocument,
    movements,
    alerts: [...alertsByItem.values()],
    warnings,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeIssueDate(date: unknown): string {
  const raw = typeof date === "string" ? date.trim() : "";
  if (!raw) return todayIso();
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new ApiError(400, "Nieprawidłowa data dokumentu.");
  return raw;
}

/* ── API publiczne ───────────────────────────────────────────────────────── */

/**
 * Nanosi dokument magazynowy na stany.
 *
 * • WZ → wydanie, PZ → przyjęcie, RW → wydanie, PW → przyjęcie, MM → przesunięcie (para dokumentów).
 * • Przy przyjęciu brakująca pozycja jest tworzona automatycznie; przy wydaniu brak pozycji
 *   lub niewystarczający stan kończy się błędem `ApiError(400)` (chyba że `allowNegative`).
 * • Zwraca dokument (dla MM — dokument wydania), wszystkie ruchy, alerty i ostrzeżenia.
 */
export async function applyStockDocument(
  params: ApplyStockDocumentParams
): Promise<ApplyStockDocumentResult> {
  return prisma.$transaction(tx => applyStockDocumentInTransaction(params, tx), { maxWait: 5000, timeout: 30000 });
}

/** Also used by stocktaking so both adjustments commit atomically with its closure. */
export async function applyStockDocumentInTransaction(
  params: ApplyStockDocumentParams,
  prisma: Prisma.TransactionClient
): Promise<ApplyStockDocumentResult> {
  const userId = params.userId;
  if (!userId) throw new ApiError(401, "Brak kontekstu użytkownika.", "UNAUTHENTICATED");

  if (!isStockDocumentType(params.type)) {
    throw new ApiError(
      400,
      `Nieprawidłowy typ dokumentu magazynowego. Dozwolone: ${STOCK_DOCUMENT_TYPES.join(", ")}.`,
      "INVALID_TYPE"
    );
  }

  const type = params.type;
  const lines = normalizeDocumentLines(params.lines);
  const issueDate = normalizeIssueDate(params.issueDate);
  const warehouse = await resolveWarehouse(userId, params.warehouseId, prisma);
  if (warehouse.companyId) await companyAccess(prisma, params.actor?.userId || userId, warehouse.companyId, "canIssueInvoices");
  if (!warehouse.isActive) throw new ApiError(409, "Magazyn jest nieaktywny.");
  const targetId = params.type === "MM" ? params.targetWarehouseId : null;
  const targetRecord = targetId ? await resolveWarehouse(userId, targetId, prisma) : null;
  if (targetRecord && (targetRecord.companyId !== warehouse.companyId || !targetRecord.isActive)) throw new ApiError(400, "Przesunięcie wymaga aktywnych magazynów w tej samej firmie.");
  await lockWarehouses(prisma, userId, [warehouse.id, ...(targetRecord ? [targetRecord.id] : [])]);
  await assertNoStocktaking(prisma, warehouse.id, params.sourceType === "stocktaking" ? params.sourceId : undefined);
  if (targetRecord) await assertNoStocktaking(prisma, targetRecord.id);
  for (const line of lines) {
    if (line.productId) {
      const product = await prisma.product.findFirst({ where: { id: line.productId, userId } });
      if (!product || product.companyId !== warehouse.companyId) throw new ApiError(400, "Towar nie należy do firmy magazynu.");
    }
    if (line.stockItemId) {
      const item = await prisma.stockItem.findFirst({ where: { id: line.stockItemId, warehouseId: warehouse.id, userId } });
      if (!item || item.sku !== line.sku || item.unit !== line.unit) throw new ApiError(400, "Pozycja magazynowa nie odpowiada SKU lub jednostce.");
    }
    const existing = await prisma.stockItem.findFirst({ where: { warehouseId: warehouse.id, sku: line.sku } });
    if (existing && existing.unit !== line.unit) throw new ApiError(400, "Nie można zmienić jednostki istniejącego towaru.");
    const targetItem = targetRecord ? await prisma.stockItem.findFirst({ where: { warehouseId: targetRecord.id, sku: line.sku } }) : null;
    if (targetItem && targetItem.unit !== line.unit) throw new ApiError(400, "Magazyn docelowy używa innej jednostki dla tego SKU.");
  }
  const allowNegative = params.allowNegative === true;

  const common = {
    userId,
    lines,
    issueDate,
    sourceType: (params.sourceType || "manual").slice(0, 40),
    sourceId: params.sourceId ?? null,
    sourceNumber: params.sourceNumber ?? null,
    contractorId: params.contractorId ?? null,
    contractorName: params.contractorName ?? null,
    notes: params.notes ?? null,
    isAutomatic: params.isAutomatic === true,
    allowNegative,
    issuedBy: params.issuedBy ?? null,
    receivedBy: params.receivedBy ?? null,
  };

  /* ── MM: para dokumentów (wydanie ze źródła + przyjęcie w magazynie docelowym) ── */
  if (type === "MM") {
    if (!params.targetWarehouseId) {
      throw new ApiError(
        400,
        "Przesunięcie międzymagazynowe (MM) wymaga wskazania magazynu docelowego.",
        "TARGET_WAREHOUSE_REQUIRED"
      );
    }
    if (params.targetWarehouseId === warehouse.id) {
      throw new ApiError(
        400,
        "Magazyn docelowy musi być inny niż magazyn źródłowy.",
        "TARGET_WAREHOUSE_SAME"
      );
    }
    const target = await resolveWarehouse(userId, params.targetWarehouseId, prisma);

    const outNumber = params.number || (await nextStockDocumentNumber(userId, "MM", issueDate, prisma));
    const out = await issueDocument({
      ...common,
      warehouse,
      type: "MM",
      direction: "out",
      targetWarehouse: target,
      number: outNumber,
      notes: common.notes ?? `Przesunięcie do magazynu ${target.name}`,
    }, prisma);

    // Pozycje przyjęcia wyceniamy po średniej z magazynu źródłowego — wartość podąża za towarem.
    const inLines: StockDocumentLine[] = lines.map((line, index) => {
      const movement = out.movements[index];
      const price = movement && movement.unitPriceNet > 0 ? movement.unitPriceNet : line.unitPriceNet;
      return {
        ...line,
        stockItemId: undefined,
        unitPriceNet: roundMoney(price),
        valueNet: roundMoney(line.quantity * price),
      };
    });

    let inResult: IssueOutput;
    try {
      const inNumber = await nextStockDocumentNumber(userId, "MM", issueDate, prisma);
      inResult = await issueDocument({
        ...common,
        lines: inLines,
        warehouse: target,
        type: "MM",
        direction: "in",
        targetWarehouse: warehouse,
        number: inNumber,
        notes: common.notes ?? `Przyjęcie z magazynu ${warehouse.name}`,
      }, prisma);
    } catch (e) {
      // Przyjęcie się nie udało — wycofujemy również wydanie, aby nie „zgubić” towaru.
      throw e;
    }

    const [outDoc, inDoc] = await Promise.all([
      prisma.stockDocument.update({
        where: { id: out.document.id },
        data: { pairedDocumentId: inResult.document.id },
      }),
      prisma.stockDocument.update({
        where: { id: inResult.document.id },
        data: { pairedDocumentId: out.document.id },
      }),
    ]);

    await recordAuditLog({
    client: prisma,
      userId, ...params.actor, companyId: warehouse.companyId,
      action: "stock.transfer",
      entityType: "stockDocument",
      entityId: outDoc.id,
      description: `Przesunięcie MM ${outDoc.number} → ${inDoc.number} (${warehouse.name} → ${target.name})`,
      details: {
        outNumber: outDoc.number,
        inNumber: inDoc.number,
        totalQuantity: outDoc.totalQuantity,
        totalValueNet: outDoc.totalValueNet,
      },
    });

    return {
      document: stockDocumentToDto({ ...outDoc, warehouse }),
      movements: [...out.movements, ...inResult.movements].map(stockMovementToDto),
      alerts: [...out.alerts, ...inResult.alerts],
      warnings: [...out.warnings, ...inResult.warnings],
    };
  }

  /* ── WZ / PZ / RW / PW ── */
  const direction = directionForType(type) as Exclude<StockDirection, "transfer">;
  const number = params.number || (await nextStockDocumentNumber(userId, type, issueDate, prisma));

  const result = await issueDocument({
    ...common,
    warehouse,
    type,
    direction,
    targetWarehouse: null,
    number,
  }, prisma);

  await recordAuditLog({
    client: prisma,
    userId, ...params.actor, companyId: warehouse.companyId,
    action: direction === "in" ? "stock.receipt" : "stock.release",
    entityType: "stockDocument",
    entityId: result.document.id,
    description: `Dokument ${type} ${number} (${warehouse.name}) — ${qtyLabel(result.document.totalQuantity)} jm., ${result.document.totalValueNet.toFixed(2)} PLN`,
    details: {
      number,
      type,
      sourceType: common.sourceType,
      sourceNumber: common.sourceNumber,
      isAutomatic: common.isAutomatic,
      warnings: result.warnings,
    },
  });

  return {
    document: stockDocumentToDto({ ...result.document, warehouse }),
    movements: result.movements.map(stockMovementToDto),
    alerts: result.alerts,
    warnings: result.warnings,
  };
}

/**
 * Anuluje dokument magazynowy: ustawia `status: "cancelled"` i nanosi ruchy odwrotne.
 * Historia ruchów NIE jest usuwana — powstają dodatkowe, przeciwstawne wpisy.
 * Dla dokumentów MM anulowane są oba dokumenty pary.
 */
export async function cancelStockDocument(
  userId: string,
  documentId: string,
  reason?: string | null
): Promise<CancelStockDocumentResult> {
  return prisma.$transaction(tx => cancelStockDocumentInTransaction(userId, documentId, reason, tx), { maxWait: 5000, timeout: 30000 });
}

export async function cancelStockDocumentInTransaction(
  userId: string, documentId: string, reason: string | null | undefined, prisma: Prisma.TransactionClient,
  actor?: ApplyStockDocumentParams["actor"]
): Promise<CancelStockDocumentResult> {
  if (!userId) throw new ApiError(401, "Brak kontekstu użytkownika.", "UNAUTHENTICATED");

  const document = await prisma.stockDocument.findFirst({ where: { id: documentId, userId } });
  if (!document) {
    throw new ApiError(404, "Nie znaleziono dokumentu magazynowego.", "DOCUMENT_NOT_FOUND");
  }
  if (document.status === "cancelled") {
    throw new ApiError(400, `Dokument ${document.number} jest już anulowany.`, "ALREADY_CANCELLED");
  }
  const pairedDocument = document.pairedDocumentId ? await prisma.stockDocument.findFirst({ where: { id: document.pairedDocumentId, userId } }) : null;
  if (document.pairedDocumentId && (!pairedDocument || pairedDocument.status === "cancelled")) throw new ApiError(409, "Niespójna para dokumentów MM — wymagana weryfikacja.");
  const warehouseIds = [document.warehouseId, ...(pairedDocument ? [pairedDocument.warehouseId] : [])];
  for (const warehouseId of warehouseIds) {
    const owned = await resolveWarehouse(userId, warehouseId, prisma);
    if (owned.companyId) await companyAccess(prisma, actor?.userId || userId, owned.companyId, "canIssueInvoices");
  }
  await lockWarehouses(prisma, userId, warehouseIds);
  for (const id of warehouseIds) await assertNoStocktaking(prisma, id);

  const cancelReason = (typeof reason === "string" ? reason.trim() : "") || "Anulowanie dokumentu";
  const warnings: string[] = [];
  const reverseMovements: DbStockMovement[] = [];

  const applyReversal = async (doc: DbStockDocument): Promise<void> => {
    const warehouse = await prisma.warehouse.findFirst({ where: { id: doc.warehouseId, userId } });
    const movements = await prisma.stockMovement.findMany({
      where: { userId, documentId: doc.id },
      orderBy: { createdAt: "asc" },
    });

    for (const movement of movements) {
      const item = await prisma.stockItem.findFirst({
        where: { id: movement.stockItemId, userId },
      });
      if (!item) {
        throw new ApiError(409, "Brak pozycji dla ruchu odwrotnego — anulowanie wycofano.");
      }

      const before = roundQty(item.quantity);
      const quantityChange = roundQty(-movement.quantityChange);
      const after = roundQty(before + quantityChange);
      if (after < 0) {
        warnings.push(
          `Anulowanie dokumentu ${doc.number} sprowadza pozycję „${item.name}” (${item.sku}) do stanu ${qtyLabel(after)} ${item.unit}.`
        );
      }

      // Średnia ważona nie jest przeliczana wstecz — korekta wartości odbywa się po bieżącej średniej.
      const avg = roundMoney(item.avgPurchasePrice);
      await prisma.stockItem.update({
        where: { id: item.id },
        data: {
          quantity: after,
          valueNet: roundMoney(after * avg),
          lastMovementAt: new Date(),
        },
      });

      const reverse = await prisma.stockMovement.create({
        data: {
          userId,
          warehouseId: doc.warehouseId,
          stockItemId: item.id,
          documentId: doc.id,
          documentNumber: doc.number,
          documentType: doc.type,
          sku: movement.sku,
          name: movement.name,
          quantityChange,
          quantityBefore: before,
          quantityAfter: after,
          unitPriceNet: roundMoney(movement.unitPriceNet),
          valueNet: roundMoney(quantityChange * movement.unitPriceNet),
          reason: `Anulowanie ${doc.type} ${doc.number}: ${cancelReason}`,
        },
      });
      reverseMovements.push(reverse);

      if (warehouse) {
        const refreshed = await prisma.stockItem.findFirst({ where: { id: item.id, userId } });
        if (refreshed) await checkLowStock(refreshed, warehouse, prisma);
      }
    }

    await prisma.stockDocument.update({
      where: { id: doc.id },
      data: { status: "cancelled", cancelledAt: new Date(), cancelReason },
    });
  };

  await applyReversal(document);

  if (document.pairedDocumentId) {
    const paired = await prisma.stockDocument.findFirst({
      where: { id: document.pairedDocumentId, userId },
    });
    if (paired && paired.status !== "cancelled") {
      await applyReversal(paired);
      warnings.push(`Anulowano również sparowany dokument ${paired.number}.`);
    }
  }

  const updated = await prisma.stockDocument.findFirst({ where: { id: document.id, userId } });
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: document.warehouseId, userId },
  });

  await recordAuditLog({
    client: prisma,
    userId, ...actor, companyId: warehouse?.companyId,
    action: "stock.document.cancelled",
    entityType: "stockDocument",
    entityId: document.id,
    description: `Anulowano dokument ${document.type} ${document.number}: ${cancelReason}`,
    details: { number: document.number, reason: cancelReason, warnings },
  });

  return {
    document: stockDocumentToDto({
      ...(updated ?? document),
      status: "cancelled",
      cancelReason,
      warehouse: warehouse ? { name: warehouse.name, code: warehouse.code } : null,
    }),
    movements: reverseMovements.map(stockMovementToDto),
    warnings,
  };
}
