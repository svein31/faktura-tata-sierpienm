import type { PrismaClient } from "@prisma/client";
import { ApiError, assertObjectId } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { correctionOriginalKsefNumber, isCorrectableInvoiceSource } from "@/lib/invoice-correction-eligibility";
import { effectiveCorrectionLines, isActiveCorrection } from "@/lib/invoice-correction-chain";
import { round2 } from "@/lib/tax/money";

type CorrectionDb = Pick<PrismaClient, "invoice">;

const SOURCE_SELECT = {
  id: true, userId: true, sellerCompanyId: true, type: true, status: true,
  documentStatus: true, documentKind: true, isProforma: true, currency: true,
  number: true, issueDate: true, issuedAt: true, ksefNumber: true, ksef: true, lines: true, recipient: true,
  isCorrection: true, originalInvoiceId: true,
} as const;

/**
 * A correction is always issued to the main invoice ("korygujesz zawsze od
 * głównej faktury"). Selecting „Koryguj” on an existing correction follows its
 * link back to the root invoice, so chains never point at a delta document.
 */
async function findRootSource(db: CorrectionDb, sourceId: string) {
  let source = await db.invoice.findUnique({ where: { id: sourceId }, select: SOURCE_SELECT });
  for (let depth = 0; source?.isCorrection && source.originalInvoiceId && depth < 10; depth++) {
    if (!/^[0-9a-fA-F]{24}$/.test(source.originalInvoiceId)) break;
    const parent = await db.invoice.findUnique({ where: { id: source.originalInvoiceId }, select: SOURCE_SELECT });
    if (!parent || parent.sellerCompanyId !== source.sellerCompanyId) break;
    source = parent;
  }
  return source;
}

/** Earlier corrections of the same root invoice, oldest first, without the edited document. */
export async function priorCorrectionsOf(db: CorrectionDb, root: { id: string; sellerCompanyId: string | null }, currentId?: string) {
  if (typeof db.invoice.findMany !== "function") return [];
  const rows = await db.invoice.findMany({
    where: { originalInvoiceId: root.id, isCorrection: true, ...(currentId ? { id: { not: currentId } } : {}) },
    select: {
      id: true, number: true, issueDate: true, createdAt: true, status: true, documentStatus: true,
      sellerCompanyId: true, isCorrection: true, originalInvoiceId: true, lines: true,
      totalNet: true, totalVat: true, totalGross: true, ksefStatus: true, ksefNumber: true, ksef: true,
    },
    orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
  });
  return (rows ?? []).filter(row =>
    row.id !== root.id &&
    row.id !== currentId &&
    row.originalInvoiceId === root.id &&
    row.isCorrection === true &&
    row.sellerCompanyId === root.sellerCompanyId &&
    isActiveCorrection(row)
  );
}

/** Summary used by the correction editor: original, earlier corrections and the current state. */
export async function invoiceCorrectionContext(db: CorrectionDb, root: { id: string; sellerCompanyId: string | null; lines: unknown; totalGross?: number | null }, currentId?: string) {
  const prior = await priorCorrectionsOf(db, root, currentId);
  const effectiveLines = effectiveCorrectionLines(root.lines, prior);
  const originalGross = round2(root.totalGross ?? 0);
  const effectiveGross = round2(prior.reduce((sum, row) => sum + (row.totalGross ?? 0), originalGross));
  return {
    effectiveLines,
    originalGross,
    effectiveGross,
    priorCorrections: prior.map(row => {
      const ksefNumber = correctionOriginalKsefNumber(row);
      return {
        id: row.id, number: row.number, issueDate: row.issueDate,
        totalNet: row.totalNet ?? 0, totalVat: row.totalVat ?? 0, totalGross: row.totalGross ?? 0,
        ksefNumber, ksefAccepted: Boolean(ksefNumber), status: row.status,
      };
    }),
  };
}

/** Resolve a linked correction from an authorised source, never client-supplied snapshots. */
export async function resolveInvoiceCorrectionSource(
  db: CorrectionDb,
  userId: string,
  body: Record<string, unknown>,
  currentId?: string,
): Promise<Record<string, unknown>> {
  if (body.isCorrection !== true) return body;
  const originalId = typeof body.originalInvoiceId === "string" ? body.originalInvoiceId.trim() : "";
  // External paper invoices can be corrected with explicit number/date metadata;
  // parseInvoiceBody validates that case, without inventing a database relation.
  if (!originalId) return body;
  assertObjectId(originalId);
  if (originalId === currentId) throw new ApiError(400, "Korekta nie może wskazywać samej siebie.");
  const original = await findRootSource(db, originalId);
  const notFound = () => new ApiError(404, "Nie znaleziono dostępnej faktury do skorygowania.");
  if (!original) throw notFound();
  if (original.id === currentId) throw new ApiError(400, "Korekta nie może wskazywać samej siebie.");
  if (original.sellerCompanyId) {
    const access = await requireCompanyAccess(userId, original.sellerCompanyId, "canCreateCorrections");
    if (!access.ok) throw notFound();
  } else if (original.userId !== userId) throw notFound();
  const sellerId = typeof body.sellerCompanyId === "string" ? body.sellerCompanyId.trim().toLowerCase() || null : null;
  if (sellerId !== original.sellerCompanyId) throw new ApiError(400, "Korekta musi należeć do firmy wystawiającej fakturę pierwotną.");
  if (original.documentKind === "advance" || original.documentKind === "final")
    throw new ApiError(400, "Korekta rozliczenia zaliczki wymaga przeliczenia całego rozliczenia; ten formularz obsługuje korekty zwykłych faktur.");
  if (!isCorrectableInvoiceSource(original))
    throw new ApiError(409, "Skorygować można wystawioną fakturę sprzedaży. Szkic edytuj, a proformę rozlicz właściwym dokumentem.");
  if (String(body.type || "").trim() !== "sale" || body.isProforma === true || body.isRecurring === true)
    throw new ApiError(400, "Korekta jest odrębną fakturą sprzedaży, bez proformy i harmonogramu cyklicznego.");
  if (String(body.currency || "PLN").trim().toUpperCase() !== original.currency)
    throw new ApiError(400, "Korekta musi używać waluty faktury pierwotnej.");
  if (typeof body.issueDate === "string" && body.issueDate.trim() < original.issueDate)
    throw new ApiError(400, "Data korekty nie może poprzedzać daty faktury pierwotnej.");
  // "Stan przed korektą" of a subsequent correction is the state after all
  // earlier saved corrections, not the raw lines of the original invoice.
  const prior = await priorCorrectionsOf(db, original, currentId);
  const originalLines = prior.length ? effectiveCorrectionLines(original.lines, prior) : original.lines;
  return {
    ...body, originalInvoiceId: original.id, originalInvoiceNumber: original.number,
    originalIssueDate: original.issueDate, originalKsefNumber: correctionOriginalKsefNumber(original),
    originalLines,
    ...(body.recipient === undefined && (original as { recipient?: unknown }).recipient !== undefined
      ? { recipient: (original as { recipient?: unknown }).recipient }
      : {}),
  };
}
