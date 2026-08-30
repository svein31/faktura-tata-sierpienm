import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "fakturo_session";
export const ALT_SESSION_COOKIE = "auth_session";

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

  // 2. Pobierz token sesji z ciasteczka (obsługa obu nazw ciasteczek)
  const token =
    request.cookies.get(SESSION_COOKIE)?.value ||
    request.cookies.get(ALT_SESSION_COOKIE)?.value;

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

  // 5. Jeśli użytkownik jest na /login lub /register, pozwól na wyświetlenie strony
  // (NIGDY nie wykonuj ślepego przekierowania z /login na /, aby wyeliminować pętle ERR_TOO_MANY_REDIRECTS
  // w przypadku nieaktywnego lub wygasłego tokenu w bazie danych)
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
