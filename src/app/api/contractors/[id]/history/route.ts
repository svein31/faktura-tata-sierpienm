import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { objectId, contractorForCompany } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const id = (await params).id;
    const query = new URL(req.url).searchParams;
    const companyId = query.get("companyId");
    const cursor = query.get("cursor");
    const salesOnly = query.get("type") === "sale";
    if (!objectId(id) || (!objectId(companyId) && companyId !== "unassigned") || (cursor && !objectId(cursor))) throw new ApiError(400, "Nieprawidłowe parametry historii.");
    if (companyId !== "unassigned") {
      const access = await requireCompanyAccess(user.id, companyId!);
      if (!access.ok) throw new ApiError(access.status, access.error);
    }
    if (!await contractorForCompany(user.id, id, companyId === "unassigned" ? null : companyId)) throw new ApiError(404, "Nie znaleziono kontrahenta.");
    const where: Prisma.InvoiceWhereInput = { contractorId: id,
      ...(companyId === "unassigned" ? { userId: user.id, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }] } : { sellerCompanyId: companyId! }),
    };
    if (cursor && !await prisma.invoice.findFirst({ where: { ...where, id: cursor }, select: { id: true } })) throw new ApiError(409, "Lista zmieniła się. Wróć do pierwszej strony.");
    const rows = await prisma.invoice.findMany({
      where: salesOnly ? { ...where, type: "sale" } : where, orderBy: [{ issueDate: "desc" }, { id: "desc" }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21,
      select: { id: true, number: true, issueDate: true, dueDate: true, type: true, status: true, documentStatus: true, paymentStatus: true, isProforma: true, currency: true, totalGross: true },
    });
    // All aggregates are calculated inside MongoDB. Invoice bodies stay on the server.
    const match: Record<string, unknown> = { contractorId: id, ...(companyId === "unassigned" ? { userId: { $oid: user.id }, $or: [{ sellerCompanyId: null }, { sellerCompanyId: { $exists: false } }] } : { sellerCompanyId: { $oid: companyId! } }) };
    const pipeline: Record<string, unknown>[] = [
      { $match: match },
      { $facet: {
        count: [{ $count: "value" }],
        balances: [{ $match: { isProforma: { $ne: true }, status: { $ne: "draft" }, documentStatus: { $nin: ["draft", "cancelled"] } } },
          { $addFields: { outstanding: { $cond: [
            { $or: [{ $eq: ["$status", "paid"] }, { $eq: ["$paymentStatus", "paid"] }] }, 0,
            { $round: [{ $subtract: [{ $ifNull: ["$totalGross", 0] }, { $ifNull: ["$paidAmount", 0] }] }, 2] },
          ] } } },
          { $group: { _id: "$currency", receivable: { $sum: { $cond: [{ $eq: ["$type", "sale"] }, "$outstanding", 0] } }, payable: { $sum: { $cond: [{ $eq: ["$type", "purchase"] }, "$outstanding", 0] } } } }],
        sales: [{ $match: { type: "sale", isProforma: { $ne: true }, status: { $ne: "draft" }, documentStatus: { $nin: ["draft", "cancelled"] } } },
          { $group: { _id: "$currency", count: { $sum: 1 }, turnover: { $sum: { $ifNull: ["$totalGross", 0] } },
            overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$paymentStatus", "paid"] }, { $ne: ["$status", "paid"] }, { $gt: ["$dueDate", ""] }, { $lt: ["$dueDate", new Date().toISOString().slice(0, 10)] }] }, 1, 0] } } } }],
      } },
    ];
    type Aggregate = { count: { value: number }[]; balances: { _id: string; receivable: number; payable: number }[]; sales: { _id: string; count: number; turnover: number; overdue: number }[] };
    const result = await prisma.invoice.aggregateRaw({ pipeline: pipeline as Prisma.InputJsonObject[] }) as unknown as Aggregate[];
    const summary = result[0] || { count: [], balances: [], sales: [] };
    return json({ invoices: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null,
      total: summary.count[0]?.value || 0, balances: summary.balances.map(b => ({ currency: b._id || "PLN", receivable: b.receivable, payable: b.payable })),
      sales: summary.sales.map(s => ({ currency: s._id || "PLN", count: s.count, turnover: s.turnover, overdue: s.overdue })) });
  } catch (error) { return handleApiError(error); }
}
