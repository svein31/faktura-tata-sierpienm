import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
 * Logowanie użytkownika z trwałą 30-dniową sesją JWT i bezpiecznymi ciasteczkami Netlify:
 * - Weryfikacja hasła (bcrypt.compare)
 * - Normalizacja adresu e-mail (lowercase & trim)
 * - Generowanie trwałego tokenu JWT i sesji DB z metadanymi klienta
 * - Ustawienie 30-dniowego ciasteczka HttpOnly
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
        companyProfiles: true,
        ksef: true,
      },
    });

    const isValid = user ? await verifyPassword(password, user.password) : false;
    if (!user || !isValid) {
      return json(
        { error: "Nieprawidłowy e-mail lub hasło.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const metadata = extractRequestMetadata(req);
    const { token } = await createSession(user.id, metadata);
    const cookieOpts = sessionCookieOptions();

    try {
      cookies().set(SESSION_COOKIE, token, cookieOpts);
      cookies().set("fakturo_session", token, cookieOpts);
    } catch {
      // ignore
    }

    const res = NextResponse.json(
      {
        success: true,
        user: toPublicUser(user),
        message: "Zalogowano pomyślnie.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );

    res.cookies.set(SESSION_COOKIE, token, cookieOpts);
    res.cookies.set("fakturo_session", token, cookieOpts);
    return res;
  } catch (e) {
    return handleApiError(e);
  }
}
