import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { json } from "@/lib/api";

export const runtime = "nodejs";

/** POST /api/auth/logout — usuwa sesję z bazy i czyści cookie (idempotentny). */
export async function POST(req: Request) {
  const session = await getSession();
  if (session) {
    await prisma.session.delete({ where: { id: session.sessionId } }).catch(() => undefined);
  }
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0 });
  return res;
}
