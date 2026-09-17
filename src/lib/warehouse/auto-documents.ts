/**
 * Automatyczne dokumenty magazynowe:
 *  • WZ przy fakturze sprzedaży,
 *  • PZ przy fakturze zakupu / koszcie.
 *
 * Zasady bezpieczeństwa:
 *  • funkcje NIGDY nie rzucają wyjątku — problemy trafiają do `warnings` albo kończą się `null`,
 *    aby generowanie dokumentu magazynowego nie zablokowało wystawienia faktury,
 *  • są idempotentne — gdy dokument źródłowy ma już `stockDocumentId`, zwracany jest dokument
 *    istniejący i żadne ruchy nie są duplikowane,
 *  • jedyny zapis do kolekcji `Invoice` / `Expense` to uzupełnienie
 *    `stockDocumentId` oraz `stockDocumentNumber`.
 */

import type { Product as DbProduct } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applyStockDocument, fallbackSku } from "./stock-engine";
import { roundMoney, roundQty } from "./math";
import type { AutoStockDocumentResult, StockDocumentLine } from "./types";
import { ensureDefaultWarehouse, isObjectId, resolveWarehouse } from "./warehouses";

/* ── Pomocnicze ──────────────────────────────────────────────────────────── */

function normalizeKey(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function skuKey(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}

function numberOf(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface ProductIndex {
  bySku: Map<string, DbProduct>;
  byName: Map<string, DbProduct>;
}

/** Indeks produktów magazynowych (`isStockTracked: true`) po SKU i po dokładnej nazwie. */
async function loadStockProducts(userId: string): Promise<ProductIndex> {
  const products = await prisma.product.findMany({ where: { userId, isStockTracked: true } });
  const bySku = new Map<string, DbProduct>();
  const byName = new Map<string, DbProduct>();
  for (const product of products) {
    const sku = skuKey(product.sku);
    if (sku && !bySku.has(sku)) bySku.set(sku, product);
    const name = normalizeKey(product.name);
    if (name && !byName.has(name)) byName.set(name, product);
  }
  return { bySku, byName };
}

/** Dopasowanie pozycji dokumentu do produktu: najpierw po SKU, potem po dokładnej nazwie. */
function matchProduct(index: ProductIndex, sku: unknown, name: unknown): DbProduct | null {
  const key = skuKey(sku);
  if (key) {
    const bySku = index.bySku.get(key);
    if (bySku) return bySku;
  }
  const nameKey = normalizeKey(name);
  if (nameKey) {
    const byName = index.byName.get(nameKey);
    if (byName) return byName;
  }
  return null;
}

function documentLineFromProduct(
  product: DbProduct,
  quantity: number,
  unitPriceNet: number,
  unitOverride?: unknown
): StockDocumentLine {
  const qty = roundQty(quantity);
  const price = roundMoney(unitPriceNet);
  const unit = (typeof unitOverride === "string" && unitOverride.trim()) || product.unit || "szt.";
  return {
    productId: product.id,
    sku: (product.sku || "").trim() || fallbackSku(product.name),
    name: product.name,
    unit,
    quantity: qty,
    unitPriceNet: price,
    valueNet: roundMoney(qty * price),
  };
}

/** Zwraca magazyn wskazany w opcjach albo magazyn domyślny; `null`, gdy nie da się go ustalić. */
async function pickWarehouse(userId: string, warehouseId?: string) {
  try {
    if (warehouseId && isObjectId(warehouseId)) return await resolveWarehouse(userId, warehouseId);
    return await ensureDefaultWarehouse(userId);
  } catch {
    return null;
  }
}

async function contractorNameFor(userId: string, contractorId: unknown): Promise<string | null> {
  if (!isObjectId(contractorId)) return null;
  try {
    const contractor = await prisma.contractor.findFirst({
      where: { id: contractorId, userId },
      select: { name: true },
    });
    return contractor?.name ?? null;
  } catch {
    return null;
  }
}

/* ── WZ przy fakturze sprzedaży ──────────────────────────────────────────── */

/** WZ przy fakturze sprzedaży. Zwraca null, gdy nie ma czego wydać (brak pozycji magazynowych). */
export async function createWzForInvoice(
  userId: string,
  invoiceId: string,
  opts?: { warehouseId?: string; allowNegative?: boolean }
): Promise<{ number: string; documentId: string; warnings: string[] } | null> {
  const warnings: string[] = [];

  try {
    if (!userId || !invoiceId) return null;

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, userId } });
    if (!invoice) return null;

    // Idempotencja — dokument już istnieje, nie duplikujemy ruchów.
    if (invoice.stockDocumentId) {
      const existing = await prisma.stockDocument.findFirst({
        where: { id: invoice.stockDocumentId, userId },
        select: { id: true, number: true },
      });
      if (existing) {
        return { number: existing.number, documentId: existing.id, warnings };
      }
    }

    const rawLines = Array.isArray(invoice.lines) ? (invoice.lines as unknown[]) : [];
    if (rawLines.length === 0) return null;

    const index = await loadStockProducts(userId);
    const lines: StockDocumentLine[] = [];

    for (const raw of rawLines) {
      const line = (raw ?? {}) as Record<string, unknown>;
      const name = typeof line.name === "string" ? line.name.trim() : "";
      const quantity = roundQty(numberOf(line.quantity));
      if (!name || !(quantity > 0)) continue;

      const product = matchProduct(index, line.sku, name);
      if (!product) {
        warnings.push(`Pozycja „${name}” nie jest towarem magazynowym — pominięto na WZ.`);
        continue;
      }
      lines.push(documentLineFromProduct(product, quantity, numberOf(line.netPrice), line.unit));
    }

    if (lines.length === 0) {
      if (warnings.length > 0) {
        console.warn(`[warehouse] WZ dla faktury ${invoice.number} pominięte:`, warnings);
      }
      return null;
    }

    const warehouse = await pickWarehouse(userId, opts?.warehouseId);
    if (!warehouse) {
      console.warn(`[warehouse] Brak magazynu — WZ dla faktury ${invoice.number} nie powstało.`);
      return null;
    }

    const result = await applyStockDocument({
      userId,
      warehouseId: warehouse.id,
      type: "WZ",
      lines,
      issueDate: invoice.saleDate || invoice.issueDate,
      sourceType: "invoice",
      sourceId: invoice.id,
      sourceNumber: invoice.number,
      contractorId: invoice.contractorId || null,
      contractorName: await contractorNameFor(userId, invoice.contractorId),
      notes: `Wydanie na podstawie faktury ${invoice.number}`,
      isAutomatic: true,
      // Domyślnie dopuszczamy stan ujemny — brak towaru nie może zablokować wystawienia faktury.
      allowNegative: opts?.allowNegative ?? true,
    });

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stockDocumentId: result.document.id, stockDocumentNumber: result.document.number },
    });

    return {
      number: result.document.number,
      documentId: result.document.id,
      warnings: [...warnings, ...result.warnings],
    };
  } catch (e) {
    // Żaden błąd magazynowy nie może przerwać wystawiania faktury.
    console.error("[warehouse] createWzForInvoice", e);
    return null;
  }
}

/* ── PZ przy fakturze zakupu / koszcie ───────────────────────────────────── */

/** PZ przy fakturze zakupu / koszcie. Zwraca null, gdy nie ma czego przyjąć. */
export async function createPzForExpense(
  userId: string,
  expenseId: string,
  opts?: { warehouseId?: string; lines?: StockDocumentLine[] }
): Promise<{ number: string; documentId: string; warnings: string[] } | null> {
  const warnings: string[] = [];

  try {
    if (!userId || !expenseId) return null;

    const expense = await prisma.expense.findFirst({ where: { id: expenseId, userId } });
    if (!expense) return null;

    // Idempotencja — dokument już istnieje, nie duplikujemy ruchów.
    if (expense.stockDocumentId) {
      const existing = await prisma.stockDocument.findFirst({
        where: { id: expense.stockDocumentId, userId },
        select: { id: true, number: true },
      });
      if (existing) {
        return { number: existing.number, documentId: existing.id, warnings };
      }
    }

    const index = await loadStockProducts(userId);
    const lines: StockDocumentLine[] = [];

    if (Array.isArray(opts?.lines) && opts.lines.length > 0) {
      for (const raw of opts.lines) {
        const line = (raw ?? {}) as Partial<StockDocumentLine>;
        const name = typeof line.name === "string" ? line.name.trim() : "";
        const quantity = roundQty(numberOf(line.quantity));
        if (!name || !(quantity > 0)) continue;

        const product = matchProduct(index, line.sku, name);
        if (product) {
          lines.push(documentLineFromProduct(product, quantity, numberOf(line.unitPriceNet), line.unit));
          continue;
        }
        // Przyjęcie może utworzyć nową pozycję magazynową, nawet bez produktu w katalogu.
        const price = roundMoney(numberOf(line.unitPriceNet));
        lines.push({
          sku: (typeof line.sku === "string" && line.sku.trim()) || fallbackSku(name),
          name,
          unit: (typeof line.unit === "string" && line.unit.trim()) || "szt.",
          quantity,
          unitPriceNet: price,
          valueNet: roundMoney(quantity * price),
        });
      }
    } else {
      // Koszt nie ma pozycji — linia zbiorcza wyłącznie wtedy, gdy uda się dopasować produkt po nazwie.
      const candidate = (expense.description || "").trim() || expense.category;
      const product = matchProduct(index, null, candidate);
      if (!product) {
        console.warn(
          `[warehouse] PZ dla kosztu ${expense.number} pominięte — brak pozycji i brak produktu magazynowego o nazwie „${candidate}”.`
        );
        return null;
      }
      lines.push(documentLineFromProduct(product, 1, numberOf(expense.totalNet)));
    }

    if (lines.length === 0) return null;

    const warehouse = await pickWarehouse(userId, opts?.warehouseId);
    if (!warehouse) {
      console.warn(`[warehouse] Brak magazynu — PZ dla kosztu ${expense.number} nie powstało.`);
      return null;
    }

    const result = await applyStockDocument({
      userId,
      warehouseId: warehouse.id,
      type: "PZ",
      lines,
      issueDate: expense.receivedAt || expense.issueDate,
      sourceType: "expense",
      sourceId: expense.id,
      sourceNumber: expense.number,
      contractorName: expense.contractorName || null,
      notes: `Przyjęcie na podstawie dokumentu zakupu ${expense.number}`,
      isAutomatic: true,
    });

    await prisma.expense.update({
      where: { id: expense.id },
      data: { stockDocumentId: result.document.id, stockDocumentNumber: result.document.number },
    });

    return {
      number: result.document.number,
      documentId: result.document.id,
      warnings: [...warnings, ...result.warnings],
    };
  } catch (e) {
    // Żaden błąd magazynowy nie może przerwać rejestracji kosztu.
    console.error("[warehouse] createPzForExpense", e);
    return null;
  }
}

export type { AutoStockDocumentResult };
