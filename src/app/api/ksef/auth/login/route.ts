import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ksef/auth/login
 *
 * Uwierzytelnianie w KSeF API v2.0 przy użyciu Tokena KSeF.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const body = await readJson(req);

    // 1. Ustalenie NIP podmiotu
    let nip = str(body.nip).replace(/\D/g, "").trim();
    if (!nip && user) {
      const comp = await prisma.companyProfile.findFirst({
        where: { userId: user.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
      if (comp?.nip) nip = comp.nip.replace(/\D/g, "").trim();

      if (!nip) {
        const company = await prisma.companySettings.findUnique({ where: { userId: user.id } });
        if (company?.nip) nip = company.nip.replace(/\D/g, "").trim();
      }
    }
    if (!nip) {
      nip = (process.env.KSEF_NIP || "").replace(/\D/g, "").trim();
    }
    if (!nip || nip.length !== 10) {
      throw new ApiError(400, "Wymagany jest poprawny 10-cyfrowy NIP podmiotu.");
    }

    // 2. Ustalenie środowiska
    const envInput = str(body.environment).toLowerCase() || process.env.KSEF_ENV || process.env.KSEF_ENVIRONMENT || "test";
    const environment: KsefEnvironment = envInput === "production" ? "production" : envInput === "demo" ? "demo" : "test";

    // 3. Ustalenie tokena KSeF
    let token = str(body.token).trim();
    if (!token && user) {
      const comp = await prisma.companyProfile.findFirst({
        where: { userId: user.id, nip },
      });
      if (comp?.ksefToken) token = comp.ksefToken.trim();
    }
    if (!token) {
      token = (process.env.KSEF_TOKEN || "").trim();
    }
    if (!token && environment !== "demo") {
      throw new ApiError(400, "Brak tokena autoryzacyjnego KSeF (podaj token w formularzu lub ustaw KSEF_TOKEN).");
    }

    // 4. Wywołanie procesu logowania KSeF 2.0
    const client = new KsefClient({ environment });
    const authResult = await client.loginWithKsefToken(nip, token || "demo-token-12345");

    // 5. Zapisanie lub aktualizacja sesji w bazie Prisma
    const validUntilDate = authResult.validUntil ? new Date(authResult.validUntil) : new Date(Date.now() + 8 * 3600 * 1000);

    const ksefSession = await prisma.ksefSession.upsert({
      where: { referenceNumber: authResult.referenceNumber },
      update: {
        accessToken: authResult.accessToken,
        authenticationToken: authResult.authenticationToken,
        refreshToken: authResult.refreshToken,
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
        refreshToken: authResult.refreshToken,
        validUntil: validUntilDate,
        status: "ACTIVE",
        nip,
        environment,
        userId: user?.id ?? null,
      },
    });

    // Zaktualizuj token w profilu firmy jeśli podano
    if (token && user && environment !== "demo") {
      const existingComp = await prisma.companyProfile.findFirst({
        where: { userId: user.id, nip },
      });
      if (existingComp) {
        await prisma.companyProfile.update({
          where: { id: existingComp.id },
          data: { ksefToken: token },
        });
      }
    }

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
