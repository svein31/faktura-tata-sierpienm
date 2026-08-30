import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { invoiceToDto, notificationToDto } from "@/lib/dto";
import { KsefClient, type KsefEnvironment, buildFa3Xml, validateFa3Xml, calculateFa3Totals, encryptInvoicePayload } from "@/lib/ksef/index";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";
import { companyProfileToDto, companyToDto } from "@/lib/dto";

export const runtime = "nodejs";

/**
 * POST /api/ksef/send — wysyłka e-Faktury do KSeF API 2.0.
 *
 * Obsługuje wszystkie środowiska (test / production / demo):
 * - test → ksef-test.mf.gov.pl (środowisko testowe MF)
 * - production → ksef.mf.gov.pl (środowisko produkcyjne MF)
 * - demo → symulacja lokalna (dla testów UI)
 *
 * Przepływ:
 * 1. Walidacja XML FA(3)
 * 2. Pobranie aktywnej sesji KSeF z bazy (lub automatyczne logowanie)
 * 3. Szyfrowanie faktury AES-256-CBC + RSA-OAEP SHA-256
 * 4. Wysłanie do KSeF API /online/Invoice/Send
 * 5. Aktualizacja rekordu w Prisma
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const xml = str(body.xml).trim();
    const envInput = (str(body.environment) || process.env.KSEF_ENV || process.env.KSEF_ENVIRONMENT || "test").toLowerCase();
    const environment: KsefEnvironment = envInput === "production" ? "production" : envInput === "demo" ? "demo" : "test";
    const invoiceId = str(body.invoiceId);
    const invoiceNumber = str(body.invoiceNumber);

    if (!xml || !xml.includes("<Faktura")) {
      throw new ApiError(400, "Brak prawidłowego dokumentu XML FA(3).");
    }
    if (!["demo", "test", "production"].includes(environment)) {
      throw new ApiError(400, "Nieprawidłowe środowisko KSeF.");
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        userId: session.id,
        OR: invoiceId ? [{ id: invoiceId }] : invoiceNumber ? [{ number: invoiceNumber }] : undefined,
      },
      include: { sellerCompany: true },
    });
    if (!invoice) throw new ApiError(404, "Nie znaleziono faktury do wysyłki.");

    // Ustalenie NIP sprzedawcy
    let sellerNip = "";
    if (invoice.sellerCompany?.nip) {
      sellerNip = invoice.sellerCompany.nip.replace(/[^0-9]/g, "");
    }
    if (!sellerNip) {
      const company = await prisma.companySettings.findUnique({ where: { userId: session.id } });
      sellerNip = (company?.nip || process.env.KSEF_NIP || "").replace(/[^0-9]/g, "");
    }

    // ── TRYB DEMO: symulacja lokalna (gdy użytkownik wybrał "demo" w UI) ──
    if (environment === "demo") {
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
      const seq = invoice.number.replace(/[^0-9]/g, "").slice(-4) || rand.slice(0, 4);
      const ksefNumber = `eFA/DEMO/${ymd}/${seq}-${rand}`;
      const sentAt = now.toISOString();

      const updated = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "ksef_sent",
          ksef: { number: ksefNumber, status: "ACTIVE", sentAt, environment: "demo" },
        },
        include: { sellerCompany: true },
      });

      await prisma.notification.create({
        data: {
          userId: session.id,
          kind: "ksef_status",
          title: `Faktura ${updated.number} wysłana do KSeF (demo)`,
          body: `Numer KSeF (demo): ${ksefNumber}`,
          link: `/invoices/${updated.id}`,
          read: false,
        },
      });

      return json({
        success: true,
        demo: true,
        ksefNumber,
        status: "ACTIVE",
        timestamp: sentAt,
        message: `Dokument zaakceptowany w KSeF (symulacja demo). Numer KSeF: ${ksefNumber}`,
        environment: "demo",
        invoice: invoiceToDto(updated),
      });
    }

    // ── TRYB PRODUKCYJNY / TESTOWY: prawdziwe API KSeF MF ──
    const client = new KsefClient({ environment });

    // Pobranie aktywnej sesji KSeF z bazy lub automatyczne logowanie
    let activeSession = await prisma.ksefSession.findFirst({
      where: {
        ...(sellerNip ? { nip: sellerNip } : {}),
        environment,
        status: "ACTIVE",
        validUntil: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeSession || !activeSession.accessToken) {
      const token = (process.env.KSEF_TOKEN || "").trim();
      if (!token) {
        throw new ApiError(
          400,
          `Brak tokena autoryzacyjnego KSeF. Ustaw zmienną środowiskową KSEF_TOKEN na serwerze lub zaloguj się przez /api/ksef/auth/login.`
        );
      }

      const loginResult = await client.loginWithKsefToken(sellerNip, token);

      activeSession = await prisma.ksefSession.upsert({
        where: { referenceNumber: loginResult.referenceNumber },
        update: {
          accessToken: loginResult.accessToken,
          authenticationToken: loginResult.authenticationToken,
          validUntil: new Date(loginResult.validUntil),
          status: "ACTIVE",
          nip: sellerNip,
          environment,
          userId: session.id,
        },
        create: {
          referenceNumber: loginResult.referenceNumber,
          accessToken: loginResult.accessToken,
          authenticationToken: loginResult.authenticationToken,
          validUntil: new Date(loginResult.validUntil),
          status: "ACTIVE",
          nip: sellerNip,
          environment,
          userId: session.id,
        },
      });
    }

    // Szyfrowanie i wysyłka faktury do KSeF API
    const sendResult = await client.sendInvoiceEncrypted(
      activeSession.accessToken!,
      xml
    );

    const ksefNumber = sendResult.elementReferenceNumber || sendResult.referenceNumber;
    const sentAt = sendResult.timestamp || new Date().toISOString();

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "ksef_sent",
        referenceNumber: sendResult.referenceNumber,
        ksefNumber: ksefNumber,
        ksef: {
          number: ksefNumber,
          referenceNumber: sendResult.referenceNumber,
          status: "QUEUED",
          sentAt,
          environment,
        },
      },
      include: { sellerCompany: true },
    });

    await prisma.notification.create({
      data: {
        userId: session.id,
        kind: "ksef_status",
        title: `Faktura ${updated.number} przekazana do KSeF`,
        body: `Numer referencyjny: ${ksefNumber}. Środowisko: ${environment}`,
        link: `/invoices/${updated.id}`,
        read: false,
      },
    });

    return json({
      success: true,
      demo: false,
      ksefNumber,
      referenceNumber: sendResult.referenceNumber,
      status: "QUEUED",
      timestamp: sentAt,
      message: `Faktura została zaszyfrowana (AES-256-CBC/RSA-OAEP) i przesłana do KSeF (${environment}). Identyfikator: ${ksefNumber}`,
      environment,
      invoice: invoiceToDto(updated),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
