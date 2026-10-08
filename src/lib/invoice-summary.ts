import { Prisma, type Invoice as DbInvoice, type PrismaClient } from "@prisma/client";
import { invoiceToDto } from "./dto";

type SummaryClient = Pick<PrismaClient, "invoice">;
const dateFields = ["createdAt", "updatedAt", "sentAt", "approvedAt", "offlineDeadline", "lastPaymentReminderSentAt", "autoKsefEmailSentAt"];
const objectIdFields = ["userId", "sellerCompanyId", "bookedBy", "costReviewId", "recurringUserId", "ksefSessionId", "stockDocumentId"];
// aggregateRaw does not apply Prisma's missing-field defaults. Reuse generated metadata
// so legacy documents behave exactly like findMany, including explicit null vs missing.
const scalarDefaults = Object.fromEntries((Prisma.dmmf.datamodel.models.find(model => model.name === "Invoice")?.fields ?? [])
  .filter(field => field.kind === "scalar" && (typeof field.default === "string" || typeof field.default === "number" || typeof field.default === "boolean" || Array.isArray(field.default) || !field.isRequired))
  .map(field => [field.name, field.isRequired && field.default !== undefined && (typeof field.default !== "object" || Array.isArray(field.default)) ? field.default : null]));

/** Accounting lines, currency, settlement/recurring and payment totals stay complete.
 * Archived XML/UPO and repeated company/payment relations are fetched for one detail only.
 * The projection happens in Mongo: large XML never crosses the DB/server connection.
 */
export async function readInvoiceSummaries(
  db: SummaryClient, scope: Prisma.InputJsonObject, order: Prisma.InputJsonObject = { createdAt: -1, _id: -1 },
) {
  const records = await db.invoice.aggregateRaw({ pipeline: [
    { $match: scope },
    { $addFields: { hasUpo: { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ["$upoXml", ""] } } } }, 0] } } },
    { $project: { upoXml: 0, ksefXml: 0, autoKsefEmailConfig: 0, autoKsefEmailLeaseToken: 0, autoKsefEmailLockedUntil: 0 } },
    { $sort: order },
  ] }) as unknown as Array<Record<string, unknown>>;
  return records.map(record => {
    const row: Record<string, unknown> = { ...record, id: (record._id as { $oid: string }).$oid };
    for (const [field, value] of Object.entries(scalarDefaults)) if (!(field in row)) row[field] = value;
    // Only known BSON scalar fields are decoded; invoice-line and metadata JSON stays untouched.
    for (const field of dateFields) {
      const value = row[field] as { $date?: string } | null | undefined;
      if (value?.$date) row[field] = new Date(value.$date);
    }
    for (const field of objectIdFields) {
      const value = row[field] as { $oid?: string } | null | undefined;
      if (value?.$oid) row[field] = value.$oid;
    }
    return { ...invoiceToDto(row as unknown as DbInvoice), hasUpo: Boolean(record.hasUpo), detailsLoaded: false };
  });
}

/** BSON scope equivalent to the existing owner/unassigned + authorised-company query. */
export function invoiceBootstrapScope(userId: string, companyIds: string[]): Prisma.InputJsonObject {
  return { $or: [
    { userId: { $oid: userId }, sellerCompanyId: null },
    ...(companyIds.length ? [{ sellerCompanyId: { $in: companyIds.map($oid => ({ $oid })) } }] : []),
  ] };
}

/** Convert the local reference, keeping the foreign _id bare so Mongo can use its index. */
export function invoiceContractorSearchLookup(): Prisma.InputJsonObject {
  return { $lookup: { from: "Contractor", let: { id: { $convert: { input: "$contractorId", to: "objectId", onError: null, onNull: null } } }, pipeline: [
    { $match: { $expr: { $eq: ["$_id", "$$id"] } } }, { $project: { name: 1, nip: 1 } },
  ], as: "searchContractor" } };
}
