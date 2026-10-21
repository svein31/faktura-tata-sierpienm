import { NextResponse } from "next/server";
import { isUnsafeCrossOrigin } from "@/lib/csrf";
import { rateLimitShared } from "@/lib/rate-limit";
import { cookieValue, hasPilotConsent, issuePilotCookie, persistPilotEvent, PILOT_COOKIE, PILOT_RETENTION_MS, pilotConfigured, pilotIdentity, withdrawPilotMetrics } from "@/lib/pilot-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(status = 204) { return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } }); }
function setCookie(res: NextResponse, req: Request, value: string, maxAge: number) {
  res.cookies.set(PILOT_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production" || new URL(req.url).protocol === "https:", sameSite: "lax", path: "/", maxAge });
}

export async function POST(req: Request) {
  if (isUnsafeCrossOrigin(req)) return response(403);
  if (!pilotConfigured() || !hasPilotConsent(req)) return response();
  // Fixed enum and bounded body: no URLs, attributes, financial data or caller-supplied outcomes.
  if (Number(req.headers.get("content-length") || "0") > 64) return response(413);
  const reader = req.body?.getReader();
  let size = 0, raw = "";
  if (!reader) return response(400);
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength; if (size > 64) { await reader.cancel(); return response(413); }
    raw += new TextDecoder().decode(next.value);
  }
  try {
    const body = JSON.parse(raw);
    if (!body || Object.keys(body).length !== 1 || !["visit", "creator_open"].includes(body.event)) return response(400);
    const limit = await rateLimitShared(req, { windowMs: 60000, max: 30 }, "pilot-visit");
    if (!limit.allowed) return response(429);
    const secret = process.env.PILOT_METRICS_SECRET!;
    const existing = cookieValue(req, PILOT_COOKIE);
    const identity = pilotIdentity(existing, secret);
    const value = identity ? existing! : issuePilotCookie(secret);
    await persistPilotEvent(value, "visit");
    if (body.event === "creator_open") await persistPilotEvent(value, "creator_open");
    const res = response();
    if (!identity) setCookie(res, req, value, PILOT_RETENTION_MS / 1000);
    return res;
  } catch { return response(503); }
}

export async function DELETE(req: Request) {
  if (isUnsafeCrossOrigin(req)) return response(403);
  try {
    await withdrawPilotMetrics(req);
    const res = response(); setCookie(res, req, "", 0); return res;
  } catch { return response(503); } // Preserve the cookie so withdrawal can be retried after an outage.
}
