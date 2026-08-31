import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, LEGACY_COOKIES } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/logout
 * Usuwa sesję z bazy danych Prisma oraz czyści ciasteczka sesyjne w przeglądarce.
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

  for (const cookieName of LEGACY_COOKIES) {
    res.cookies.set(cookieName, "", cookieClearOpts);
  }

  return res;
}
