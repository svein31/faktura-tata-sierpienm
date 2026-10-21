import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { accountingPeriodKey, accountingReadiness, changeAccountingPeriod } from "@/lib/accounting-close";
import { readAccountingHandoff } from "@/lib/accounting-handoff";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams;
    const { company, role } = await companyAccess(prisma, user.id, params.get("companyId"), "canExport");
    const key = accountingPeriodKey(company.id, params.get("month")), cursor = params.get("cursor");
    if (cursor && !objectId(cursor)) throw new ApiError(400, "Nieprawidłowy kursor historii.");
    const [period, readiness, events, handoff] = await Promise.all([
      prisma.accountingPeriod.findUnique({ where: { id: key.id } }),
      accountingReadiness(prisma, company.id, key.month),
      prisma.accountingPeriodEvent.findMany({ where: { periodId: key.id, companyId: company.id, ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: "desc" }, take: 31 }),
      readAccountingHandoff(prisma, company.id, key.month),
    ]);
    return json({ period: period || { ...key, status: "open", version: 0, closedAt: null }, readiness, handoff, events: events.slice(0, 30), nextCursor: events.length > 30 ? events[29].id : null, canClose: role === "owner" || role === "accountant", canReopen: role === "owner" });
  } catch (e) { return handleApiError(e); }
}
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req);
    return json(await prisma.$transaction(tx => changeAccountingPeriod(tx, user, body), { timeout: 30000 }));
  } catch (e) { return handleApiError(e); }
}
