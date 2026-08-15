import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/health — publiczny endpoint kondycji (bez auth).
 * Używany przez monitorowanie cyber_Folks oraz testy integracyjne.
 */
export async function GET() {
  const startedAt = process.uptime();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      {
        ok: true,
        db: "ok",
        uptimeSeconds: Math.round(startedAt),
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV ?? "development",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { ok: false, db: "error", uptimeSeconds: Math.round(startedAt), timestamp: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
