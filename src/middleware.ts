import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isUnsafeCrossOrigin } from "@/lib/csrf";

export const COOKIE_NAMES = [
  "fakturaprosto_session",
  "auth_session",
  "fakturo_session",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && isUnsafeCrossOrigin(request)) {
    return NextResponse.json({ error: "Żądanie pochodzi z niedozwolonej strony.", code: "CSRF_REJECTED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  // 1. Zezwól na dostęp do plików statycznych, zasobów Next.js, ikon i endpointów API
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/sw.js"
  ) {
    return NextResponse.next();
  }

  // 2. Pobierz token sesji z ciasteczek (obsługa NextAuth, secure oraz legacy)
  let token: string | undefined;
  for (const cookieName of COOKIE_NAMES) {
    const val = request.cookies.get(cookieName)?.value;
    if (val) {
      token = val;
      break;
    }
  }

  // 3. Definicja ścieżek publicznych
  const isLegalPath =
    pathname === "/regulamin" ||
    pathname === "/polityka-prywatnosci" ||
    pathname === "/polityka-cookies" ||
    pathname === "/powierzenie-danych" ||
    pathname === "/podwykonawcy";

  const isPublicSeoPath = ["/program-do-faktur", "/faktury", "/poradnik-ksef", "/vat", "/narzedzia"]
    .some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));

  const isPublicPath =
    pathname === "/" ||
    pathname === "/demo" ||
    pathname === "/pomoc" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/portal") ||
    isPublicSeoPath ||
    isLegalPath;

  // Ciasteczko może wskazywać wygasłą lub usuniętą sesję. Nie przekierowuj
  // z /login na podstawie samego tokenu: ekran logowania sprawdza sesję
  // przez /api/auth/me i przekierowuje dopiero po potwierdzeniu w bazie.
  // W przeciwnym razie /login i chroniony /dashboard zapętlają przekierowania.
  // Brak tokenu + próba wejścia na chronioną stronę -> /login
  if (!token && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
