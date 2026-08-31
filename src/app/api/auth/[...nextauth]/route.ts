import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSession,
  getAuthSecret,
  normalizeEmail,
  sessionCookieOptions,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  toPublicUser,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Konfiguracja NextAuth / JWT Route Handler
 * Obsługuje standardowe żądania autoryzacji z 30-dniową sesją JWT i bezpiecznymi ciasteczkami.
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Obsługa logowania Credentials Provider (POST /api/auth/callback/credentials lub /api/auth/signin)
    if (pathname.includes("credentials") || pathname.includes("signin") || pathname.includes("login")) {
      const body = await req.json().catch(() => ({}));
      const email = normalizeEmail(body.email || body.username);
      const password = String(body.password || "");

      if (!email || !password) {
        return NextResponse.json(
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
        return NextResponse.json(
          { error: "Nieprawidłowy e-mail lub hasło.", code: "INVALID_CREDENTIALS" },
          { status: 401 }
        );
      }

      const { token } = await createSession(user.id);
      const cookieOpts = sessionCookieOptions();

      const res = NextResponse.json({
        success: true,
        user: toPublicUser(user),
        message: "Zalogowano pomyślnie.",
      });

      res.cookies.set(SESSION_COOKIE, token, cookieOpts);
      return res;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd autoryzacji" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname.endsWith("/session")) {
    const { getSessionUser } = await import("@/lib/auth");
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(null);
    }
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
    });
  }

  if (pathname.endsWith("/csrf")) {
    return NextResponse.json({ csrfToken: "fakturo-csrf-token" });
  }

  if (pathname.endsWith("/providers")) {
    return NextResponse.json({
      credentials: {
        id: "credentials",
        name: "Credentials",
        type: "credentials",
        signinUrl: "/api/auth/signin/credentials",
        callbackUrl: "/api/auth/callback/credentials",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
