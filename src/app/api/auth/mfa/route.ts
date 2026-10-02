import { prisma } from "@/lib/db";
import { getSession, verifyPassword } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { consumeMfaCode } from "@/lib/mfa";
import { generateTotpSecret, encryptMfaSecret, decryptMfaSecret, generateRecoveryCodes, recoveryHash } from "@/lib/totp";
import { recordAuditLog } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import QRCode from "qrcode";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function setupResponse(secret: string, email: string, expiresInSeconds: number) {
  const uri = `otpauth://totp/${encodeURIComponent(`FakturaProsto:${email}`)}?secret=${secret}&issuer=FakturaProsto&algorithm=SHA1&digits=6&period=30`;
  return { secret, qrDataUrl: await QRCode.toDataURL(uri), expiresInSeconds };
}
export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new ApiError(401, "Nieautoryzowany.");
    const mfa = await prisma.userMfa.findUnique({ where: { userId: session.user.id } });
    return json({ enabled: Boolean(mfa?.enabledAt), recoveryRemaining: mfa?.recoveryHashes.length || 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return handleApiError(e); }
}
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new ApiError(401, "Nieautoryzowany.");
    if (!rateLimit(req, { max: 30, windowMs: 15 * 60_000 }).allowed) throw new ApiError(429, "Zbyt wiele prób. Spróbuj później.");
    const body = await readJson(req), action = str(body.action), password = str(body.password), code = str(body.code).trim();
    const { user, sessionId } = session;
    if (password.length > 128 || !await verifyPassword(password, user.password)) throw new ApiError(401, "Nieprawidłowe hasło.");
    if (action === "setup") {
      const existing = await prisma.userMfa.findUnique({ where: { userId: user.id } });
      if (existing?.enabledAt) throw new ApiError(409, "2FA jest już włączone.");
      // Reopening setup must keep the same secret while it is still valid.
      // Otherwise a previously scanned QR code would silently stop matching.
      if (existing && existing.failedAttempts >= 5 && existing.lockedUntil && existing.lockedUntil > new Date()) throw new ApiError(429, "Limit prób 2FA. Spróbuj później.");
      if (existing?.setupExpiresAt && existing.setupExpiresAt > new Date()) {
        try {
          const secret = decryptMfaSecret(existing.encryptedSecret, user.id);
          return json(await setupResponse(secret, user.email, Math.ceil((existing.setupExpiresAt.getTime() - Date.now()) / 1000)));
        } catch {
          // An unreadable, unconfirmed setup may be replaced after password verification.
        }
      }
      const secret = generateTotpSecret(), encryptedSecret = encryptMfaSecret(secret, user.id);
      const data = { encryptedSecret, enabledAt: null, setupExpiresAt: new Date(Date.now() + 10 * 60_000), lastUsedStep: -1, recoveryHashes: [], failedAttempts: 0, lockedUntil: null };
      if (existing) {
        // Do not let repeated setup requests bypass the persisted attempt limit.
        if (existing.failedAttempts >= 5 && existing.lockedUntil && existing.lockedUntil > new Date()) throw new ApiError(429, "Limit prób 2FA. Spróbuj później.");
        const updated = await prisma.userMfa.updateMany({ where: { id: existing.id, enabledAt: null }, data });
        if (!updated.count) throw new ApiError(409, "Konfiguracja 2FA została zmieniona. Odśwież stronę.");
      } else await prisma.userMfa.create({ data: { userId: user.id, ...data } });
      return json(await setupResponse(secret, user.email, 600));
    }
    if (!["enable", "disable", "recovery"].includes(action)) throw new ApiError(400, "Nieprawidłowa operacja 2FA.");
    const proof = code.length <= 128 ? await consumeMfaCode(user.id, code, action === "enable") : null;
    if (!proof) throw new ApiError(401, "Nieprawidłowy, wygasły lub już użyty kod 2FA.");
    const recoveryCodes = action === "disable" ? [] : generateRecoveryCodes();
    const now = new Date();
    await prisma.$transaction(async tx => {
      const updated = await tx.userMfa.updateMany({ where: { id: proof.record.id, encryptedSecret: proof.record.encryptedSecret, enabledAt: proof.record.enabledAt }, data: action === "disable"
        ? { enabledAt: null, encryptedSecret: "disabled", recoveryHashes: [], setupExpiresAt: null }
        : { enabledAt: proof.record.enabledAt || now, recoveryHashes: recoveryCodes.map(value => recoveryHash(user.id, value)), setupExpiresAt: null } });
      if (action === "disable") {
        const companies = await tx.companyProfile.findMany({ where: { OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }] }, select: { id: true } });
        if (await tx.companySecurityPolicy.count({ where: { id: { in: companies.map(c => c.id) }, requireMfa: true } })) throw new ApiError(409, "Firma wymaga 2FA. Najpierw zmień politykę firmy lub zakończ członkostwo.");
      }
      if (!updated.count) throw new ApiError(409, "Konfiguracja 2FA została zmieniona. Odśwież stronę.");
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: sessionId } } });
      await tx.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: proof.record.enabledAt || now } });
      await recordAuditLog({ client: tx, userId: user.id, userName: user.name, userEmail: user.email, action: `mfa_${action}`, entityType: "user", entityId: user.id });
    });
    return json({ enabled: action !== "disable", recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return handleApiError(e); }
}
