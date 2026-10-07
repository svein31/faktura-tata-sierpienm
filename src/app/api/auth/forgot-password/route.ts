import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { handleApiError, json, readJson, str } from "@/lib/api";
import { rateLimitShared } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/sender";
import { UNUSED_PASSWORD_RESET_TOKEN } from "@/lib/password-reset";

export const runtime = "nodejs";

/**
 * POST /api/auth/forgot-password
 *
 * Bezpieczne żądanie resetu hasła z jednorazowym tokenem.
 * Nigdy nie ujawnia, czy konto o danym adresie e-mail istnieje w bazie.
 */
export async function POST(req: Request) {
  try {
    // Ograniczenie liczby prób: max 5 zapytań na 15 minut z jednego IP
    const { allowed, retryAfterSeconds } = await rateLimitShared(req, { windowMs: 15 * 60 * 1000, max: 5 }, "forgot-password");
    if (!allowed) {
      return json(
        {
          error: `Zbyt wiele prób resetu hasła. Spróbuj ponownie za ${retryAfterSeconds ?? 60} sekund.`,
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    const body = await readJson(req);
    const email = str(body.email).trim().toLowerCase();

    // Zawsze zwracamy ten sam neutralny komunikat dla użytkownika
    const neutralResponse = {
      ok: true,
      message:
        "Jeśli konto z podanym adresem e-mail istnieje w systemie, wysłaliśmy instrukcję resetowania hasła.",
    };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return json(neutralResponse);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return json(neutralResponse);
    }

    // Unieważnij poprzednie niewykorzystane tokeny tego użytkownika
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, ...UNUSED_PASSWORD_RESET_TOKEN },
      data: { usedAt: new Date() },
    });

    // Wygeneruj bezpieczny losowy token 32 bajty (64 znaki hex)
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 godzina ważności

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Konstrukcja linku
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const resetLink = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    // Próba wysyłki wiadomości e-mail
    try {
      if (process.env.RESEND_API_KEY || process.env.SMTP_HOST) {
        await sendEmail({
          to: user.email,
          subject: "Reset hasła w aplikacji FakturaProsto",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
              <h2 style="color: #0f172a; margin-bottom: 16px;">Odzyskiwanie hasła do FakturaProsto</h2>
              <p>Otrzymaliśmy prośbę o zresetowanie hasła dla konta <strong>${user.email}</strong>.</p>
              <p>Kliknij poniższy przycisk, aby ustawić nowe hasło. Link jest ważny przez 60 minut i może być użyty tylko raz:</p>
              <div style="margin: 28px 0; text-align: center;">
                <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                  Ustaw nowe hasło
                </a>
              </div>
              <p style="font-size: 13px; color: #64748b;">Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość. Twoje dotychczasowe hasło pozostaje bezpieczne.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 11px; color: #94a3b8;">FakturaProsto — Faktury VAT & KSeF 2.0</p>
            </div>
          `,
        });
      } else {
        // Never write account recovery tokens to logs, including on a misconfigured host.
        console.warn("[ForgotPassword] Brak dostawcy poczty; nie wysłano wiadomości resetującej.");
      }
    } catch (mailErr) {
      // A transport exception can contain credentials or the full message body.
      console.error("[ForgotPassword] Nie udało się wysłać wiadomości resetującej.", mailErr instanceof Error ? mailErr.name : "unknown");
    }

    return json(neutralResponse);
  } catch (e) {
    return handleApiError(e);
  }
}
