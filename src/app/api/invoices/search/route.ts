import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { invoiceToDto } from "@/lib/dto";
import { effectiveStatusExpression, invoiceSearchParams, INVOICE_PAGE_SIZE, literalRegex } from "@/lib/invoice-search";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams, companyId = params.get("companyId");
    const unassigned = companyId === "unassigned";
    if (!unassigned) {
      if (!objectId(companyId)) throw new ApiError(400, "Wybierz firmę.");
      const access = await requireCompanyAccess(user.id, companyId);
      if (!access.ok) throw new ApiError(access.status, access.error);
    }
    const filters = invoiceSearchParams(params);
    const scope = unassigned ? { userId: { $oid: user.id }, sellerCompanyId: null } : { sellerCompanyId: { $oid: companyId! } };
    const match: Record<string, unknown> = {};
    if (filters.type === "proforma") match.isProforma = true;
    else if (filters.type !== "all") { match.type = filters.type; if (filters.type === "sale") match.isProforma = { $ne: true }; }
    if (filters.currency !== "all") match.currency = filters.currency;
    if (filters.approval !== "all") match.$or = [{ type: { $ne: "purchase" } }, { approvalStatus: filters.approval === "approved" ? "approved" : { $ne: "approved" } }];
    if (filters.status !== "all") match.$expr = { $eq: [effectiveStatusExpression(), filters.status] };
    const stages: Record<string, unknown>[] = [{ $match: scope }];
    const selection: Record<string, unknown>[] = [{ $match: match }];
    if (filters.search) {
      // Join inside the scoped query: no unbounded list of contractor ids in the browser or request.
      selection.push({ $lookup: { from: "Contractor", let: { id: "$contractorId" }, pipeline: [
        { $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$id"] } } }, { $project: { name: 1 } },
      ], as: "searchContractor" } });
      const regex = { $regex: literalRegex(filters.search), $options: "i" };
      selection.push({ $match: { $or: ["number", "notes", "contractorId", "ksef.number", "ksefNumber", "searchContractor.name"].map(field => ({ [field]: regex })) } });
    }
    let after: Record<string, unknown>[] = [];
    if (filters.cursor) {
      const anchor = await prisma.invoice.findFirst({ where: { id: filters.cursor, ...(unassigned ? { userId: user.id, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }] } : { sellerCompanyId: companyId! }) }, select: { id: true, issueDate: true } });
      if (!anchor) throw new ApiError(409, "Lista zmieniła się. Wróć do pierwszej strony.");
      after = [{ $match: { $or: [{ issueDate: { $lt: anchor.issueDate } }, { issueDate: anchor.issueDate, _id: { $lt: { $oid: anchor.id } } }] } }];
    }
    stages.push({ $facet: {
      counts: [{ $group: { _id: null, all: { $sum: 1 }, sale: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "sale"] }, { $ne: ["$isProforma", true] }] }, 1, 0] } }, purchase: { $sum: { $cond: [{ $eq: ["$type", "purchase"] }, 1, 0] } }, proforma: { $sum: { $cond: [{ $eq: ["$isProforma", true] }, 1, 0] } }, approved: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "purchase"] }, { $eq: ["$approvalStatus", "approved"] }] }, 1, 0] } } } }],
      total: [...selection, { $count: "value" }],
      rows: [...selection, ...after, { $sort: { issueDate: -1, _id: -1 } }, { $limit: INVOICE_PAGE_SIZE + 1 }, { $project: { id: { $toString: "$_id" }, _id: 0 } }],
    } });
    type Facet = { counts: { all: number; sale: number; purchase: number; proforma: number; approved: number }[]; total: { value: number }[]; rows: { id: string }[] };
    const result = await prisma.invoice.aggregateRaw({ pipeline: stages as Prisma.InputJsonObject[] }) as unknown as Facet[];
    const data = result[0], ids = data.rows.slice(0, INVOICE_PAGE_SIZE).map(row => row.id);
    const rows = await prisma.invoice.findMany({ where: { id: { in: ids }, ...(unassigned ? { userId: user.id, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }] } : { sellerCompanyId: companyId! }) }, include: { sellerCompany: { include: { bankAccounts: true } }, payments: true } });
    const byId = new Map(rows.map(row => [row.id, row]));
    return json({ invoices: ids.flatMap(id => byId.has(id) ? [invoiceToDto(byId.get(id)!)] : []), total: data.total[0]?.value || 0, counts: data.counts[0] || { all: 0, sale: 0, purchase: 0, proforma: 0, approved: 0 }, nextCursor: data.rows.length > INVOICE_PAGE_SIZE ? ids.at(-1) : null });
  } catch (e) { return handleApiError(e); }
}
