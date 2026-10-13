import { effectiveDocumentStatus } from "@/lib/accountant-summary";

/** The same persisted source shape is available in invoice DTOs and Prisma records. */
export interface InvoiceCorrectionEligibilitySource {
  type?: string | null;
  status?: string | null;
  documentStatus?: string | null;
  documentKind?: string | null;
  isProforma?: boolean | null;
  issuedAt?: Date | string | null;
  ksefNumber?: unknown;
  ksef?: unknown;
}

/** Read an accepted reference from the source, including the legacy JSON field. */
export function correctionOriginalKsefNumber(source: InvoiceCorrectionEligibilitySource): string | null {
  if (typeof source.ksefNumber === "string" && source.ksefNumber.trim()) return source.ksefNumber.trim();
  if (source.ksef && typeof source.ksef === "object" && !Array.isArray(source.ksef)) {
    const number = (source.ksef as Record<string, unknown>).number;
    if (typeof number === "string" && number.trim()) return number.trim();
  }
  return null;
}

/** Accepted originals may retain stale draft fields; genuine drafts stay editable. */
export function isCorrectableInvoiceSource(source: InvoiceCorrectionEligibilitySource): boolean {
  if (source.type !== "sale" || source.isProforma || source.status === "cancelled" || source.documentStatus === "cancelled" ||
    source.documentKind === "advance" || source.documentKind === "final") return false;
  if (correctionOriginalKsefNumber(source)) return true;
  if (source.status === "draft") return false;
  const status = effectiveDocumentStatus({
    status: source.status || "", documentStatus: source.documentStatus, issuedAt: source.issuedAt,
  });
  return Boolean(status && status !== "draft" && status !== "cancelled");
}
