import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, SESSION_COOKIE, ALT_SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/logout
 * Usuwa sesję z bazy danych Prisma oraz czyści ciasteczko sesyjne w przeglądarce.
 */
export async function POST() {
  const session = await getSession();
  if (session) {
    await prisma.session.delete({ where: { id: session.sessionId } }).catch(() => undefined);
  }

  const res = NextResponse.json(
    { success: true, ok: true, message: "Wylogowano pomyślnie." },
    { headers: { "Cache-Control": "no-store" } }
  );

  const cookieClearOpts = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  };

  res.cookies.set(SESSION_COOKIE, "", cookieClearOpts);
  res.cookies.set(ALT_SESSION_COOKIE, "", cookieClearOpts);

  return res;
}
