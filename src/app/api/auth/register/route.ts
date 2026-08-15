import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSession,
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

export const runtime = "nodejs";

/**
 * POST /api/auth/register
 * Rejestracja: e-mail unikalny (normalizacja), hasło min. 8 znaków (bcrypt 12 rounds).
 * Tworzy użytkownika + PUSTE ustawienia firmy/KSeF/preferencje — bez faktur,
 * kontrahentów i produktów. Brak enumeracji użytkowników (ogólny komunikat błędu).
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
    const name = str(body.name).trim();

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
    if (name.length < 2 || name.length > 100) {
      return json({ error: "Podaj nazwę użytkownika (2–100 znaków).", code: "INVALID_INPUT" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        company: { create: {} },
        ksef: { create: {} },
        preferences: { create: {} },
      },
    });

    const { token } = await createSession(user.id);
    const res = NextResponse.json({ user: toPublicUser(user) }, { status: 201, headers: { "Cache-Control": "no-store" } });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    return handleApiError(e);
  }
}
