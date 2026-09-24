import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";

import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ksef/test-connection
 *
 * Narzędzie diagnostyczne weryfikujące na żywo połączenie z bramką KSeF 2.0 (MF).
 * Krok 1: Ping bramki i pobranie Challenge (POST /auth/challenge)
 * Krok 2: Weryfikacja certyfikatów kluczy publicznych (GET /security/public-key-certificates)
 * Krok 3: (Opcjonalnie) Próba autoryzacji tokenem KSeF dla podanego NIP
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) throw new ApiError(401, "Zaloguj się, aby sprawdzić połączenie.");
    const body = await readJson(req);
    const companyId = str(body.companyId);
    if (!objectId(companyId)) throw new ApiError(400, "Wybierz firmę do testu połączenia.");
    const access = await requireCompanyAccess(session.id, companyId, body.gatewayOnly === true ? undefined : "canSendKsef");
    if (!access.ok) throw new ApiError(access.status, access.error);
    const company = await prisma.companyProfile.findUniqueOrThrow({ where: { id: companyId } });
    const settings = await prisma.ksefSettings.findUnique({ where: { userId: company.userId } });
    const envInput = str(body.environment) || settings?.environment || "test";
    if (!["production", "demo", "test"].includes(envInput)) throw new ApiError(400, "Nieprawidłowe środowisko KSeF.");
    const environment = envInput as KsefEnvironment;
    const nip = company.nip.replace(/\D/g, "");
    // Stored tokens belong to one environment and must never be tried elsewhere.
    const token = body.gatewayOnly === true ? "" : str(body.token).trim() || (settings?.environment === environment ? company.ksefToken?.trim() || "" : "");

    const client = new KsefClient({ environment });
    const connectivity = await client.testConnectivity();

    if (!connectivity.success) {
      return json({
        ok: false,
        environment,
        gatewayUrl: connectivity.gatewayUrl,
        pingMs: connectivity.pingMs,
        stage: "GATEWAY_UNREACHABLE",
        message: `Bramka KSeF (${environment}) nie odpowiada: ${connectivity.error}`,
      });
    }

    const certs = await client.fetchPublicKeyCertificates();

    // Jeśli przekazano lub znaleziono token — przetestuj autoryzację
    let authTested = false;
    let authSuccess = false;
    let authMessage = "";

    if (token && nip && nip.length === 10) {
      authTested = true;
      try {
        const authRes = await client.loginWithKsefToken(nip, token);
        if (authRes.accessToken) {
          authSuccess = true;
          authMessage = `Autoryzacja udana! Sesja KSeF aktywna do: ${authRes.validUntil}`;

          // Zapisz aktywną sesję w bazie jeśli użytkownik jest zalogowany
          if (session) {
            await prisma.ksefSession.upsert({
              where: { referenceNumber: authRes.referenceNumber },
              update: {
                accessToken: authRes.accessToken,
                authenticationToken: authRes.authenticationToken,
                refreshToken: authRes.refreshToken,
                validUntil: new Date(authRes.validUntil),
                status: "ACTIVE",
                nip,
                environment,
                userId: session.id,
              },
              create: {
                referenceNumber: authRes.referenceNumber,
                accessToken: authRes.accessToken,
                authenticationToken: authRes.authenticationToken,
                refreshToken: authRes.refreshToken,
                validUntil: new Date(authRes.validUntil),
                status: "ACTIVE",
                nip,
                environment,
                userId: session.id,
              },
            });
          }
        }
      } catch (err: any) {
        authSuccess = false;
        authMessage = err?.message || "Błąd autoryzacji tokena KSeF";
      }
    }

    return json({
      ok: true,
      environment,
      gatewayUrl: connectivity.gatewayUrl,
      pingMs: connectivity.pingMs,
      challenge: connectivity.challenge,
      nip,
      hasToken: Boolean(token),

      certificates: {
        tokenKeyId: certs.tokenEncryption.publicKeyId,
        symmetricKeyId: certs.symmetricKeyEncryption.publicKeyId,
      },
      authTested,
      authSuccess,
      authMessage: authMessage || (token ? "Token sprawdzony" : "Brak tokena do testu autoryzacji (podaj w formularzu)"),
      message: `Bramka KSeF 2.0 (${environment}) odpowiedziała na zapytanie. Czas odpowiedzi: ${connectivity.pingMs}ms. Status konkretnej faktury wymaga osobnego sprawdzenia.`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
