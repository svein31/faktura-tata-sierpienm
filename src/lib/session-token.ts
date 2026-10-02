import { createHash } from "node:crypto";
/** Never accept a database digest as a bearer credential. */
export function sessionTokenHash(token: string) {
  return "sha256:" + createHash("sha256").update(token).digest("hex");
}
export function isSessionBearer(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
