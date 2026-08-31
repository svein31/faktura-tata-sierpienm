import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
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
import { handleApiError, json, readJson, str } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/register
 * Rejestracja użytkownika w PostgreSQL:
 * - Przyjmuje: email, password, name, opcjonalnie nip i dane firmy
 * - Bezpieczne haszowanie hasła (bcrypt 12 rounds)
 * - Utworzenie użytkownika oraz profilu firmy w bazie Prisma (PostgreSQL / Supabase / Neon)
 * - Utworzenie trwałej sesji JWT (30 dni) i ustawienie bezpiecznego ciasteczka HttpOnly
 */
export async function POST(req: Request) {
  try {
    const rl = rateLimit(req, { windowMs: 15 * 60 * 1000, max: 10 });
    if (!rl.allowed) {
      return json(
        { error: "Zbyt wiele prób. Spróbuj ponownie za chwilę.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } }
      );
    }

    const body = await readJson(req);
    const email = normalizeEmail(str(body.email));
    const password = str(body.password);
    const rawName = str(body.name).trim();
    const nip = str(body.nip).replace(/[^0-9]/g, "").trim();
    const companyName = str(body.companyName).trim();
    const name = rawName || companyName || email.split("@")[0] || "Użytkownik";

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

    // Sprawdź czy e-mail jest już zajęty
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return json(
        { error: "Użytkownik o podanym adresie e-mail już istnieje.", code: "USER_EXISTS" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const companyBody = (body.company as Record<string, unknown>) || {};
    const hasExplicitCompany = Boolean(nip && (companyName || rawName));

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
  } catch (e) {
    return handleApiError(e);
  }
}
