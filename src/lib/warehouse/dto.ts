/**
 * Mapowanie rekordów Prisma modułu magazynowego → DTO używane przez API i frontend.
 * Pola JSON (`address`, `lines`) są defensywnie rzutowane na typy aplikacji.
 */

import type {
  Prisma,
  StockDocument as DbStockDocument,
  StockItem as DbStockItem,
  StockMovement as DbStockMovement,
  Stocktaking as DbStocktaking,
  Warehouse as DbWarehouse,
} from "@prisma/client";
import type { StockDirection, StockDocumentType } from "@/lib/types";
import { roundMoney, roundQty } from "./math";
import type {
  StockDocumentDto,
  StockDocumentLine,
  StockDocumentStatus,
  StockItemDto,
  StockMovementDto,
  StocktakingDto,
  StocktakingLine,
  StocktakingStatus,
  WarehouseAddress,
  WarehouseDto,
} from "./types";

type WithWarehouse = { warehouse?: { name: string; code: string } | null };

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function isoRequired(d: Date | null | undefined): string {
  return d ? d.toISOString() : new Date(0).toISOString();
}

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function warehouseAddressFrom(v: unknown): WarehouseAddress | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const a = v as Partial<WarehouseAddress>;
  return {
    street: s(a.street),
    city: s(a.city),
    postal: s(a.postal),
    country: s(a.country) || "PL",
  };
}

export function warehouseToDto(w: DbWarehouse): WarehouseDto {
  return {
    id: w.id,
    userId: w.userId,
    name: w.name,
    code: w.code,
    address: warehouseAddressFrom(w.address),
    isDefault: w.isDefault,
    isActive: w.isActive,
    notes: w.notes ?? null,
    createdAt: isoRequired(w.createdAt),
    updatedAt: isoRequired(w.updatedAt),
  };
}

export function stockItemToDto(item: DbStockItem & WithWarehouse): StockItemDto {
  const quantity = roundQty(item.quantity);
  const reserved = roundQty(item.reserved);
  const minQuantity = roundQty(item.minQuantity);
  return {
    id: item.id,
    userId: item.userId,
    warehouseId: item.warehouseId,
    warehouseName: item.warehouse?.name ?? null,
    warehouseCode: item.warehouse?.code ?? null,
    productId: item.productId ?? null,
    sku: item.sku,
    name: item.name,
    unit: item.unit,
    quantity,
    reserved,
    available: roundQty(quantity - reserved),
    minQuantity,
    avgPurchasePrice: roundMoney(item.avgPurchasePrice),
    lastPurchasePrice: roundMoney(item.lastPurchasePrice),
    valueNet: roundMoney(item.valueNet),
    location: item.location ?? null,
    isLowStock: minQuantity > 0 && quantity <= minQuantity,
    lastMovementAt: iso(item.lastMovementAt),
    lowStockAlertedAt: iso(item.lowStockAlertedAt),
    createdAt: isoRequired(item.createdAt),
    updatedAt: isoRequired(item.updatedAt),
  };
}

/** Bezpieczne odczytanie pozycji dokumentu z pola JSON. */
export function stockDocumentLinesFrom(v: unknown): StockDocumentLine[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const quantity = roundQty(l.quantity);
    const unitPriceNet = roundMoney(l.unitPriceNet);
    return {
      stockItemId: typeof l.stockItemId === "string" ? l.stockItemId : undefined,
      productId: typeof l.productId === "string" ? l.productId : undefined,
      sku: s(l.sku),
      name: s(l.name),
      unit: s(l.unit) || "szt.",
      quantity,
      unitPriceNet,
      valueNet: l.valueNet === undefined ? roundMoney(quantity * unitPriceNet) : roundMoney(l.valueNet),
    };
  });
}

export function stockDocumentToDto(
  doc: DbStockDocument & WithWarehouse
): StockDocumentDto {
  return {
    id: doc.id,
    userId: doc.userId,
    warehouseId: doc.warehouseId,
    warehouseName: doc.warehouse?.name ?? null,
    number: doc.number,
    type: doc.type as StockDocumentType,
    direction: doc.direction as StockDirection,
    status: doc.status as StockDocumentStatus,
    issueDate: doc.issueDate,
    sourceType: doc.sourceType,
    sourceId: doc.sourceId ?? null,
    sourceNumber: doc.sourceNumber ?? null,
    isAutomatic: doc.isAutomatic,
    contractorId: doc.contractorId ?? null,
    contractorName: doc.contractorName ?? null,
    targetWarehouseId: doc.targetWarehouseId ?? null,
    targetWarehouseName: doc.targetWarehouseName ?? null,
    pairedDocumentId: doc.pairedDocumentId ?? null,
    lines: stockDocumentLinesFrom(doc.lines),
    totalQuantity: roundQty(doc.totalQuantity),
    totalValueNet: roundMoney(doc.totalValueNet),
    notes: doc.notes ?? null,
    issuedBy: doc.issuedBy ?? null,
    receivedBy: doc.receivedBy ?? null,
    cancelledAt: iso(doc.cancelledAt),
    cancelReason: doc.cancelReason ?? null,
    createdAt: isoRequired(doc.createdAt),
    updatedAt: isoRequired(doc.updatedAt),
  };
}

export function stockMovementToDto(m: DbStockMovement): StockMovementDto {
  return {
    id: m.id,
    userId: m.userId,
    warehouseId: m.warehouseId,
    stockItemId: m.stockItemId,
    documentId: m.documentId ?? null,
    documentNumber: m.documentNumber ?? null,
    documentType: m.documentType ?? null,
    sku: m.sku,
    name: m.name,
    quantityChange: roundQty(m.quantityChange),
    quantityBefore: roundQty(m.quantityBefore),
    quantityAfter: roundQty(m.quantityAfter),
    unitPriceNet: roundMoney(m.unitPriceNet),
    valueNet: roundMoney(m.valueNet),
    reason: m.reason ?? null,
    createdAt: isoRequired(m.createdAt),
  };
}

/** Bezpieczne odczytanie arkusza spisowego z pola JSON. */
export function stocktakingLinesFrom(v: unknown): StocktakingLine[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const expectedQuantity = roundQty(l.expectedQuantity);
    const countedQuantity = roundQty(l.countedQuantity);
    const unitPriceNet = roundMoney(l.unitPriceNet);
    const diffQuantity = roundQty(countedQuantity - expectedQuantity);
    return {
      stockItemId: s(l.stockItemId),
      sku: s(l.sku),
      name: s(l.name),
      unit: s(l.unit) || "szt.",
      expectedQuantity,
      countedQuantity,
      diffQuantity,
      unitPriceNet,
      expectedValueNet: roundMoney(expectedQuantity * unitPriceNet),
      countedValueNet: roundMoney(countedQuantity * unitPriceNet),
      diffValueNet: roundMoney(diffQuantity * unitPriceNet),
      counted: l.counted === true,
    };
  });
}

export function stocktakingToDto(st: DbStocktaking & WithWarehouse): StocktakingDto {
  return {
    id: st.id,
    userId: st.userId,
    warehouseId: st.warehouseId,
    warehouseName: st.warehouse?.name ?? null,
    number: st.number,
    status: st.status as StocktakingStatus,
    countDate: st.countDate,
    lines: stocktakingLinesFrom(st.lines),
    totalExpectedQuantity: roundQty(st.totalExpectedQuantity),
    totalCountedQuantity: roundQty(st.totalCountedQuantity),
    totalDiffQuantity: roundQty(st.totalDiffQuantity),
    totalExpectedValueNet: roundMoney(st.totalExpectedValueNet),
    totalCountedValueNet: roundMoney(st.totalCountedValueNet),
    totalDiffValueNet: roundMoney(st.totalDiffValueNet),
    shortageValueNet: roundMoney(st.shortageValueNet),
    surplusValueNet: roundMoney(st.surplusValueNet),
    adjustmentDocumentIds: Array.isArray(st.adjustmentDocumentIds) ? [...st.adjustmentDocumentIds] : [],
    adjustmentDocumentNumbers: Array.isArray(st.adjustmentDocumentNumbers)
      ? [...st.adjustmentDocumentNumbers]
      : [],
    notes: st.notes ?? null,
    closedAt: iso(st.closedAt),
    closedBy: st.closedBy ?? null,
    createdAt: isoRequired(st.createdAt),
    updatedAt: isoRequired(st.updatedAt),
  };
}

/** Konwersja dowolnej struktury do wartości bezpiecznej dla pola Json w Prisma. */
export function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export { n as numeric, s as text };
