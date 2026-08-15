import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSession,
  normalizeEmail,
  sessionCookieOptions,
  SESSION_COOKIE,
  toPublicUser,
  verifyPassword,
} from "@/lib/auth";
import { handleApiError, json, readJson, str } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/auth/login
 * Logowanie — jednakowy komunikat błędu dla złego e-maila i hasła (brak enumeracji).
 */
export async function POST(req: Request) {
  try {
    const rl = rateLimit(req, { windowMs: 15 * 60 * 1000, max: 10 });
    if (!rl.allowed) {
      return json(
        { error: "Zbyt wiele prób logowania. Spróbuj ponownie za chwilę.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } }
      );
    }

    const body = await readJson(req);
    const email = normalizeEmail(str(body.email));
    const password = str(body.password);

    if (!email || !password) {
      return json(
        { error: "Nieprawidłowy e-mail lub hasło.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) {
      return json(
        { error: "Nieprawidłowy e-mail lub hasło.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const { token } = await createSession(user.id);
    const res = NextResponse.json({ user: toPublicUser(user) }, { status: 200, headers: { "Cache-Control": "no-store" } });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    return handleApiError(e);
  }
}
