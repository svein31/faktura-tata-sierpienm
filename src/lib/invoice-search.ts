import { ApiError } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { todayISO } from "@/lib/utils";
import type { Prisma, PrismaClient } from "@prisma/client";
import { invoiceContractorSearchLookup, invoiceSummariesToDto, invoiceSummaryProjection } from "@/lib/invoice-summary";
export const INVOICE_PAGE_SIZE = 30;
const choices = {
  type: ["all", "sale", "purchase", "proforma"],
  approval: ["all", "pending", "approved"],
  currency: ["all", "PLN", "EUR", "USD"],
  status: ["all", "paid", "draft", "issued", "overdue", "ksef_queued", "ksef_sent", "ksef_active", "ksef_rejected"],
};
export function invoiceSearchParams(params: URLSearchParams) {
  const selected = {} as Record<keyof typeof choices, string>;
  for (const [key, values] of Object.entries(choices)) {
    const value = params.get(key) || "all";
    if (!values.includes(value)) throw new ApiError(400, "Nieprawidłowy filtr faktur.");
    selected[key as keyof typeof choices] = value;
  }
  const search = (params.get("search") || "").trim();
  if (search.length > 150) throw new ApiError(400, "Zapytanie jest za długie.");
  const sort = params.get("sort") || "date_desc";
  if (!["date_desc", "date_asc"].includes(sort)) throw new ApiError(400, "Nieprawidłowa kolejność faktur.");
  const cursor = params.get("cursor");
  if (cursor && !objectId(cursor)) throw new ApiError(400, "Nieprawidłowa strona.");
  return { ...selected, search, cursor, sort };
}
export function effectiveStatusExpression(today = todayISO()) {
  const overdue = { $and: [{ $gt: ["$dueDate", ""] }, { $lt: ["$dueDate", today] }] };
  const hasKsef = { $or: [{ $gt: [{ $ifNull: ["$ksef.number", ""] }, ""] }, { $gt: [{ $ifNull: ["$ksef.referenceNumber", ""] }, ""] }] };
  const ksefIs = (status: string) => ({ $and: [hasKsef, { $eq: [{ $ifNull: ["$ksef.status", "SENT"] }, status] }] });
  return { $switch: { branches: [
    { case: { $eq: ["$status", "paid"] }, then: "paid" },
    { case: { $eq: ["$status", "draft"] }, then: "draft" },
    { case: ksefIs("QUEUED"), then: "ksef_queued" },
    { case: ksefIs("REJECTED"), then: "ksef_rejected" },
    { case: overdue, then: "overdue" },
    { case: ksefIs("ACTIVE"), then: "ksef_active" },
    { case: ksefIs("SENT"), then: "ksef_sent" },
  ], default: "issued" } };
}
/** KSeF filters are independent of payment status (a paid invoice can be accepted). */
export function ksefStatusExpression() {
  const eq = (field: string, value: string) => ({ $eq: [{ $ifNull: [field, ""] }, value] });
  const any = (...conditions: Prisma.InputJsonObject[]) => ({ $or: conditions });
  const number = any({ $gt: [{ $ifNull: ["$ksefNumber", ""] }, ""] }, { $gt: [{ $ifNull: ["$ksef.number", ""] }, ""] });
  const rejected = any(eq("$ksefStatus", "rejected"), eq("$ksef.status", "REJECTED"), eq("$status", "ksef_rejected"));
  const verifying = any(eq("$ksefStatus", "verify_needed"), eq("$ksefStatus", "accepted"), eq("$ksef.status", "ACTIVE"));
  const legacyQueue = eq("$ksef.status", "QUEUED");
  const sent = any({ $gt: [{ $ifNull: ["$referenceNumber", ""] }, ""] }, { $in: ["$ksefStatus", ["sending", "processing"]] }, eq("$ksef.status", "SENT"), { $and: [eq("$status", "ksef_sent"), { $ne: ["$ksefStatus", "queued"] }] });
  return { $switch: { branches: [
    { case: number, then: "ksef_active" }, { case: rejected, then: "ksef_rejected" },
    { case: verifying, then: "ksef_sent" }, { case: legacyQueue, then: "ksef_queued" },
    { case: sent, then: "ksef_sent" }, { case: eq("$ksefStatus", "queued"), then: "ksef_queued" },
  ], default: "none" } };
}
export function literalRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Counts and the page share one database command. The facet retains only IDs;
 * an indexed join reads selected summaries after the facet, so large legacy
 * rows are never combined into one BSON document with a 16 MiB output limit.
 */
export function invoiceSearchPipeline(
  scope: Prisma.InputJsonObject,
  filters: ReturnType<typeof invoiceSearchParams>,
  after: Prisma.InputJsonObject[] = [],
): Prisma.InputJsonObject[] {
  const match: { [key: string]: Prisma.InputJsonValue | null } = {};
  if (filters.type === "proforma") match.isProforma = true;
  else if (filters.type !== "all") {
    match.type = filters.type;
    if (filters.type === "sale") match.isProforma = { $ne: true };
  }
  if (filters.currency !== "all") match.currency = filters.currency;
  if (filters.approval !== "all") match.$or = [{ type: { $ne: "purchase" } }, { approvalStatus: filters.approval === "approved" ? "approved" : { $ne: "approved" } }];
  if (filters.status !== "all") match.$expr = { $eq: [filters.status.startsWith("ksef_") ? ksefStatusExpression() : effectiveStatusExpression(), filters.status] };
  const selection: Prisma.InputJsonObject[] = [{ $match: match }];
  if (filters.search) {
    selection.push(invoiceContractorSearchLookup());
    const regex = { $regex: literalRegex(filters.search), $options: "i" };
    selection.push({ $match: { $or: ["number", "notes", "contractorId", "ksef.number", "ksefNumber", "searchContractor.name", "searchContractor.nip", "recipient.name", "recipient.nip", "recipient.taxId"].map(field => ({ [field]: regex })) } });
  }
  return [
    { $match: scope },
    // These fields are never used by counts, filters or DTOs. Removing them
    // here keeps archived XML and private delivery configuration out of facets.
    { $project: { ksefXml: 0, autoKsefEmailConfig: 0, autoKsefEmailLeaseToken: 0, autoKsefEmailLockedUntil: 0 } },
    { $facet: {
      counts: [{ $group: { _id: null, all: { $sum: 1 }, sale: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "sale"] }, { $ne: ["$isProforma", true] }] }, 1, 0] } }, purchase: { $sum: { $cond: [{ $eq: ["$type", "purchase"] }, 1, 0] } }, proforma: { $sum: { $cond: [{ $eq: ["$isProforma", true] }, 1, 0] } }, approved: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "purchase"] }, { $eq: ["$approvalStatus", "approved"] }] }, 1, 0] } } } }],
      total: [...selection, { $count: "value" }],
      rows: [...selection, ...after, { $sort: { issueDate: filters.sort === "date_asc" ? 1 : -1, _id: filters.sort === "date_asc" ? 1 : -1 } }, { $limit: INVOICE_PAGE_SIZE + 1 }, { $project: { _id: 1 } }],
    } },
    { $unwind: { path: "$rows", preserveNullAndEmptyArrays: true } },
    { $lookup: {
      from: "Invoice", localField: "rows._id", foreignField: "_id",
      pipeline: [{ $match: scope }, ...invoiceSummaryProjection()], as: "invoices",
    } },
    { $project: { _id: 0, counts: 1, total: 1, invoices: 1, cursorId: { $toString: "$rows._id" } } },
  ];
}

export async function readInvoiceSearchPage(
  db: Pick<PrismaClient, "invoice">,
  scope: Prisma.InputJsonObject,
  filters: ReturnType<typeof invoiceSearchParams>,
  after: Prisma.InputJsonObject[] = [],
) {
  type Row = { counts: { all: number; sale: number; purchase: number; proforma: number; approved: number }[]; total: { value: number }[]; invoices: Array<Record<string, unknown>>; cursorId: string | null };
  const result = await db.invoice.aggregateRaw({ pipeline: invoiceSearchPipeline(scope, filters, after) }) as unknown as Row[];
  const data = result[0], invoices = invoiceSummariesToDto(result.slice(0, INVOICE_PAGE_SIZE).flatMap(row => row.invoices));
  return {
    invoices,
    total: data.total[0]?.value || 0,
    counts: data.counts[0] || { all: 0, sale: 0, purchase: 0, proforma: 0, approved: 0 },
    nextCursor: result.length > INVOICE_PAGE_SIZE ? result[INVOICE_PAGE_SIZE - 1].cursorId : null,
  };
}
