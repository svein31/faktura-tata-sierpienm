/**
 * Sekcja 4 — Magazyn (WMS).
 * Typy DTO (Prisma → frontend) oraz typy wejściowe silnika stanów magazynowych.
 *
 * Konwencje:
 *  - ilości zaokrąglane do 3 miejsc po przecinku,
 *  - kwoty zaokrąglane do 2 miejsc po przecinku (half-up),
 *  - `quantityChange` / `valueNet` w ruchach są ZNAKOWANE: dodatnie = przyjęcie, ujemne = wydanie.
 */

import type { StockDirection, StockDocumentType } from "@/lib/types";

/* ── Magazyn ─────────────────────────────────────────────────────────────── */

export interface WarehouseAddress {
  street: string;
  city: string;
  postal: string;
  country: string;
}

export interface WarehouseDto {
  id: string;
  userId: string;
  name: string;
  code: string;
  address: WarehouseAddress | null;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ── Stan magazynowy ─────────────────────────────────────────────────────── */

export interface StockItemDto {
  id: string;
  userId: string;
  warehouseId: string;
  warehouseName: string | null;
  warehouseCode: string | null;
  productId: string | null;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  reserved: number;
  /** quantity − reserved (ilość dostępna do wydania) */
  available: number;
  minQuantity: number;
  avgPurchasePrice: number;
  lastPurchasePrice: number;
  valueNet: number;
  location: string | null;
  /** true, gdy quantity <= minQuantity oraz minQuantity > 0 */
  isLowStock: boolean;
  lastMovementAt: string | null;
  lowStockAlertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockSummary {
  /** Liczba pozycji magazynowych objętych filtrem */
  itemCount: number;
  /** Łączna wartość netto magazynu */
  totalValueNet: number;
  /** Łączna ilość (informacyjnie — jednostki mogą być różne) */
  totalQuantity: number;
  /** Liczba pozycji poniżej lub na poziomie stanu minimalnego */
  alertCount: number;
}

/* ── Dokumenty magazynowe ────────────────────────────────────────────────── */

/** Pozycja dokumentu magazynowego (zapisywana w polu `StockDocument.lines`). */
export interface StockDocumentLine {
  stockItemId?: string;
  productId?: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceNet: number;
  valueNet: number;
}

export type StockDocumentStatus = "draft" | "issued" | "cancelled";

export interface StockDocumentDto {
  id: string;
  userId: string;
  warehouseId: string;
  warehouseName: string | null;
  number: string;
  type: StockDocumentType;
  direction: StockDirection;
  status: StockDocumentStatus;
  issueDate: string;
  sourceType: string;
  sourceId: string | null;
  sourceNumber: string | null;
  isAutomatic: boolean;
  contractorId: string | null;
  contractorName: string | null;
  targetWarehouseId: string | null;
  targetWarehouseName: string | null;
  pairedDocumentId: string | null;
  lines: StockDocumentLine[];
  totalQuantity: number;
  totalValueNet: number;
  notes: string | null;
  issuedBy: string | null;
  receivedBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ── Ruchy magazynowe (nieusuwalny ślad audytowy) ────────────────────────── */

export interface StockMovementDto {
  id: string;
  userId: string;
  warehouseId: string;
  stockItemId: string;
  documentId: string | null;
  documentNumber: string | null;
  documentType: string | null;
  sku: string;
  name: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  unitPriceNet: number;
  valueNet: number;
  reason: string | null;
  createdAt: string;
}

/* ── Remanent (spis z natury) ────────────────────────────────────────────── */

/** Pozycja arkusza spisowego (zapisywana w polu `Stocktaking.lines`). */
export interface StocktakingLine {
  stockItemId: string;
  sku: string;
  name: string;
  unit: string;
  expectedQuantity: number;
  countedQuantity: number;
  diffQuantity: number;
  unitPriceNet: number;
  expectedValueNet: number;
  countedValueNet: number;
  diffValueNet: number;
  counted: boolean;
}

export type StocktakingStatus = "open" | "counting" | "closed" | "cancelled";

export interface StocktakingDto {
  id: string;
  userId: string;
  warehouseId: string;
  warehouseName: string | null;
  number: string;
  status: StocktakingStatus;
  countDate: string;
  lines: StocktakingLine[];
  totalExpectedQuantity: number;
  totalCountedQuantity: number;
  totalDiffQuantity: number;
  totalExpectedValueNet: number;
  totalCountedValueNet: number;
  totalDiffValueNet: number;
  /** Suma niedoborów (wartość bezwzględna) — koryguje ją dokument RW */
  shortageValueNet: number;
  /** Suma nadwyżek — koryguje ją dokument PW */
  surplusValueNet: number;
  adjustmentDocumentIds: string[];
  adjustmentDocumentNumbers: string[];
  notes: string | null;
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ── Alerty niskiego stanu ───────────────────────────────────────────────── */

export interface LowStockAlert {
  stockItemId: string;
  warehouseId: string;
  warehouseName: string | null;
  productId: string | null;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  /** Ile brakuje do stanu minimalnego (min − stan, nigdy < 0) */
  deficit: number;
  /** true, gdy powiadomienie zostało właśnie wysłane (throttling 24 h) */
  notified: boolean;
}

/* ── Wejście silnika stanów ──────────────────────────────────────────────── */

export interface ApplyStockDocumentParams {
  actor?: { userId: string; userName?: string | null; userEmail?: string | null };
  userId: string;
  warehouseId: string;
  type: StockDocumentType;
  lines: StockDocumentLine[];
  issueDate: string;
  sourceType?: string;
  sourceId?: string;
  sourceNumber?: string;
  contractorId?: string | null;
  contractorName?: string | null;
  targetWarehouseId?: string | null;
  notes?: string | null;
  isAutomatic?: boolean;
  allowNegative?: boolean;
  number?: string;
  issuedBy?: string | null;
  receivedBy?: string | null;
}

export interface ApplyStockDocumentResult {
  document: StockDocumentDto;
  movements: StockMovementDto[];
  alerts: LowStockAlert[];
  warnings: string[];
}

export interface CancelStockDocumentResult {
  document: StockDocumentDto;
  movements: StockMovementDto[];
  warnings: string[];
}

/** Wynik automatycznego wygenerowania dokumentu (WZ przy FV, PZ przy koszcie). */
export interface AutoStockDocumentResult {
  number: string;
  documentId: string;
  warnings: string[];
}
