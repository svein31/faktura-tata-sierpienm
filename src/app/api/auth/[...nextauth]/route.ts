import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSession,
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
export { POST } from "../login/route";

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
    return NextResponse.json({ csrfToken: randomBytes(32).toString("base64url") });
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
