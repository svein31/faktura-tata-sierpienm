import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, assertObjectId, handleApiError, json } from "@/lib/api";
import { inboxAccess } from "@/lib/document-inbox";
import { ensureDocumentSafety } from "@/lib/document-safety";
import { rateLimitShared } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const { id } = await context.params; assertObjectId(id);
    const doc = await prisma.expenseScan.findUnique({ where: { id } }); if (!doc) throw new ApiError(404, "Nie znaleziono dokumentu.");
    await inboxAccess(user.id, doc.companyId, true);
    if (!(await rateLimitShared(req, { max: 20, windowMs: 60000 }, "document-scan:" + user.id)).allowed) throw new ApiError(429, "Zbyt wiele skanowań. Spróbuj później.");
    await ensureDocumentSafety(doc, true);
    return json({ safety: await prisma.expenseScan.findUnique({ where: { id }, select: { safetyStatus: true, safetyReason: true, safetyCheckedAt: true } }) });
  } catch (e) { return handleApiError(e); }
}
