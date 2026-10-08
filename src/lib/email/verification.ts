import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getEmailConfigStatus, sendEmail } from "@/lib/email/sender";

export function isEmailVerifiedForSending(user: { emailVerificationRequiredAt?: Date | null; emailVerifiedAt?: Date | null }) {
  // Existing accounts are explicitly grandfathered; only new or changed addresses require proof.
  return !user.emailVerificationRequiredAt || Boolean(user.emailVerifiedAt);
}

export async function requireVerifiedEmailForSending(userId: string, db: PrismaClient = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerificationRequiredAt: true, emailVerifiedAt: true } });
  if (!user) throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
  if (!isEmailVerifiedForSending(user)) throw new ApiError(403, "Potwierdź swój adres e-mail w Ustawieniach konta przed wysyłką wiadomości do klientów.", "EMAIL_NOT_VERIFIED");
}

const unused = { OR: [{ usedAt: null }, { usedAt: { isSet: false } }] };
const invalid = () => new ApiError(400, "Link potwierdzający jest nieprawidłowy, wykorzystany lub wygasł. Poproś o nowy link w Ustawieniach konta.", "INVALID_VERIFICATION_TOKEN");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

export type VerificationDelivery = "accepted" | "unknown" | "failed" | "not-configured" | "already-verified";

async function transactionRetry<T>(db: PrismaClient, callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(callback); }
    catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 5) throw error;
      await new Promise(resolve => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
}

/** Persist a hashed one-use link before exactly one provider attempt. Previous working links survive delivery failure. */
export async function requestEmailVerification(
  userId: string,
  options: { targetEmail?: string; db?: PrismaClient; deliver?: typeof sendEmail; now?: Date } = {}
): Promise<{ delivery: VerificationDelivery }> {
  const db = options.db ?? prisma, now = options.now ?? new Date();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const token = await transactionRetry<{ id: string; email: string; purpose: string } | null>(db, async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    if (!options.targetEmail && isEmailVerifiedForSending(user)) return null;
    if (user.emailVerificationSentAt && now.getTime() - user.emailVerificationSentAt.getTime() < 60_000)
      throw new ApiError(429, "Poczekaj minutę przed zamówieniem kolejnego linku.", "VERIFICATION_COOLDOWN");
    await tx.user.update({ where: { id: userId }, data: { emailVerificationSentAt: now, emailSafetyVersion: (user.emailSafetyVersion ?? 0) + 1 } });
    await tx.emailVerificationToken.deleteMany({ where: { userId, expiresAt: { lt: now } } });
    return tx.emailVerificationToken.create({ data: {
      userId, tokenHash, email: options.targetEmail ?? user.email, sourceEmail: user.email,
      purpose: options.targetEmail ? "change-email" : "verify-current", expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    } });
  });
  if (!token) return { delivery: "already-verified" };
  if (!getEmailConfigStatus().configured && !options.deliver) return { delivery: "not-configured" };
  let baseUrl = "https://fakturaprosto.pl";
  if (process.env.NEXTAUTH_URL) {
    const candidate = new URL(process.env.NEXTAUTH_URL);
    if (candidate.protocol === "https:" || (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(candidate.hostname))) baseUrl = candidate.origin;
  }
  // A fragment never reaches HTTP access logs or Referer headers. The page requires an explicit confirmation.
  const link = `${baseUrl}/verify-email#token=${rawToken}`;
  const change = token.purpose === "change-email";
  try {
    const result = await (options.deliver ?? sendEmail)({
      to: token.email, subject: change ? "Potwierdź zmianę adresu e-mail — FakturaProsto" : "Potwierdź adres e-mail — FakturaProsto",
      text: `Potwierdź ${change ? "zmianę adresu" : "swój adres"} e-mail: ${link}\nLink jest jednorazowy i ważny przez 24 godziny. Jeśli nie zamawiałeś tej wiadomości, zignoruj ją.`,
      html: `<p>Potwierdź ${change ? "zmianę adresu" : "swój adres"} e-mail: ${escapeHtml(token.email)}.</p><p><a href="${escapeHtml(link)}">Potwierdź adres</a></p><p>Link jest jednorazowy i ważny przez 24 godziny. Jeśli nie zamawiałeś tej wiadomości, zignoruj ją.</p>`,
      singleAttempt: true, idempotencyKey: `verify-email-${token.id}`, signal: AbortSignal.timeout(15_000),
    });
    return { delivery: result.success ? "accepted" : "failed" };
  } catch (error) {
    return { delivery: (error as { deliveryUncertain?: boolean }).deliveryUncertain === false ? "failed" : "unknown" };
  }
}

/** Claim token and apply proof in one transaction; changing the login address additionally revokes all sessions. */
export async function confirmEmailVerification(rawToken: string, db: PrismaClient = prisma) {
  if (!/^[a-f0-9]{64}$/.test(rawToken)) throw invalid();
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  return transactionRetry<{ emailChanged: boolean }>(db, async tx => {
    const now = new Date();
    const token = await tx.emailVerificationToken.findFirst({ where: { tokenHash, ...unused, expiresAt: { gt: now } } });
    if (!token) throw invalid();
    const user = await tx.user.findUnique({ where: { id: token.userId } });
    if (!user || user.email !== token.sourceEmail) throw invalid();
    const claimed = await tx.emailVerificationToken.updateMany({ where: { id: token.id, ...unused, expiresAt: { gt: new Date() } }, data: { usedAt: now } });
    if (claimed.count !== 1) throw invalid();
    const emailChanged = token.purpose === "change-email";
    try {
      await tx.user.update({ where: { id: user.id }, data: {
        ...(emailChanged ? { email: token.email, emailVerificationRequiredAt: now } : {}),
        emailVerifiedAt: now, emailSafetyVersion: (user.emailSafetyVersion ?? 0) + 1,
      } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ApiError(409, "Nie można potwierdzić tego adresu. Wybierz inny adres w Ustawieniach konta.", "EMAIL_CHANGE_UNAVAILABLE");
      throw error;
    }
    await tx.emailVerificationToken.updateMany({ where: { userId: user.id, ...unused }, data: { usedAt: now } });
    if (emailChanged) await tx.session.deleteMany({ where: { userId: user.id } });
    return { emailChanged };
  });
}
