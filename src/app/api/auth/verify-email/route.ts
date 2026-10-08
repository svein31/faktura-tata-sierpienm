import { confirmEmailVerification } from "@/lib/email/verification";
import { handleApiError, json, readJson, str } from "@/lib/api";
import { rateLimitShared } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const limit = await rateLimitShared(req, { max: 20, windowMs: 15 * 60_000 }, "verify-email");
    if (!limit.allowed) return json({ error: "Zbyt wiele prób. Spróbuj ponownie za chwilę.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const result = await confirmEmailVerification(str((await readJson(req)).token));
    return json({ success: true, ...result, message: result.emailChanged ? "Adres został potwierdzony i zmieniony. Zaloguj się nowym adresem." : "Adres e-mail został potwierdzony. Możesz wysyłać faktury do klientów." });
  } catch (error) { return handleApiError(error); }
}
