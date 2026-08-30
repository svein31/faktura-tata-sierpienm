import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ksef/auth
 *
 * Uwierzytelnianie w KSeF API v2.0 (Produkcja / Test):
 * 1. Pobranie AuthorisationChallenge z serwerów MF
 * 2. Szyfrowanie tokena KSeF algorytmem RSA-OAEP (SHA-256) z oficjalnym kluczem publicznym MF
 * 3. Inicjalizacja sesji w KSeF i odebranie SessionToken (JWT)
 * 4. Utrwalenie sesji w bazie Prisma (KsefSession)
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const body = await readJson(req);

    // 1. Ustalenie NIP podmiotu
    let nip = str(body.nip).replace(/[^0-9]/g, "").trim();
    if (!nip && user) {
      const company = await prisma.companySettings.findUnique({ where: { userId: user.id } });
      if (company?.nip) nip = company.nip.replace(/[^0-9]/g, "").trim();
    }
    if (!nip) {
      nip = (process.env.KSEF_NIP || "").replace(/[^0-9]/g, "").trim();
    }
    if (!nip || nip.length !== 10) {
      throw new ApiError(400, "Wymagany jest poprawny 10-cyfrowy NIP podmiotu.");
    }

    // 2. Ustalenie tokena KSeF
    let token = str(body.token).trim();
    if (!token) {
      token = (process.env.KSEF_TOKEN || "").trim();
    }
    if (!token && (process.env.KSEF_ENV || "test") !== "demo") {
      throw new ApiError(400, "Brak tokena autoryzacyjnego KSeF (przekaż w body lub ustaw KSEF_TOKEN na serwerze).");
    }

    // 3. Ustalenie środowiska (production / test / demo)
    const envInput = str(body.environment).toLowerCase() || process.env.KSEF_ENV || process.env.KSEF_ENVIRONMENT || "test";
    const environment: KsefEnvironment = envInput === "production" ? "production" : envInput === "demo" ? "demo" : "test";

    // 4. Wywołanie procesu logowania KSeF (Challenge -> RSA-OAEP -> InitSessionToken -> JWT)
    const client = new KsefClient({ environment });
    const authResult = await client.loginWithKsefToken(nip, token || "demo-token-12345");

    // 5. Zapisanie lub aktualizacja sesji w bazie Prisma
    const validUntilDate = authResult.validUntil ? new Date(authResult.validUntil) : new Date(Date.now() + 2 * 3600 * 1000);

    const ksefSession = await prisma.ksefSession.upsert({
      where: { referenceNumber: authResult.referenceNumber },
      update: {
        accessToken: authResult.accessToken,
        authenticationToken: authResult.authenticationToken,
        validUntil: validUntilDate,
        status: "ACTIVE",
        nip,
        environment,
        userId: user?.id ?? null,
      },
      create: {
        referenceNumber: authResult.referenceNumber,
        accessToken: authResult.accessToken,
        authenticationToken: authResult.authenticationToken,
        validUntil: validUntilDate,
        status: "ACTIVE",
        nip,
        environment,
        userId: user?.id ?? null,
      },
    });

    return json({
      success: true,
      message: `Pomyślnie uwierzytelniono w KSeF API 2.0 (${environment}).`,
      session: {
        id: ksefSession.id,
        nip: ksefSession.nip,
        environment: ksefSession.environment,
        referenceNumber: ksefSession.referenceNumber,
        validUntil: ksefSession.validUntil?.toISOString(),
        status: ksefSession.status,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * GET /api/ksef/auth — pobranie statusu aktywnej sesji
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const session = await prisma.ksefSession.findFirst({
      where: {
        ...(user ? { userId: user.id } : {}),
        status: "ACTIVE",
        validUntil: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return json({
        authenticated: false,
        message: "Brak aktywnej sesji KSeF.",
      });
    }

    return json({
      authenticated: true,
      session: {
        id: session.id,
        nip: session.nip,
        environment: session.environment,
        referenceNumber: session.referenceNumber,
        validUntil: session.validUntil?.toISOString(),
        status: session.status,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
