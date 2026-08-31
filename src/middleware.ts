import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const COOKIE_NAMES = [
  "auth_session",
  "fakturo_session",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  // 3. Definicja ścieżek publicznych autoryzacji
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");

  // 4. Brak tokenu + próba wejścia na chronioną stronę -> Przekierowanie na /login
  if (!token && !isAuthPage) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 5. Jeśli użytkownik wchodzi na /dashboard, przekieruj na główny pulpit /
  if (pathname === "/dashboard") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
