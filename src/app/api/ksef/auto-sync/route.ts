import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { POST as syncIncomingPOST } from "../sync-incoming/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/ksef/auto-sync
 *
 * Sprawdza czy minął skonfigurowany czas (1h, 2h, 10h, 24h) dla zalogowanego użytkownika
 * i jeśli tak — automatycznie uruchamia synchronizację zakupów z KSeF oraz powiadamia mailem.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const settings = await prisma.ksefSettings.findUnique({
      where: { userId: user.id },
    });

    if (!settings || !settings.autoSyncEnabled) {
      return json({
        enabled: false,
        message: "Automatyczna synchronizacja KSeF jest wyłączona.",
      });
    }

    const intervalHours = settings.autoSyncIntervalHours || 1;
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const now = Date.now();
    const lastSyncTime = settings.lastAutoSyncAt ? settings.lastAutoSyncAt.getTime() : 0;
    const timeSinceLastSync = now - lastSyncTime;

    if (lastSyncTime > 0 && timeSinceLastSync < intervalMs - 30_000) {
      const nextSyncInMs = intervalMs - timeSinceLastSync;
      return json({
        enabled: true,
        skipped: true,
        intervalHours,
        lastAutoSyncAt: settings.lastAutoSyncAt,
        nextSyncInMinutes: Math.round(nextSyncInMs / 60000),
        message: `Kolejna automatyczna synchronizacja za ok. ${Math.round(nextSyncInMs / 60000)} min.`,
      });
    }

    // Czas minął — wywołujemy synchronizację
    const syncRes = await syncIncomingPOST();
    const syncData = await syncRes.json();

    return json({
      enabled: true,
      executed: true,
      intervalHours,
      lastAutoSyncAt: new Date(),
      result: syncData,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/ksef/auto-sync
 *
 * Aktualizuje ustawienia automatycznego pobierania faktur zakupowych:
 * body: { autoSyncEnabled: boolean, autoSyncIntervalHours: number, autoSyncNotifyEmail?: string }
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await readJson(req);
    const enabled = Boolean(body.autoSyncEnabled);
    const hours = [1, 2, 10, 24].includes(Number(body.autoSyncIntervalHours))
      ? Number(body.autoSyncIntervalHours)
      : 1;
    const notifyEmail =
      typeof body.autoSyncNotifyEmail === "string"
        ? body.autoSyncNotifyEmail.trim()
        : user.email;

    const settings = await prisma.ksefSettings.upsert({
      where: { userId: user.id },
      update: {
        autoSyncEnabled: enabled,
        autoSyncIntervalHours: hours,
        autoSyncNotifyEmail: notifyEmail,
      },
      create: {
        userId: user.id,
        environment: "demo",
        autoSyncEnabled: enabled,
        autoSyncIntervalHours: hours,
        autoSyncNotifyEmail: notifyEmail,
      },
    });

    return json({
      success: true,
      settings: {
        autoSyncEnabled: settings.autoSyncEnabled,
        autoSyncIntervalHours: settings.autoSyncIntervalHours,
        autoSyncNotifyEmail: settings.autoSyncNotifyEmail,
        lastAutoSyncAt: settings.lastAutoSyncAt,
      },
      message: enabled
        ? `Włączono automatyczne pobieranie co ${hours}h. Powiadomienia będą wysyłane na adres ${notifyEmail}.`
        : "Wyłączono automatyczne pobieranie faktur z KSeF.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}
