import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/health — publiczny endpoint kondycji (bez auth).
 * Używany przez monitorowanie i testy integracyjne.
 */
export async function GET() {
  const startedAt = process.uptime();
  try {
    // Sprawdzenie dostępności bazy MongoDB
    await prisma.user.count();
    return Response.json(
      {
        ok: true,
        db: "ok",
        revision: process.env.APP_BUILD_REVISION || "unknown",
        uptimeSeconds: Math.round(startedAt),
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV ?? "development",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { ok: false, db: "error", revision: process.env.APP_BUILD_REVISION || "unknown", uptimeSeconds: Math.round(startedAt), timestamp: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
