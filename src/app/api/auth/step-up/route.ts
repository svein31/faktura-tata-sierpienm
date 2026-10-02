import { prisma } from "@/lib/db";
import { getSession, verifyPassword } from "@/lib/auth";
import { consumeMfaCode } from "@/lib/mfa";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { rateLimitShared } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const session = await getSession(); if (!session) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req), password = str(body.password), code = str(body.code).trim();
    // Persistent throttling is shared with login across serverless workers.
    const limiter = await rateLimitShared(req, { max: 10, windowMs: 15 * 60000 }, "step-up:" + session.user.id);
    if (!limiter.allowed) throw new ApiError(429, "Zbyt wiele prób. Spróbuj później.");
    if (password.length > 128 || !await verifyPassword(password, session.user.password)) throw new ApiError(401, "Nieprawidłowe hasło.");
    const mfa = await prisma.userMfa.findUnique({ where: { userId: session.user.id } });
    if (mfa?.enabledAt && !await consumeMfaCode(session.user.id, code)) throw new ApiError(401, "Nieprawidłowy lub użyty kod 2FA.");
    const now = new Date();
    const updated = await prisma.session.updateMany({ where: { id: session.sessionId, userId: session.user.id, expiresAt: { gt: now } }, data: { authenticatedAt: now } });
    if (!updated.count) throw new ApiError(401, "Sesja wygasła.");
    return json({ expiresAt: new Date(now.getTime() + 600000).toISOString() });
  } catch (e) { return handleApiError(e); }
}
