import { prisma } from "@/lib/db";
import { getSession, LEGACY_COOKIES } from "@/lib/auth";
import { requireRecentAuth } from "@/lib/security-policy";
import { ApiError, assertObjectId, handleApiError, json, readJson } from "@/lib/api";
export const runtime = "nodejs";
export async function GET() {
  try {
    const session = await getSession(); if (!session) throw new ApiError(401, "Nieautoryzowany.");
    const sessions = await prisma.session.findMany({ where: { userId: session.user.id, expiresAt: { gt: new Date() } }, select: { id: true, userAgent: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return json({ sessions: sessions.map(s => ({ ...s, current: s.id === session.sessionId })) });
  } catch (e) { return handleApiError(e); }
}
export async function DELETE(req: Request) {
  try {
    const session = await getSession(); if (!session) throw new ApiError(401, "Nieautoryzowany.");
    await requireRecentAuth(session.user.id);
    const body = await readJson(req);
    if (body.all !== true) assertObjectId(body.id);
    const deleted = await prisma.session.deleteMany({ where: { userId: session.user.id, ...(body.all === true ? {} : { id: body.id as string }) } });
    const response = json({ deleted: deleted.count, signedOut: body.all === true || body.id === session.sessionId });
    if (body.all === true || body.id === session.sessionId) for (const name of LEGACY_COOKIES) response.cookies.set(name, "", { path: "/", httpOnly: true, secure: new URL(req.url).protocol === "https:", sameSite: "lax", maxAge: 0 });
    return response;
  } catch (e) { return handleApiError(e); }
}
