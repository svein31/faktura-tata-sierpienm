import "server-only";
import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api";
export function requireCron(req: Request) {
  const secret = process.env.CRON_SECRET, supplied = req.headers.get("authorization") || "";
  if (!secret) throw new ApiError(503, "Harmonogram wymaga konfiguracji CRON_SECRET.");
  const expected = `Bearer ${secret}`;
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new ApiError(401, "Nieautoryzowany.");
}
