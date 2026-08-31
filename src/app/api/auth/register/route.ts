import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  extractRequestMetadata,
  hashPassword,
  normalizeEmail,
  sessionCookieOptions,
  SESSION_COOKIE,
  toPublicUser,
  validateCredentials,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth";
import { json, readJson, str, ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/register
 * Rejestracja nowego użytkownika w PostgreSQL:
 * - Weryfikacja zmiennej środowiskowej DATABASE_URL
 * - Normalizacja i walidacja danych (email, hasło)
 * - Bezpieczne haszowanie hasła (bcryptjs, 12 rund)
 * - Utworzenie rekordu User w bazie PostgreSQL (Supabase / Neon / RDS)
 * - Utworzenie 30-dniowej sesji JWT i ustawienie ciasteczka HttpOnly
 * - Dokładna obsługa błędów z czytelnymi komunikatami
 */
export async function POST(req: Request) {
  try {
    // 1. Sprawdzenie konfiguracji bazy danych
    if (!process.env.DATABASE_URL) {
      console.error("[Auth Register] Brak skonfigurowanej zmiennej środowiskowej DATABASE_URL w środowisku Netlify.");
      return json(
        {
          error: "Brak skonfigurowanej bazy danych. Dodaj zmienną DATABASE_URL w panelu Netlify (Site configuration -> Environment variables).",
          code: "DATABASE_URL_MISSING",
        },
        { status: 500 }
      );
    }

    // 2. Rate limiting (ochrona przed atakami brute-force)
    const rl = rateLimit(req, { windowMs: 15 * 60 * 1000, max: 15 });
    if (!rl.allowed) {
      return json(
        { error: "Zbyt wiele prób rejestracji. Spróbuj ponownie za chwilę.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } }
      );
    }

    // 3. Odczyt i normalizacja danych
    const body = await readJson(req);
    const email = normalizeEmail(str(body.email));
    const password = str(body.password);
    const rawName = str(body.name).trim();
    const nip = str(body.nip).replace(/[^0-9]/g, "").trim();
    const companyName = str(body.companyName).trim();
    const name = rawName || companyName || email.split("@")[0] || "Użytkownik";

    // 4. Walidacja formatu e-mail i siły hasła
    const v = validateCredentials(email, password);
    if (!v.ok) {
      return json(
        {
          error:
            v.reason === "invalid_email"
              ? "Podano nieprawidłowy adres e-mail."
              : `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`,
          code: "INVALID_INPUT",
        },
        { status: 400 }
      );
    }

    // 5. Sprawdzenie czy użytkownik już istnieje
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return json(
        { error: "Konto z podanym adresem e-mail już istnieje w systemie.", code: "USER_EXISTS" },
        { status: 409 }
      );
    }

    // 6. Haszowanie hasła (bcryptjs 12 rund)
    const passwordHash = await hashPassword(password);
    const companyBody = (body.company as Record<string, unknown>) || {};
    const hasExplicitCompany = Boolean(nip && (companyName || rawName));

    // 7. Utworzenie użytkownika w PostgreSQL
    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        name: rawName || email.split("@")[0] || "Użytkownik",
        nip: nip || null,
        companyName: companyName || null,
        ...(hasExplicitCompany
          ? {
              companyProfiles: {
                create: {
                  nip: nip || "",
                  companyName: companyName || rawName,
                  street: str(companyBody.street) || null,
                  buildingNumber: str(companyBody.buildingNumber) || null,
                  flatNumber: str(companyBody.flatNumber) || null,
                  city: str(companyBody.city) || null,
                  postalCode: str(companyBody.postal) || str(companyBody.postalCode) || null,
                  bankAccount: str(companyBody.iban) || str(companyBody.bankAccount) || null,
                  isDefault: true,
                },
              },
            }
          : {}),
      },
      include: {
        company: true,
        companyProfiles: true,
        ksef: true,
      },
    });

    // 8. Utworzenie 30-dniowej sesji JWT
    const metadata = extractRequestMetadata(req);
    const { token } = await createSession(user.id, metadata);
    const cookieOpts = sessionCookieOptions();

    try {
      cookies().set(SESSION_COOKIE, token, cookieOpts);
      cookies().set("fakturo_session", token, cookieOpts);
    } catch {
      // ignore
    }

    const res = NextResponse.json(
      {
        success: true,
        user: toPublicUser(user),
        message: "Rejestracja zakończona sukcesem.",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );

    res.cookies.set(SESSION_COOKIE, token, cookieOpts);
    res.cookies.set("fakturo_session", token, cookieOpts);
    return res;
  } catch (error: unknown) {
    console.error("Błąd rejestracji:", error);

    if (error instanceof ApiError) {
      return json({ error: error.message, code: error.code ?? "BAD_REQUEST" }, { status: error.status });
    }

    // Obsługa specyficznych kodów błędów Prisma
    const prismaError = error as { code?: string; message?: string; name?: string };

    if (prismaError.code === "P2002") {
      return json(
        { error: "Konto z podanym adresem e-mail już istnieje w systemie.", code: "USER_EXISTS" },
        { status: 409 }
      );
    }

    if (prismaError.code === "P1001" || prismaError.code === "P1000") {
      return json(
        {
          error: "Nie można połączyć się z serwerem bazy danych PostgreSQL. Upewnij się, że baza w chmurze (Supabase / Neon) jest aktywna i dostępna.",
          code: "DATABASE_CONNECTION_ERROR",
        },
        { status: 503 }
      );
    }

    if (prismaError.code === "P2021") {
      return json(
        {
          error: "Tabele w bazie danych nie zostały jeszcze utworzone. Uruchom migrację (npx prisma db push).",
          code: "TABLES_NOT_FOUND",
        },
        { status: 500 }
      );
    }

    if (prismaError.name === "PrismaClientInitializationError") {
      return json(
        {
          error: "Błąd inicjalizacji bazy danych. Sprawdź poprawność ciągu połączeniowego DATABASE_URL.",
          code: "DATABASE_INIT_ERROR",
        },
        { status: 500 }
      );
    }

    const message = error instanceof Error ? error.message : "Nieznany błąd serwera.";
    return json(
      {
        error: `Wystąpił błąd podczas rejestracji: ${message}`,
        code: "REGISTRATION_FAILED",
      },
      { status: 500 }
    );
  }
}
