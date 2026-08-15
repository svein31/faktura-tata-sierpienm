import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware (edge) — szybka brama dostępu.
 *
 * - Obecność cookie sesji = warunek wstępny; pełna weryfikacja (hash w bazie,
 *   expiry) odbywa się po stronie serwera: API routes (requireUser) oraz
 *   layout (app)/layout.tsx (getSessionUser + redirect).
 * - Publiczne: /login, /register, /api/auth/*, /api/health.
 * - Zalogowany użytkownik wchodzący na /login lub /register → redirect na /.
 */

const SESSION_COOKIE = "fakturo_session";

function isPublic(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/register") return true;
  if (pathname === "/api/health" || pathname.startsWith("/api/health")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (isPublic(pathname)) {
    if (hasSession && (pathname === "/login" || pathname === "/register")) {
      const url = new URL("/", req.url);
      url.searchParams.set("already", "1");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Nieautoryzowany.", code: "UNAUTHENTICATED" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Wszystko poza assetami statycznymi i obrazami.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
