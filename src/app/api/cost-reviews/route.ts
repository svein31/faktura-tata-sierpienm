import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, cleanStr, json, readJson, handleApiError } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { costReviewCommand } from "@/lib/cost-review";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { CompanyRole } from "@/lib/types";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try { const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany."); return json(await costReviewCommand(user, await readJson(req))); }
  catch (e) { return handleApiError(e); }
}
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams;
    const { company, role } = await companyAccess(prisma, user.id, params.get("companyId"));
    const reviewId = params.get("reviewId");
    if (reviewId) {
      if (!objectId(reviewId)) throw new ApiError(400, "Nieprawidłowy obieg.");
      const review = await prisma.costReview.findFirst({ where: { id: reviewId, companyId: company.id } });
      if (!review) throw new ApiError(404, "Nie znaleziono obiegu.");
      const cursor = params.get("cursor"); if (cursor && !objectId(cursor)) throw new ApiError(400, "Nieprawidłowa strona historii.");
      const events = await prisma.costReviewEvent.findMany({ where: { reviewId, ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: "desc" }, take: 31 });
      return json({ review, events: events.slice(0, 30), nextCursor: events.length > 30 ? events[29].id : null });
    }
    const search = cleanStr(params.get("search") || "", 120, "wyszukiwanie");
    const cursor = params.get("cursor"); if (cursor && !objectId(cursor)) throw new ApiError(400, "Nieprawidłowa strona.");
    const status = params.get("status") || "all";
    if (!["all", "pending", "approved", "rejected"].includes(status)) throw new ApiError(400, "Nieprawidłowy status.");
    const filter = { contains: search, mode: "insensitive" as const };
    const [reviews, policy, members, owner, invoices, expenses] = await Promise.all([
      prisma.costReview.findMany({ where: { companyId: company.id, ...(search ? { number: filter } : {}), ...(status !== "all" ? { status } : {}), ...(cursor ? { id: { lt: cursor } } : {}) }, take: 31, orderBy: { id: "desc" } }),
      prisma.costReviewPolicy.findUnique({ where: { id: company.id } }),
      prisma.companyMember.findMany({ where: { companyId: company.id }, include: { user: { select: { id: true, name: true } } } }),
      prisma.user.findUnique({ where: { id: company.userId }, select: { id: true, name: true } }),
      prisma.invoice.findMany({ where: { sellerCompanyId: company.id, type: "purchase", OR: [{ costReviewId: null }, { costReviewId: { isSet: false } }], ...(search ? { number: filter } : {}) }, select: { id: true, number: true, issueDate: true, currency: true, totalGross: true }, take: 20, orderBy: { id: "desc" } }),
      prisma.expense.findMany({ where: { companyId: company.id, OR: [{ costReviewId: null }, { costReviewId: { isSet: false } }], ...(search ? { number: filter } : {}) }, select: { id: true, number: true, issueDate: true, currency: true, totalGross: true }, take: 20, orderBy: { id: "desc" } }),
    ]);
    const approvers = members.filter(m => m.role === "owner" || (m.canExport ?? DEFAULT_ROLE_PERMISSIONS[m.role as CompanyRole]?.canExport)).map(m => ({ userId: m.userId, name: m.user.name || "Użytkownik" }));
    if (owner && !members.some(m => m.userId === owner.id)) approvers.push({ userId: owner.id, name: owner.name || "Właściciel" });
    return json({ reviews: reviews.slice(0, 30), nextCursor: reviews.length > 30 ? reviews[29].id : null, policy: policy || { steps: owner ? [{ userId: owner.id, name: owner.name }] : [], version: 0 }, approvers, role, userId: user.id, candidates: [...invoices.map(i => ({ ...i, documentType: "invoice" })), ...expenses.map(e => ({ ...e, documentType: "expense" }))] });
  } catch (e) { return handleApiError(e); }
}
