import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSession,
  extractRequestMetadata,
  normalizeEmail,
  sessionCookieOptions,
  SESSION_COOKIE,
  toPublicUser,
  verifyPassword,
} from "@/lib/auth";
import { handleApiError, json, readJson, str } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/login
 * Logowanie użytkownika z trwałą sesją (10 lat):
 * - Weryfikacja hasła (bcrypt)
 * - Generowanie nowej sesji w bazie danych Prisma z metadanymi klienta (IP, User-Agent)
 * - Ustawienie trwałego ciasteczka HttpOnly
 */
export async function POST(req: Request) {
  try {
    const rl = rateLimit(req, { windowMs: 15 * 60 * 1000, max: 15 });
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

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        company: true,
        ksef: true,
      },
    });

    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) {
      return json(
        { error: "Nieprawidłowy e-mail lub hasło.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const metadata = extractRequestMetadata(req);
    const { token } = await createSession(user.id, metadata);

    const res = NextResponse.json(
      {
        success: true,
        user: toPublicUser(user),
        message: "Zalogowano pomyślnie.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );

    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    return handleApiError(e);
  }
}
