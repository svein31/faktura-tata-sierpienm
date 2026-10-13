import type { PrismaClient } from "@prisma/client";
import { ApiError, assertObjectId } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { correctionOriginalKsefNumber, isCorrectableInvoiceSource } from "@/lib/invoice-correction-eligibility";

/** Resolve a linked correction from an authorised source, never client-supplied snapshots. */
export async function resolveInvoiceCorrectionSource(
  db: Pick<PrismaClient, "invoice">,
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
  const original = await db.invoice.findUnique({
    where: { id: originalId },
    select: {
      id: true, userId: true, sellerCompanyId: true, type: true, status: true,
      documentStatus: true, documentKind: true, isProforma: true, currency: true,
      number: true, issueDate: true, issuedAt: true, ksefNumber: true, ksef: true, lines: true,
    },
  });
  const notFound = () => new ApiError(404, "Nie znaleziono dostępnej faktury do skorygowania.");
  if (!original) throw notFound();
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
  return {
    ...body, originalInvoiceId: original.id, originalInvoiceNumber: original.number,
    originalIssueDate: original.issueDate, originalKsefNumber: correctionOriginalKsefNumber(original),
    originalLines: original.lines,
  };
}
