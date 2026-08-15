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
