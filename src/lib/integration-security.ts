import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { isIPv4 } from "node:net";
import { ApiError } from "./api";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function webhookUrl(value: unknown) {
  let url: URL;
  try { url = new URL(String(value)); } catch { throw new ApiError(400, "Nieprawidłowy URL webhooka."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443") || url.href.length > 2000) throw new ApiError(400, "Webhook wymaga HTTPS na porcie 443 bez loginu i hasła.");
  return url;
}
export function publicIpv4(ip: string) {
  if (!isIPv4(ip)) return false;
  const [a,b,c] = ip.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
function key() {
  const value = process.env.WEBHOOK_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new ApiError(503, "Skonfiguruj WEBHOOK_ENCRYPTION_KEY (64 znaki hex).");
  return Buffer.from(value, "hex");
}
export function sealWebhook(secret: string, companyId: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(companyId));
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString("base64");
}
export function openWebhook(value: string, companyId: string) {
  const data = Buffer.from(value, "base64"), decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0,12));
  decipher.setAAD(Buffer.from(companyId)); decipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString("utf8");
}
export const webhookSignature = (secret: string, timestamp: string, body: string) => createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
