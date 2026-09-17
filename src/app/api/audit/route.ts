import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { auditLogToDto } from "@/lib/dto";
import { accessibleCompanyIds, objectId } from "@/lib/company-scope";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    const query = new URL(req.url).searchParams;
    const companyId = query.get("companyId"), documentId = query.get("documentId"), cursor = query.get("cursor");
    for (const value of [companyId, documentId, cursor]) if (value && !objectId(value)) throw new ApiError(400, "Nieprawidłowy identyfikator.");
    const limit = Number(query.get("limit") || 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new ApiError(400, "Limit musi mieścić się w zakresie 1–200.");
    const companyIds = await accessibleCompanyIds(user.id);
    if (companyId && !companyIds.includes(companyId)) throw new ApiError(403, "Brak dostępu do historii tej firmy.");
    const conditions: Prisma.AuditLogWhereInput[] = [companyId ? { companyId } : { OR: [
      { companyId: { in: companyIds } },
      { userId: user.id, OR: [{ companyId: null }, { companyId: { isSet: false } }] },
    ] }];
    if (documentId) conditions.push({ OR: [{ documentId }, { entityId: documentId }] });
    if (query.get("action")) conditions.push({ action: query.get("action")! });
    const from = query.get("from") ? new Date(query.get("from")!) : undefined;
    const to = query.get("to") ? new Date(query.get("to")!) : undefined;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) || (from && to && from > to)) throw new ApiError(400, "Nieprawidłowy zakres dat.");
    if (from || to) conditions.push({ createdAt: { gte: from, lte: to } });
    if (cursor) {
      const previous = await prisma.auditLog.findFirst({ where: { AND: [...conditions, { id: cursor }] } });
      if (!previous) throw new ApiError(400, "Nieprawidłowy kursor historii.");
      conditions.push({ OR: [{ createdAt: { lt: previous.createdAt } }, { createdAt: previous.createdAt, id: { lt: previous.id } }] });
    }
    const rows = await prisma.auditLog.findMany({ where: { AND: conditions }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
    const logs = rows.slice(0, limit);
    return json({ logs: logs.map(auditLogToDto), nextCursor: rows.length > limit ? logs.at(-1)?.id : null });
  } catch (e) { return handleApiError(e); }
}
