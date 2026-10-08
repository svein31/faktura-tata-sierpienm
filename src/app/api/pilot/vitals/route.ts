import { isUnsafeCrossOrigin } from "@/lib/csrf";
import { rateLimitShared } from "@/lib/rate-limit";
import { hasPilotConsent, normalisePilotVital, pilotConfigured, recordPilotVital } from "@/lib/pilot-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const response = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  if (isUnsafeCrossOrigin(req)) return response(403);
  if (!pilotConfigured() || !hasPilotConsent(req)) return response();
  if (Number(req.headers.get("content-length") || "0") > 256) return response(413);
  const reader = req.body?.getReader(); if (!reader) return response(400);
  let size = 0, raw = "";
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength; if (size > 256) { await reader.cancel(); return response(413); }
    raw += new TextDecoder().decode(next.value);
  }
  let vital;
  try { vital = normalisePilotVital(JSON.parse(raw)); } catch { return response(400); }
  if (!vital) return response(400);
  try {
    const limit = await rateLimitShared(req, { windowMs: 60000, max: 60 }, "pilot-vitals");
    if (!limit.allowed) return response(429);
    recordPilotVital(req, vital); return response();
  } catch { return response(503); }
}
