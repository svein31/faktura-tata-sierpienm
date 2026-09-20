/**
 * Remanent / inwentaryzacja (spis z natury).
 *
 * Cykl życia:
 *  1. `openStocktaking`  — snapshot stanów księgowych magazynu (status `open`),
 *  2. `saveStocktakingCounts` — zapis policzonych ilości, przeliczenie różnic (status `counting`),
 *  3. `closeStocktaking` — dokumenty korygujące RW (niedobory) i PW (nadwyżki),
 *     doprowadzenie stanów do stanu policzonego (status `closed`).
 */

import { prisma as defaultPrisma } from "@/lib/db";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import type { Prisma } from "@prisma/client";
import { lockWarehouses } from "./transaction";
import { ApiError } from "@/lib/api";
import { recordAuditLog } from "@/lib/audit";
import { stocktakingLinesFrom, stocktakingToDto, toJsonValue } from "./dto";
import { roundMoney, roundQty, sumMoney, sumQty } from "./math";
import { nextStocktakingNumber } from "./numbering";
import { applyStockDocumentInTransaction } from "./stock-engine";
import type { ApplyStockDocumentParams, StockDocumentLine, StocktakingDto, StocktakingLine } from "./types";
import { resolveWarehouse } from "./warehouses";

const OPEN_STATUSES = ["open", "counting"];

function normalizeDate(date: unknown): string {
  const raw = typeof date === "string" ? date.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/** Przelicza wartości jednej pozycji arkusza spisowego. */
function recalcLine(line: StocktakingLine): StocktakingLine {
  const expectedQuantity = roundQty(line.expectedQuantity);
  const countedQuantity = roundQty(line.countedQuantity);
  const diffQuantity = roundQty(countedQuantity - expectedQuantity);
  const unitPriceNet = roundMoney(line.unitPriceNet);
  return {
    ...line,
    expectedQuantity,
    countedQuantity,
    diffQuantity,
    unitPriceNet,
    expectedValueNet: roundMoney(expectedQuantity * unitPriceNet),
    countedValueNet: roundMoney(countedQuantity * unitPriceNet),
    diffValueNet: roundMoney(diffQuantity * unitPriceNet),
  };
}

interface StocktakingTotals {
  totalExpectedQuantity: number;
  totalCountedQuantity: number;
  totalDiffQuantity: number;
  totalExpectedValueNet: number;
  totalCountedValueNet: number;
  totalDiffValueNet: number;
  shortageValueNet: number;
  surplusValueNet: number;
}

/** Sumy zbiorcze arkusza: ilości, wartości oraz niedobory / nadwyżki. */
function totalsOf(lines: StocktakingLine[]): StocktakingTotals {
  const shortages = lines.filter((l) => l.diffValueNet < 0).map((l) => Math.abs(l.diffValueNet));
  const surpluses = lines.filter((l) => l.diffValueNet > 0).map((l) => l.diffValueNet);
  return {
    totalExpectedQuantity: sumQty(lines.map((l) => l.expectedQuantity)),
    totalCountedQuantity: sumQty(lines.map((l) => l.countedQuantity)),
    totalDiffQuantity: sumQty(lines.map((l) => l.diffQuantity)),
    totalExpectedValueNet: sumMoney(lines.map((l) => l.expectedValueNet)),
    totalCountedValueNet: sumMoney(lines.map((l) => l.countedValueNet)),
    totalDiffValueNet: sumMoney(lines.map((l) => l.diffValueNet)),
    shortageValueNet: sumMoney(shortages),
    surplusValueNet: sumMoney(surpluses),
  };
}

async function loadStocktaking(userId: string, id: string, prisma: Prisma.TransactionClient) {
  const record = await prisma.stocktaking.findFirst({ where: { id, userId } });
  if (!record) throw new ApiError(404, "Nie znaleziono remanentu.", "STOCKTAKING_NOT_FOUND");
  return record;
}

/**
 * Otwiera remanent: wykonuje snapshot wszystkich pozycji magazynu jako arkusz spisowy.
 * `expectedQuantity` = stan bieżący, `unitPriceNet` = średnia ważona cena zakupu, `counted: false`.
 */
export async function openStocktaking(
  userId: string,
  warehouseId: string,
  countDate: string,
  opts?: { notes?: string | null }
): Promise<StocktakingDto> {
  return defaultPrisma.$transaction(tx => openStocktakingInTransaction(userId, warehouseId, countDate, opts, tx), { maxWait: 5000, timeout: 30000 });
}

export async function openStocktakingInTransaction(
  userId: string,
  warehouseId: string,
  countDate: string,
  opts: { notes?: string | null } | undefined,
  prisma: Prisma.TransactionClient,
  actor?: ApplyStockDocumentParams["actor"]
): Promise<StocktakingDto> {
  if (!userId) throw new ApiError(401, "Brak kontekstu użytkownika.", "UNAUTHENTICATED");

  const warehouse = await resolveWarehouse(userId, warehouseId, prisma);
  const date = normalizeDate(countDate);
  await assertAccountingPeriodsOpen(prisma, [{ companyId: warehouse.companyId, issueDate: date }]);
  await lockWarehouses(prisma, userId, [warehouse.id]);

  const pending = await prisma.stocktaking.findFirst({
    where: { userId, warehouseId: warehouse.id, status: { in: OPEN_STATUSES } },
    select: { number: true },
  });
  if (pending) {
    throw new ApiError(
      409,
      `W magazynie ${warehouse.name} trwa już remanent ${pending.number} — zamknij go przed otwarciem nowego.`,
      "STOCKTAKING_ALREADY_OPEN"
    );
  }

  const items = await prisma.stockItem.findMany({
    where: { userId, warehouseId: warehouse.id },
    orderBy: { name: "asc" },
  });

  // Pozycje niepoliczone startują z ilością równą stanowi księgowemu (różnica 0).
  const lines: StocktakingLine[] = items.map((item) =>
    recalcLine({
      stockItemId: item.id,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      expectedQuantity: roundQty(item.quantity),
      countedQuantity: roundQty(item.quantity),
      diffQuantity: 0,
      unitPriceNet: roundMoney(item.avgPurchasePrice),
      expectedValueNet: 0,
      countedValueNet: 0,
      diffValueNet: 0,
      counted: false,
    })
  );

  const number = await nextStocktakingNumber(userId, date, prisma);
  const totals = totalsOf(lines);

  const created = await prisma.stocktaking.create({
    data: {
      userId,
      warehouseId: warehouse.id,
      number,
      status: "open",
      countDate: date,
      lines: toJsonValue(lines),
      ...totals,
      notes: opts?.notes ?? null,
    },
  });

  await recordAuditLog({
    client: prisma,
    userId, ...actor, companyId: warehouse.companyId,
    action: "stock.stocktaking.opened",
    entityType: "stocktaking",
    entityId: created.id,
    description: `Otwarto remanent ${number} w magazynie ${warehouse.name} (${lines.length} poz.)`,
    details: { number, warehouse: warehouse.name, lineCount: lines.length },
  });

  return stocktakingToDto({ ...created, warehouse });
}

/**
 * Zapisuje policzone ilości (zapis częściowy jest dozwolony), przelicza różnice
 * i sumy zbiorcze, w tym `shortageValueNet` (niedobory) i `surplusValueNet` (nadwyżki).
 * Status przechodzi na `counting`.
 */
export async function saveStocktakingCounts(
  userId: string,
  id: string,
  counts: Array<{ sku: string; countedQuantity: number }>
): Promise<StocktakingDto> {
  return defaultPrisma.$transaction(tx => saveStocktakingCountsInTransaction(userId, id, counts, tx), { maxWait: 5000, timeout: 30000 });
}

export async function saveStocktakingCountsInTransaction(
  userId: string,
  id: string,
  counts: Array<{ sku: string; countedQuantity: number }>,
  prisma: Prisma.TransactionClient
): Promise<StocktakingDto> {
  if (!userId) throw new ApiError(401, "Brak kontekstu użytkownika.", "UNAUTHENTICATED");

  const record = await loadStocktaking(userId, id, prisma);
  const warehouse = await resolveWarehouse(userId, record.warehouseId, prisma);
  await assertAccountingPeriodsOpen(prisma, [{ companyId: warehouse.companyId, issueDate: record.countDate }]);
  await lockWarehouses(prisma, userId, [record.warehouseId]);
  if (!OPEN_STATUSES.includes(record.status)) {
    throw new ApiError(
      400,
      `Remanent ${record.number} jest zamknięty — nie można zmieniać arkusza spisowego.`,
      "STOCKTAKING_CLOSED"
    );
  }

  const lines = stocktakingLinesFrom(record.lines);
  const bySku = new Map(lines.map((line) => [line.sku, line] as const));

  for (const entry of Array.isArray(counts) ? counts : []) {
    const sku = typeof entry?.sku === "string" ? entry.sku.trim() : "";
    const line = sku ? bySku.get(sku) : undefined;
    if (!line) {
      throw new ApiError(
        400,
        `Pozycja o SKU „${sku}” nie występuje w arkuszu spisowym remanentu ${record.number}.`,
        "STOCKTAKING_LINE_NOT_FOUND"
      );
    }
    if (typeof entry.countedQuantity !== "number" || !Number.isFinite(entry.countedQuantity) || entry.countedQuantity > 1e9) throw new ApiError(400, "Nieprawidłowa policzona ilość.");
    const countedQuantity = roundQty(entry.countedQuantity);
    if (countedQuantity < 0) {
      throw new ApiError(
        400,
        `Pozycja „${line.name}” (${sku}): policzona ilość nie może być ujemna.`,
        "STOCKTAKING_QUANTITY_INVALID"
      );
    }
    bySku.set(sku, recalcLine({ ...line, countedQuantity, counted: true }));
  }

  const nextLines = lines.map((line) => bySku.get(line.sku) ?? line);
  const totals = totalsOf(nextLines);

  const updated = await prisma.stocktaking.update({
    where: { id: record.id },
    data: { status: "counting", lines: toJsonValue(nextLines), ...totals },
  });

  return stocktakingToDto({ ...updated, warehouse });
}

/**
 * Zamyka remanent: generuje po jednym zbiorczym dokumencie korygującym
 * (RW dla niedoborów, PW dla nadwyżek — tylko gdy występują różnice),
 * doprowadza stany magazynowe do stanu policzonego i zapisuje numery dokumentów.
 *
 * Domyślnie zamknięcie z niepoliczonymi pozycjami jest zablokowane.
 * Flaga `allowUncounted` pozwala je zamknąć — niepoliczone pozycje traktowane są
 * wtedy jako zgodne ze stanem księgowym (różnica 0).
 */
export async function closeStocktaking(
  userId: string,
  id: string,
  opts?: { allowUncounted?: boolean; closedBy?: string | null }
): Promise<{ stocktaking: StocktakingDto; documents: string[] }> {
  return defaultPrisma.$transaction(tx => closeStocktakingInTransaction(userId, id, opts, tx), { maxWait: 5000, timeout: 30000 });
}

export async function closeStocktakingInTransaction(
  userId: string,
  id: string,
  opts: { allowUncounted?: boolean; closedBy?: string | null } | undefined,
  prisma: Prisma.TransactionClient,
  actor?: ApplyStockDocumentParams["actor"]
): Promise<{ stocktaking: StocktakingDto; documents: string[] }> {
  if (!userId) throw new ApiError(401, "Brak kontekstu użytkownika.", "UNAUTHENTICATED");

  const record = await loadStocktaking(userId, id, prisma);
  const warehouse = await resolveWarehouse(userId, record.warehouseId, prisma);
  await assertAccountingPeriodsOpen(prisma, [{ companyId: warehouse.companyId, issueDate: record.countDate }]);
  await lockWarehouses(prisma, userId, [record.warehouseId]);
  if (!OPEN_STATUSES.includes(record.status)) {
    throw new ApiError(400, `Remanent ${record.number} jest już zamknięty.`, "STOCKTAKING_CLOSED");
  }

  const rawLines = stocktakingLinesFrom(record.lines);
  const uncounted = rawLines.filter((line) => !line.counted);

  if (uncounted.length > 0 && opts?.allowUncounted !== true) {
    throw new ApiError(
      400,
      `Remanent ${record.number} zawiera ${uncounted.length} niepoliczonych pozycji. Policz je lub zamknij remanent z opcją „traktuj niepoliczone jako zgodne”.`,
      "STOCKTAKING_UNCOUNTED"
    );
  }

  // Niepoliczone pozycje = zgodne ze stanem księgowym (różnica 0).
  const lines = rawLines.map((line) =>
    line.counted ? recalcLine(line) : recalcLine({ ...line, countedQuantity: line.expectedQuantity })
  );

  const shortageLines: StockDocumentLine[] = lines
    .filter((line) => line.diffQuantity < 0)
    .map((line) => ({
      stockItemId: line.stockItemId,
      sku: line.sku,
      name: line.name,
      unit: line.unit,
      quantity: roundQty(Math.abs(line.diffQuantity)),
      unitPriceNet: line.unitPriceNet,
      valueNet: roundMoney(Math.abs(line.diffQuantity) * line.unitPriceNet),
    }));

  const surplusLines: StockDocumentLine[] = lines
    .filter((line) => line.diffQuantity > 0)
    .map((line) => ({
      stockItemId: line.stockItemId,
      sku: line.sku,
      name: line.name,
      unit: line.unit,
      quantity: roundQty(line.diffQuantity),
      unitPriceNet: line.unitPriceNet,
      valueNet: roundMoney(line.diffQuantity * line.unitPriceNet),
    }));

  const documentIds: string[] = [];
  const documentNumbers: string[] = [];

  if (shortageLines.length > 0) {
    const rw = await applyStockDocumentInTransaction({
      userId, actor,
      warehouseId: warehouse.id,
      type: "RW",
      lines: shortageLines,
      issueDate: record.countDate,
      sourceType: "stocktaking",
      sourceId: record.id,
      sourceNumber: record.number,
      notes: `Niedobory remanentu ${record.number}`,
      isAutomatic: true,
      // Stan policzony jest stanem faktycznym — korekta nie może zostać zablokowana.
      allowNegative: true,
    }, prisma);
    documentIds.push(rw.document.id);
    documentNumbers.push(rw.document.number);
  }

  if (surplusLines.length > 0) {
    const pw = await applyStockDocumentInTransaction({
      userId, actor,
      warehouseId: warehouse.id,
      type: "PW",
      lines: surplusLines,
      issueDate: record.countDate,
      sourceType: "stocktaking",
      sourceId: record.id,
      sourceNumber: record.number,
      notes: `Nadwyżki remanentu ${record.number}`,
      isAutomatic: true,
      allowNegative: true,
    }, prisma);
    documentIds.push(pw.document.id);
    documentNumbers.push(pw.document.number);
  }

  const totals = totalsOf(lines);
  const updated = await prisma.stocktaking.update({
    where: { id: record.id },
    data: {
      status: "closed",
      lines: toJsonValue(lines),
      ...totals,
      adjustmentDocumentIds: documentIds,
      adjustmentDocumentNumbers: documentNumbers,
      closedAt: new Date(),
      closedBy: opts?.closedBy ?? null,
    },
  });

  await recordAuditLog({
    client: prisma,
    userId, ...actor, companyId: warehouse.companyId,
    action: "stock.stocktaking.closed",
    entityType: "stocktaking",
    entityId: record.id,
    description: `Zamknięto remanent ${record.number}: niedobory ${totals.shortageValueNet.toFixed(2)} PLN, nadwyżki ${totals.surplusValueNet.toFixed(2)} PLN`,
    details: {
      number: record.number,
      documents: documentNumbers,
      shortageValueNet: totals.shortageValueNet,
      surplusValueNet: totals.surplusValueNet,
      uncounted: uncounted.length,
    },
  });

  return {
    stocktaking: stocktakingToDto({ ...updated, warehouse }),
    documents: documentNumbers,
  };
}
