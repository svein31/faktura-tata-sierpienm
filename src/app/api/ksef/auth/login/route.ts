import { companyAccess } from "@/lib/company-write";
import { requireRecentAuth } from "@/lib/security-policy";
import { isValidNipFormat } from "@/lib/validation";
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
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req);

    // Only an authorized company can authenticate; operator environment tokens are never exposed by this API.
    const requestedNip = str(body.nip).replace(/\D/g, "");
    const selected = body.companyId
      ? (await companyAccess(prisma, user.id, body.companyId, "canManageIntegrations")).company
      : await prisma.companyProfile.findFirst({ where: { userId: user.id, ...(requestedNip ? { nip: requestedNip } : {}) }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
    if (!selected) throw new ApiError(403, "Brak uprawnienia do firmy KSeF.");
    await companyAccess(prisma, user.id, selected.id, "canManageIntegrations");
    const profile = await prisma.companyProfile.findUniqueOrThrow({ where: { id: selected.id } });
    const nip = profile.nip.replace(/\D/g, "");
    if (!isValidNipFormat(nip) || requestedNip && requestedNip !== nip) throw new ApiError(400, "NIP musi odpowiadać wybranej firmie.");
    // 2. Ustalenie środowiska
    const envInput = str(body.environment).toLowerCase() || process.env.KSEF_ENV || process.env.KSEF_ENVIRONMENT || "test";
    const environment: KsefEnvironment = envInput === "production" ? "production" : envInput === "demo" ? "demo" : "test";

    let token = str(body.token).trim() || profile.ksefToken?.trim() || "";
    if (token.length > 10000) throw new ApiError(400, "Token jest za długi.");
    if (str(body.token).trim() || environment !== "demo") await requireRecentAuth(user.id);
    if (!token && environment !== "demo") throw new ApiError(400, "Dodaj token KSeF wybranej firmy w ustawieniach integracji.");
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
        userId: profile.userId,
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
        userId: profile.userId,
      },
    });

    if (str(body.token).trim() && environment !== "demo") {
      await prisma.$transaction(async tx => {
        await companyAccess(tx, user.id, profile.id, "canManageIntegrations");
        await tx.companyProfile.update({ where: { id: profile.id }, data: { ksefToken: token } });
      });
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
