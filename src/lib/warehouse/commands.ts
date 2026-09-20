import { createHash } from "node:crypto";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, cleanStr } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { recordAuditLog } from "@/lib/audit";
import { applyStockDocumentInTransaction, cancelStockDocumentInTransaction, isStockDocumentType, normalizeDocumentLines } from "./stock-engine";
import { openStocktakingInTransaction, saveStocktakingCountsInTransaction, closeStocktakingInTransaction } from "./stocktaking";
import { lockWarehouses } from "./transaction";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Actor = { id: string; name?: string | null; email?: string | null };
function id(value: unknown) { if (!objectId(value)) throw new ApiError(400, "Nieprawidłowy identyfikator."); return value; }
function date(value: unknown) {
  const raw = cleanStr(value, 10, "data");
  const d = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== raw) throw new ApiError(400, "Podaj poprawną datę.");
  return raw;
}

export async function warehouseCommand(user: Actor, body: Record<string, unknown>) {
  const companyId = id(body.companyId);
  const key = cleanStr(body.requestId, 80, "identyfikator operacji");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new ApiError(400, "Brak identyfikatora operacji.");
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized) > 64000) throw new ApiError(413, "Operacja jest zbyt duża.");
  const commandId = hash(`${user.id}:${companyId}:${key}`).slice(0, 24), payloadHash = hash(serialized);
  return prisma.$transaction(async tx => {
    const access = await companyAccess(tx, user.id, companyId, "canIssueInvoices");
    const previous = await tx.workspaceCommand.findUnique({ where: { id: commandId } });
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new ApiError(409, "Ten identyfikator został użyty do innej operacji.");
      return { result: previous.result, replayed: true };
    }
    const actor = { userId: user.id, userName: user.name, userEmail: user.email };
    const action = cleanStr(body.action, 40, "operacja");
    let result: Prisma.InputJsonValue;
    if (action === "createWarehouse") {
      if (access.role !== "owner") throw new ApiError(403, "Nowy magazyn tworzy właściciel firmy.");
      const name = cleanStr(body.name, 120, "nazwa"), code = cleanStr(body.code, 20, "kod").toUpperCase();
      const currency = cleanStr(body.currency, 3, "waluta");
      if (!name || !/^[A-Z0-9_-]{1,20}$/.test(code) || !["PLN", "EUR", "USD", "GBP", "CHF", "CZK", "SEK", "NOK", "DKK"].includes(currency)) throw new ApiError(400, "Podaj nazwę, kod i walutę magazynu.");
      const warehouse = await tx.warehouse.create({ data: { userId: access.company.userId, companyId, name, code, currency, isActive: true } });
      result = { id: warehouse.id, name, code };
    } else {
      const warehouse = await tx.warehouse.findFirst({ where: { id: id(body.warehouseId), companyId } });
      if (!warehouse) throw new ApiError(404, "Nie znaleziono magazynu w tej firmie.");
      const owner = warehouse.userId;
      if (action === "document") {
        if (!isStockDocumentType(body.type)) throw new ApiError(400, "Nieprawidłowy typ dokumentu.");
        if (!warehouse.currency) throw new ApiError(409, "Magazyn historyczny nie ma ustalonej waluty wyceny. Wymagana weryfikacja danych.");
        const target = body.type === "MM" ? await tx.warehouse.findFirst({ where: { id: id(body.targetWarehouseId), companyId, userId: owner } }) : null;
        if (body.type === "MM" && (!target || target.currency !== warehouse.currency)) throw new ApiError(400, "Wybierz magazyn tej samej firmy i waluty.");
        const applied = await applyStockDocumentInTransaction({ userId: owner, actor, warehouseId: warehouse.id, type: body.type, lines: normalizeDocumentLines(body.lines), issueDate: date(body.issueDate), targetWarehouseId: target?.id, notes: cleanStr(body.notes, 500, "uwagi"), allowNegative: false, issuedBy: user.name || user.email || user.id }, tx);
        result = { id: applied.document.id, number: applied.document.number, warnings: applied.warnings };
      } else if (action === "cancelDocument") {
        const document = await tx.stockDocument.findFirst({ where: { id: id(body.documentId), warehouseId: warehouse.id } });
        if (!document) throw new ApiError(404, "Nie znaleziono dokumentu.");
        const reason = cleanStr(body.reason, 500, "powód");
        if (!reason) throw new ApiError(400, "Podaj powód anulowania.");
        if (document.sourceType === "stocktaking") throw new ApiError(409, "Korekt remanentu nie anuluje się niezależnie od remanentu.");
        const cancelled = await cancelStockDocumentInTransaction(owner, document.id, reason, tx, actor);
        if (await tx.stockItem.count({ where: { id: { in: cancelled.movements.map(m => m.stockItemId) }, quantity: { lt: 0 } } })) throw new ApiError(409, "Anulowanie spowodowałoby ujemny stan. Najpierw wyjaśnij późniejsze ruchy towaru.");
        result = { id: document.id, number: document.number, warnings: cancelled.warnings };
      } else if (action === "openStocktaking") {
        if (!warehouse.currency) throw new ApiError(409, "Wymagana weryfikacja waluty magazynu historycznego.");
        const inventory = await openStocktakingInTransaction(owner, warehouse.id, date(body.countDate), undefined, tx, actor);
        result = { id: inventory.id, number: inventory.number };
      } else if (["saveStocktaking", "closeStocktaking", "cancelStocktaking"].includes(action)) {
        const inventory = await tx.stocktaking.findFirst({ where: { id: id(body.stocktakingId), warehouseId: warehouse.id } });
        if (!inventory) throw new ApiError(404, "Nie znaleziono remanentu.");
        if (body.version !== inventory.updatedAt.toISOString()) throw new ApiError(409, "Arkusz został zmieniony. Odśwież dane.");
        if (action === "saveStocktaking") {
          if (!Array.isArray(body.counts) || body.counts.length > 200) throw new ApiError(400, "Nieprawidłowe pozycje remanentu.");
          const counts = body.counts.map(raw => {
            if (!raw || typeof raw !== "object" || typeof raw.countedQuantity !== "number") throw new ApiError(400, "Podaj policzone ilości.");
            return { sku: cleanStr(raw.sku, 80, "SKU"), countedQuantity: raw.countedQuantity };
          });
          await saveStocktakingCountsInTransaction(owner, inventory.id, counts, tx);
        } else if (action === "closeStocktaking") {
          await closeStocktakingInTransaction(owner, inventory.id, { closedBy: user.name || user.id }, tx, actor);
        } else {
          await assertAccountingPeriodsOpen(tx, [{ companyId, issueDate: inventory.countDate }]);
          await lockWarehouses(tx, owner, [warehouse.id]);
          if (!["open", "counting"].includes(inventory.status)) throw new ApiError(409, "Remanent jest już zamknięty.");
          await tx.stocktaking.update({ where: { id: inventory.id }, data: { status: "cancelled" } });
        }
        result = { id: inventory.id, number: inventory.number };
      } else throw new ApiError(400, "Nieznana operacja magazynowa.");
    }
    await recordAuditLog({ client: tx, ...actor, companyId, action: `warehouse.command.${action}`, entityType: "warehouseCommand", entityId: commandId, details: { result } });
    await tx.workspaceCommand.create({ data: { id: commandId, userId: user.id, companyId, action, payloadHash, result } });
    return { result, replayed: false };
  }, { maxWait: 5000, timeout: 30000 });
}
