/**
 * Prosty, wbudowany rate limiter dla endpointów auth (per IP, per sekunda).
 * Pamięć procesu — wystarczający dla pojedynczego procesu Node (cyber_Folks).
 * W scenariuszu wielu instancji należy użyć zewnętrznego store (Redis).
 */

interface Bucket {
  hits: number[];
  blockedUntil: number;
}

const BUCKETS = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// Okresowe sprzątanie nieaktywnych kubełków.
const timer = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of BUCKETS) {
    b.hits = b.hits.filter((t) => now - t < 15 * 60 * 1000);
    if (b.hits.length === 0 && b.blockedUntil < now) BUCKETS.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
if (typeof timer.unref === "function") timer.unref();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * np. rateLimitAuth(req, { windowMs: 15*60*1000, max: 10 })
 * Po przekroczeniu limitu zwraca blokadę na windowMs.
 */
export function rateLimit(req: Request, opts: { windowMs?: number; max?: number } = {}): RateLimitResult {
  const windowMs = opts.windowMs ?? 15 * 60 * 1000;
  const max = opts.max ?? 10;
  const now = Date.now();
  const key = clientIp(req);

  let bucket = BUCKETS.get(key);
  if (!bucket) {
    bucket = { hits: [], blockedUntil: 0 };
    BUCKETS.set(key, bucket);
  }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= max) {
    bucket.blockedUntil = now + windowMs;
    return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  bucket.hits.push(now);
  return { allowed: true };
}


/**
 * Shared rate limit for public authentication endpoints.
 * MongoDB's atomic increment counts attempts across all serverless instances.
 * Fixed windows trade a small boundary burst for predictable and bounded storage.
 */
import { createHmac } from "node:crypto";
import { MongoClient } from "mongodb";

const shared = globalThis as unknown as { authRateLimitClient?: Promise<MongoClient> };

function getRateLimitClient(): Promise<MongoClient> {
  if (!process.env.DATABASE_URL?.startsWith("mongodb")) throw new Error("DATABASE_URL is required for auth rate limiting.");
  if (!shared.authRateLimitClient) {
    shared.authRateLimitClient = new MongoClient(process.env.DATABASE_URL, { maxPoolSize: 3 })
      .connect()
      .catch(error => { shared.authRateLimitClient = undefined; throw error; });
  }
  return shared.authRateLimitClient;
}

export async function rateLimitShared(
  req: Request,
  opts: { windowMs: number; max: number },
  scope: "login" | "register" | "forgot-password"
): Promise<RateLimitResult> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("NEXTAUTH_SECRET must be configured for auth rate limiting.");
  const now = Date.now();
  const bucketStart = Math.floor(now / opts.windowMs) * opts.windowMs;
  // On the production proxy the final forwarded address is the last trusted hop.
  // Use the platform client address when provided and never store an IP in plaintext.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  const ip = req.headers.get("x-nf-client-connection-ip")?.trim() || forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
  const key = createHmac("sha256", secret).update(`${scope}:\0${ip}:\0${bucketStart}`).digest("hex");
  const client = await getRateLimitClient();
  const bucket = await client.db().collection<{ _id: string; hits: number; expiresAt: Date }>("AuthRateLimit")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { hits: 1 }, $setOnInsert: { expiresAt: new Date(bucketStart + 2 * opts.windowMs) } },
      { upsert: true, returnDocument: "after" }
    );
  if (!bucket) throw new Error("Auth rate limit counter could not be recorded.");
  return {
    allowed: bucket.hits <= opts.max,
    ...(bucket.hits > opts.max ? { retryAfterSeconds: Math.max(1, Math.ceil((bucketStart + opts.windowMs - now) / 1000)) } : {}),
  };
}
