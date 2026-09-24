import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(bytes: Buffer): string {
  let bits = 0, value = 0, result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decodeBase32(secret: string): Buffer {
  if (!/^[A-Z2-7]+$/.test(secret)) throw new Error("Invalid TOTP secret");
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}
/** RFC 6238 / SHA-1, 30 seconds. Eight digits are supported for RFC test vectors. */
export function totpAt(secret: string, milliseconds: number, digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(milliseconds / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, "0");
}
export function matchingTotpStep(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (const step of [current, current - 1, current + 1]) {
    if (step >= 0 && timingSafeEqual(Buffer.from(code), Buffer.from(totpAt(secret, step * 30_000)))) return step;
  }
  return null;
}
function encryptionKeys(): Buffer[] {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (configured && !/^[a-f\d]{64}$/i.test(configured)) throw new Error("Nieprawidłowy MFA_ENCRYPTION_KEY (32 bajty, hex).");
  // Use an existing stable server secret when the dedicated key has not been set.
  // Keep the fallback for decrypting pending records after a dedicated key is added.
  const fallback = process.env.NEXTAUTH_SECRET || process.env.DATABASE_URL;
  const derived = fallback ? createHash("sha256").update("fakturaprosto:mfa:v1:").update(fallback).digest() : null;
  const keys: Buffer[] = [];
  if (configured) keys.push(Buffer.from(configured, "hex"));
  if (derived) keys.push(derived);
  if (!keys.length) throw new Error("2FA wymaga skonfigurowanego MFA_ENCRYPTION_KEY lub stałego sekretu serwera.");
  return keys;
}
export function encryptMfaSecret(secret: string, userId: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKeys()[0], iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptMfaSecret(value: string, userId: string): string {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted MFA secret");
  for (const key of encryptionKeys()) {
    try {
      const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      cipher.setAAD(Buffer.from(userId)); cipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([cipher.update(Buffer.from(encrypted, "base64url")), cipher.final()]).toString("utf8");
    } catch { /* Try a configured key and the stable legacy fallback. */ }
  }
  throw new Error("Invalid encrypted MFA secret");
}
export const generateTotpSecret = () => encodeBase32(randomBytes(20));
export const generateRecoveryCodes = () => Array.from({ length: 8 }, () => randomBytes(16).toString("hex").match(/.{8}/g)!.join("-"));
export const recoveryHash = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code.trim().replace(/-/g, "").toLowerCase()}`).digest("hex");
