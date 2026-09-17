import { consumeMfaCode } from "@/lib/mfa";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  extractRequestMetadata,
  sessionCookieOptions,
  toPublicUser,
} from "@/lib/auth";
import { json, readJson, str, ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/login
 * 1. Szukaj użytkownika po prisma.user.findUnique({ where: { email: cleanEmail } })
 * 2. Porównuj hasło przez await bcrypt.compare(password, user.password)
 * 3. Po sukcesie ustaw ciasteczko auth_session z maxAge: 30 * 24 * 60 * 60 (30 dni).
 */
export async function POST(req: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return json(
        {
          error: "Brak skonfigurowanej bazy danych (DATABASE_URL) na serwerze.",
          code: "DATABASE_URL_MISSING",
        },
        { status: 500 }
      );
    }

    const rl = rateLimit(req, { windowMs: 15 * 60 * 1000, max: 30 });
    if (!rl.allowed) {
      return json(
        { error: "Zbyt wiele prób logowania. Spróbuj ponownie za chwilę.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } }
      );
    }

    const body = await readJson(req);
    const rawEmail = str(body.email);
    const cleanEmail = rawEmail.trim().toLowerCase();
    const password = str(body.password);

    if (!cleanEmail || !password) {
      return json(
        { error: "Nieprawidłowy e-mail lub hasło.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: {
        company: true,
        companyProfiles: true,
        ksef: true,
      },
    });

    const isValid = user ? await bcrypt.compare(password, user.password) : false;
    if (!user || !isValid) {
      return json(
        { error: "Nieprawidłowy e-mail lub hasło.", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const mfa = await prisma.userMfa.findUnique({ where: { userId: user.id }, select: { enabledAt: true } });
    let mfaVerifiedAt: Date | undefined;
    if (mfa?.enabledAt) {
      const code = str(body.code).trim();
      if (!code) return json({ error: "Podaj kod z aplikacji uwierzytelniającej lub kod odzyskiwania.", code: "MFA_REQUIRED" }, { status: 401 });
      const proof = code.length <= 128 ? await consumeMfaCode(user.id, code) : null;
      if (!proof) return json({ error: "Nieprawidłowy lub już użyty kod 2FA.", code: "MFA_INVALID" }, { status: 401 });
      mfaVerifiedAt = proof.record.enabledAt!;
    }
    const metadata = { ...extractRequestMetadata(req), mfaVerifiedAt };
    const { token } = await createSession(user.id, metadata);
    const cookieOpts = sessionCookieOptions({ maxAge: 30 * 24 * 60 * 60 }, req);

    try {
      (await cookies()).set("auth_session", token, cookieOpts);
      (await cookies()).set("fakturo_session", token, cookieOpts);
      (await cookies()).set("next-auth.session-token", token, cookieOpts);
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

    res.cookies.set("auth_session", token, cookieOpts);
    res.cookies.set("fakturo_session", token, cookieOpts);
    res.cookies.set("next-auth.session-token", token, cookieOpts);
    return res;
  } catch (error: unknown) {
    console.error("Błąd logowania:", error);

    if (error instanceof ApiError) {
      return json({ error: error.message, code: error.code ?? "BAD_REQUEST" }, { status: error.status });
    }

    const prismaError = error as { code?: string; message?: string; name?: string };
    if (
      prismaError.code === "P1001" ||
      prismaError.code === "P1000" ||
      prismaError.code === "P1002" ||
      prismaError.code === "P1017"
    ) {
      return json(
        {
          error: "Nie można połączyć się z bazą danych MongoDB Atlas. Upewnij się, że w MongoDB Atlas w Network Access dodano adres 0.0.0.0/0.",
          code: "DATABASE_CONNECTION_ERROR",
        },
        { status: 503 }
      );
    }

    return json({ error: "Błąd serwera podczas logowania.", code: "INTERNAL" }, { status: 500 });
  }
}

