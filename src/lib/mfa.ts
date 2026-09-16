import "server-only";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { decryptMfaSecret, matchingTotpStep, recoveryHash } from "@/lib/totp";

/** Attempts and single-use verification are persisted across workers and restarts. */
export async function consumeMfaCode(userId: string, code: string, pending = false) {
  const record = await prisma.userMfa.findUnique({ where: { userId } });
  const now = new Date();
  if (!record || (pending ? Boolean(record.enabledAt) || !record.setupExpiresAt || record.setupExpiresAt <= now : !record.enabledAt)) return null;
  if (record.failedAttempts >= 5) {
    if (record.lockedUntil && record.lockedUntil > now) throw new ApiError(429, "Zbyt wiele prób 2FA. Spróbuj ponownie za 15 minut.", "MFA_RATE_LIMITED");
    await prisma.userMfa.updateMany({ where: { id: record.id, failedAttempts: record.failedAttempts, lockedUntil: record.lockedUntil }, data: { failedAttempts: 0, lockedUntil: null } });
  }
  const identity = { id: record.id, encryptedSecret: record.encryptedSecret, enabledAt: record.enabledAt };
  const reserved = await prisma.userMfa.updateMany({ where: { ...identity, failedAttempts: { lt: 5 } },
    data: { failedAttempts: { increment: 1 }, lockedUntil: new Date(now.getTime() + 15 * 60_000) } });
  if (!reserved.count) throw new ApiError(429, "Limit prób 2FA. Spróbuj ponownie później.", "MFA_RATE_LIMITED");
  const step = matchingTotpStep(decryptMfaSecret(record.encryptedSecret, userId), code, now.getTime());
  if (step !== null) {
    const consumed = await prisma.userMfa.updateMany({ where: { ...identity, lastUsedStep: { lt: step } }, data: { lastUsedStep: step, failedAttempts: 0, lockedUntil: null } });
    return consumed.count ? { record, step } : null;
  }
  if (!pending && /^[a-f\d-]{32,40}$/i.test(code)) {
    const hash = recoveryHash(userId, code);
    if (record.recoveryHashes.includes(hash)) {
      const consumed = await prisma.userMfa.updateMany({ where: { ...identity, recoveryHashes: { equals: record.recoveryHashes } },
        data: { recoveryHashes: record.recoveryHashes.filter(value => value !== hash), failedAttempts: 0, lockedUntil: null } });
      return consumed.count ? { record, step: record.lastUsedStep } : null;
    }
  }
  return null;
}
