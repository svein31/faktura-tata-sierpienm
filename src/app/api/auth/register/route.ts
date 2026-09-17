import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  extractRequestMetadata,
  sessionCookieOptions,
  toPublicUser,
  validateCredentials,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth";
import { json, readJson, str, ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { recordLegalConsent } from "@/lib/legal/record-consent";
import { LEGAL_VERSIONS } from "@/lib/legal/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/register
 * 1. E-mail sprowadzaj do email.trim().toLowerCase()
 * 2. Hasło hashuj przez await bcrypt.hash(password, 12)
 * 3. Jeśli rejestracja się powiedzie, zwróć status 201 i automatycznie ustaw ciasteczko sesyjne auth_session z czasem ważności 30 dni.
 */
export async function POST(req: Request) {
  try {
    // 1. Sprawdzenie konfiguracji bazy danych
    if (!process.env.DATABASE_URL) {
      console.error("[Auth Register] Brak zmiennej DATABASE_URL.");
      return json(
        {
          error: "Brak skonfigurowanej bazy danych. Dodaj zmienną DATABASE_URL w panelu Netlify / hostingu.",
          code: "DATABASE_URL_MISSING",
        },
        { status: 500 }
      );
    }

    // 2. Rate limiting
    const rl = rateLimit(req, { windowMs: 15 * 60 * 1000, max: 25 });
    if (!rl.allowed) {
      return json(
        { error: "Zbyt wiele prób rejestracji. Spróbuj ponownie za chwilę.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } }
      );
    }

    // 3. Odczyt i normalizacja danych
    const body = await readJson(req);
    const rawEmail = str(body.email);
    const cleanEmail = rawEmail.trim().toLowerCase();
    const password = str(body.password);
    const rawName = str(body.name).trim();
    const nip = str(body.nip).replace(/[^0-9]/g, "").trim();
    const companyName = str(body.companyName).trim();
    const acceptTerms = body.acceptTerms === true;
    const acceptMarketing = body.acceptMarketing === true;

    // 4a. Walidacja akceptacji Regulaminu (wymagana prawnie)
    if (!acceptTerms) {
      return json(
        { error: "Akceptacja Regulaminu jest wymagana do utworzenia konta.", code: "TERMS_NOT_ACCEPTED" },
        { status: 400 }
      );
    }

    // 4. Walidacja formatu e-mail i hasła
    const v = validateCredentials(cleanEmail, password);
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
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return json(
        { error: "Konto z podanym adresem e-mail już istnieje w systemie.", code: "USER_EXISTS" },
        { status: 409 }
      );
    }

    // 6. Haszowanie hasła przez await bcrypt.hash(password, 12)
    const passwordHash = await bcrypt.hash(password, 12);
    const companyBody = (body.company as Record<string, unknown>) || {};
    const hasExplicitCompany = Boolean(nip && (companyName || rawName));

    // 7. Utworzenie użytkownika w MongoDB Atlas
    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        password: passwordHash,
        name: rawName || cleanEmail.split("@")[0] || "Użytkownik",
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

    // 8. Utworzenie 30-dniowej sesji
    const metadata = extractRequestMetadata(req);
    const { token } = await createSession(user.id, metadata);
    const cookieOpts = sessionCookieOptions({ maxAge: 30 * 24 * 60 * 60 }, req);

    const res = NextResponse.json(
      {
        success: true,
        user: toPublicUser(user),
        message: "Rejestracja zakończona sukcesem.",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );

    res.cookies.set("fakturaprosto_session", token, cookieOpts);
    res.cookies.set("auth_session", token, cookieOpts);
    res.cookies.set("fakturo_session", token, cookieOpts);
    res.cookies.set("next-auth.session-token", token, cookieOpts);

    // 9. Zarejestruj zgodę prawną (regulamin) w bazie danych
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const clientUa = req.headers.get("user-agent") || null;

    await recordLegalConsent({
      userId: user.id,
      documentType: "terms_of_service",
      documentVersion: LEGAL_VERSIONS.terms,
      accepted: true,
      rawIp: clientIp,
      userAgent: clientUa,
      context: "registration",
    });

    // 10. Opcjonalna zgoda marketingowa
    if (acceptMarketing) {
      await recordLegalConsent({
        userId: user.id,
        documentType: "marketing_email",
        documentVersion: LEGAL_VERSIONS.terms,
        accepted: true,
        rawIp: clientIp,
        userAgent: clientUa,
        context: "registration",
      });
    }

    return res;
  } catch (error: unknown) {
    console.error("Błąd rejestracji:", error);

    if (error instanceof ApiError) {
      return json({ error: error.message, code: error.code ?? "BAD_REQUEST" }, { status: error.status });
    }

    const prismaError = error as { code?: string; message?: string; name?: string };

    if (prismaError.code === "P2002") {
      return json(
        { error: "Konto z podanym adresem e-mail już istnieje w systemie.", code: "USER_EXISTS" },
        { status: 409 }
      );
    }

    if (
      prismaError.code === "P1001" ||
      prismaError.code === "P1000" ||
      prismaError.code === "P1002" ||
      prismaError.code === "P1017"
    ) {
      return json(
        {
          error: "Nie można połączyć się z bazą danych MongoDB Atlas. Upewnij się, że w panelu MongoDB Atlas w Network Access dodano adres 0.0.0.0/0.",
          code: "DATABASE_CONNECTION_ERROR",
        },
        { status: 503 }
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
