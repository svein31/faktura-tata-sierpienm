import { getSessionUser } from "@/lib/auth";
import { requestEmailVerification } from "@/lib/email/verification";
import { handleApiError, json } from "@/lib/api";
import { rateLimitShared, rateLimitSubject } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nie jesteś zalogowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    const ip = await rateLimitShared(req, { max: 10, windowMs: 60 * 60_000 }, "resend-verification");
    const subject = await rateLimitSubject(user.id, { max: 6, windowMs: 24 * 60 * 60_000 }, "resend-verification-user");
    if (!ip.allowed || !subject.allowed) return json({ error: "Zbyt wiele prób wysyłki. Spróbuj ponownie później.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(subject.retryAfterSeconds ?? ip.retryAfterSeconds ?? 60) } });
    const result = await requestEmailVerification(user.id);
    const messages = {
      accepted: "Serwer pocztowy przyjął wiadomość z linkiem. Sprawdź skrzynkę i folder Spam.",
      unknown: "Nie udało się potwierdzić wysyłki. Sprawdź skrzynkę i folder Spam przed zamówieniem kolejnego linku.",
      failed: "Nie udało się wysłać linku. Spróbuj ponownie później.",
      "not-configured": "Wysyłka e-mail jest chwilowo niedostępna. Spróbuj ponownie później.",
      "already-verified": "Ten adres nie wymaga dodatkowego potwierdzenia.",
    };
    return json({ success: result.delivery === "accepted" || result.delivery === "already-verified", ...result, message: messages[result.delivery] }, { status: ["failed", "not-configured"].includes(result.delivery) ? 503 : 200 });
  } catch (error) { return handleApiError(error); }
}
