import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";

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
    const body = ((await readJson(req).catch(() => ({}))) || {}) as Record<string, unknown>;

    const envInput = (
      str(body.environment) ||
      process.env.KSEF_ENV ||
      process.env.KSEF_ENVIRONMENT ||
      "test"
    ).toLowerCase();

    const environment: KsefEnvironment =
      envInput === "production" ? "production" : envInput === "demo" ? "demo" : "test";

    // Ustal NIP
    let nip = str(body.nip).replace(/\D/g, "").trim();
    if (!nip && session) {
      const comp = await prisma.companyProfile.findFirst({
        where: { userId: session.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
      if (comp?.nip) nip = comp.nip.replace(/\D/g, "").trim();

      if (!nip) {
        const legacy = await prisma.companySettings.findUnique({ where: { userId: session.id } });
        if (legacy?.nip) nip = legacy.nip.replace(/\D/g, "").trim();
      }
    }
    if (!nip) nip = (process.env.KSEF_NIP || "5260301706").replace(/\D/g, "").trim();

    // Ustal token KSeF
    let token = str(body.token).trim();
    if (!token && session) {
      const comp = await prisma.companyProfile.findFirst({
        where: { userId: session.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
      if (comp?.ksefToken) token = comp.ksefToken.trim();
    }
    if (!token) token = (process.env.KSEF_TOKEN || "").trim();

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
      tokenMask: token ? `••••${token.slice(-4)}` : null,
      certificates: {
        tokenKeyId: certs.tokenEncryption.publicKeyId,
        symmetricKeyId: certs.symmetricKeyEncryption.publicKeyId,
      },
      authTested,
      authSuccess,
      authMessage: authMessage || (token ? "Token sprawdzony" : "Brak tokena do testu autoryzacji (podaj w formularzu)"),
      message: `Bramka KSeF 2.0 (${environment}) jest w 100% aktywna i dostępna. Czas odpowiedzi: ${connectivity.pingMs}ms.`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
