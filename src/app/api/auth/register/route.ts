import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  extractRequestMetadata,
  sessionCookieOptions,
  toPublicUser,
  validateCredentials,
} from "@/lib/auth";
import { json, readJson, str, cleanStr, ApiError } from "@/lib/api";
import { rateLimitShared } from "@/lib/rate-limit";
import { reportUnexpectedError } from "@/lib/error-report";
import { recordLegalConsent } from "@/lib/legal/record-consent";
import { LEGAL_VERSIONS } from "@/lib/legal/config";
import { requestEmailVerification } from "@/lib/email/verification";
import { recordPilotEvent } from "@/lib/pilot-metrics";
import { PASSWORD_LENGTH_MESSAGE } from "@/lib/password-policy";
import { normalizeNip, isValidNipFormat } from "@/lib/validation";

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
    const rl = await rateLimitShared(req, { windowMs: 15 * 60 * 1000, max: 25 }, "register");
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
    const rawName = cleanStr(body.name, 100, "name");
    const nip = normalizeNip(cleanStr(body.nip, 20, "nip"));
    const companyName = cleanStr(body.companyName, 250, "companyName");
    if (nip && !isValidNipFormat(nip)) throw new ApiError(400, "NIP ma nieprawidłowy format lub sumę kontrolną.", "INVALID_INPUT");
    if (body.company !== undefined && (typeof body.company !== "object" || body.company === null || Array.isArray(body.company))) throw new ApiError(400, "Nieprawidłowe dane firmy.", "INVALID_INPUT");
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
              : PASSWORD_LENGTH_MESSAGE,
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
        emailVerificationRequiredAt: new Date(),
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
                  street: cleanStr(companyBody.street, 200, "company.street") || null,
                  buildingNumber: cleanStr(companyBody.buildingNumber, 30, "company.buildingNumber") || null,
                  flatNumber: cleanStr(companyBody.flatNumber, 30, "company.flatNumber") || null,
                  city: cleanStr(companyBody.city, 100, "company.city") || null,
                  postalCode: cleanStr(companyBody.postal ?? companyBody.postalCode, 20, "company.postalCode") || null,
                  bankAccount: cleanStr(companyBody.iban ?? companyBody.bankAccount, 60, "company.bankAccount") || null,
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
    const metadata = { ...extractRequestMetadata(req), expectedPasswordHash: user.password, expectedLoginEmail: user.email };
    const { token } = await createSession(user.id, metadata);
    const cookieOpts = sessionCookieOptions({ maxAge: 30 * 24 * 60 * 60 }, req);

    let verificationDelivery = "failed";
    try { verificationDelivery = (await requestEmailVerification(user.id)).delivery; }
    catch { console.warn("[Auth Register] Nie udało się przygotować potwierdzenia e-mail; konto pozostaje dostępne."); }
    const res = NextResponse.json(
      {
        success: true,
        user: toPublicUser(user),
        message: "Rejestracja zakończona sukcesem.",
        verificationDelivery,
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

    await recordPilotEvent(req, "register");
    return res;
  } catch (error: unknown) {
    if (!(error instanceof ApiError)) reportUnexpectedError(error);

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
          error: "Usługa jest chwilowo niedostępna. Spróbuj ponownie później.",
          code: "DATABASE_CONNECTION_ERROR",
        },
        { status: 503 }
      );
    }

    return json(
      {
        error: "Wystąpił błąd serwera podczas rejestracji. Spróbuj ponownie później.",
        code: "REGISTRATION_FAILED",
      },
      { status: 500 }
    );
  }
}
