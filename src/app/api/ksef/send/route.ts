import { prisma } from "@/lib/db";
import { claimKsefTransmission } from "@/lib/ksef/transmission-claim";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import {
  KsefClient,
  type KsefEnvironment,
  buildFa3Xml,
  validateFa3Xml,
  calculateFa3Totals,
  generateDemoUpoXml,
} from "@/lib/ksef/index";
import { companyProfileToDto, companyToDto } from "@/lib/dto";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * POST /api/ksef/send — wysyłka e-Faktury do KSeF API 2.0 (FA(3)).
 *
 * Obsługuje wszystkie środowiska (production / test / demo):
 * - production → https://api.ksef.mf.gov.pl/v2 (oficjalne środowisko produkcyjne MF)
 * - test       → https://api-test.ksef.mf.gov.pl/v2 (oficjalne środowisko testowe MF)
 * - demo       → bezpieczna symulacja lokalna ze schematem FA(3) i generowaniem UPO
 */
export async function POST(req: Request) {
  try {
    if (process.env.KSEF_PAUSE_DISPATCH === "true") {
      return json(
        {
          error: "Wysyłka do KSeF została tymczasowo wstrzymana przez administratora (circuit breaker). Spróbuj ponownie później.",
          code: "KSEF_DISPATCH_PAUSED",
        },
        { status: 503 }
      );
    }

    const session = await getSessionUser();
    if (!session) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    let xml = "";
    const envInput = (
      str(body.environment) ||
      process.env.KSEF_ENV ||
      process.env.KSEF_ENVIRONMENT ||
      "test"
    ).toLowerCase();
    const environment: KsefEnvironment =
      envInput === "production" ? "production" : envInput === "demo" ? "demo" : "test";

    const invoiceId = str(body.invoiceId);
    const invoiceNumber = str(body.invoiceNumber);

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(invoiceId);
    if (!isObjectId) throw new ApiError(400, "Wymagany identyfikator faktury.");
    const orConds = [
      ...(isObjectId ? [{ id: invoiceId }] : []),
      
    ];

    // Pobierz firmy, do których użytkownik ma dostęp
    const memberships = await prisma.companyMember.findMany({
      where: { userId: session.id },
      select: { companyId: true },
    });
    const accessibleCompanyIds = memberships.map((m) => m.companyId);

    // Znajdź fakturę w bazie
    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { userId: session.id },
          ...(accessibleCompanyIds.length > 0 ? [{ sellerCompanyId: { in: accessibleCompanyIds } }] : []),
        ],
        AND: orConds.length > 0 ? [{ OR: orConds }] : undefined,
      },
      include: { sellerCompany: true },
    });

    if (!invoice) {
      throw new ApiError(404, "Nie znaleziono faktury do wysyłki.");
    }
    if (invoice.isOffline && (invoice.status === "draft" || !invoice.qrCodeI || !invoice.qrCodeII || !invoice.ksefXml))
      throw new ApiError(409, "Wystaw fakturę offline z podpisanym Kodem II przed przesłaniem.");

    // Weryfikacja uprawnienia do wysyłki KSeF w zespole
    if (invoice?.sellerCompanyId) {
      const { requireCompanyAccess } = await import("@/lib/permissions");
      const access = await requireCompanyAccess(session.id, invoice.sellerCompanyId, "canSendKsef");
      if (!access.ok) throw new ApiError(access.status, access.error);
    }

    // Blokada logiczna: faktury zakupowe (FZ) nie mogą być wysyłane do KSeF jako faktury sprzedaży
    if (invoice?.type === "purchase") {
      throw new ApiError(
        400,
        "Faktura zakupowa (FZ) nie może być wysłana do KSeF. Faktury zakupowe odbiera się z KSeF lub ewidencjonuje jako koszty."
      );
    }

    // Blokada logiczna: faktury już zarejestrowane w KSeF
    if (invoice?.ksefNumber) {
      throw new ApiError(
        400,
        `Faktura posiada już nadany numer KSeF (${invoice.ksefNumber}) i nie może zostać wysłana ponownie.`
      );
    }

    // Pobierz dane sprzedawcy i kontrahenta
    let sellerProfile: CompanyProfile | null = null;
    let buyerContractor: Contractor | null = null;

    if (invoice) {
      // Profil sprzedawcy
      if (invoice.sellerCompany) {
        sellerProfile = companyProfileToDto(invoice.sellerCompany);
      } else if (invoice.sellerCompanyId) {
        const comp = await prisma.companyProfile.findUnique({ where: { id: invoice.sellerCompanyId } });
        if (comp) sellerProfile = companyProfileToDto(comp);
      }
      if (!sellerProfile) {
        const defComp = await prisma.companyProfile.findFirst({
          where: { userId: session.id },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        });
        if (defComp) sellerProfile = companyProfileToDto(defComp);
        else {
          const legacy = await prisma.companySettings.findUnique({ where: { userId: session.id } });
          if (legacy) sellerProfile = companyToDto(legacy);
        }
      }

      // Kontrahent (nabywca)
      if (invoice.contractorId) {
        const contractor = await prisma.contractor.findUnique({ where: { id: invoice.contractorId } });
        if (contractor) {
          buyerContractor = {
            id: contractor.id,
            name: contractor.name,
            nip: contractor.nip,
            regon: contractor.regon || undefined,
            address: contractor.address as any,
            email: contractor.email || undefined,
            phone: contractor.phone || undefined,
            isVatPayer: contractor.isVatPayer,
            createdAt: contractor.createdAt.toISOString(),
          };
        }
      }

      // Jeśli nie ma XML lub był to stary mock XML, wygeneruj pełny FA(3)
      if (!xml || !xml.includes("http://crd.gov.pl/wzor/2025/06/25/13775/")) {
        const invoiceData = invoiceToDto(invoice);

        if (sellerProfile) {
          xml = buildFa3Xml({
            invoice: invoiceData,
            seller: sellerProfile,
            buyer: buyerContractor,
          });
        }
      }
    }

    if (!xml || !xml.includes("<Faktura")) {
      throw new ApiError(400, "Brak prawidłowego dokumentu XML FA(3).");
    }
    if (invoice.isOffline && xml !== invoice.ksefXml)
      throw new ApiError(409, "XML wysyłki musi być identyczny z podpisanym dokumentem offline.");

    // Walidacja schematu FA(3)
    const val = validateFa3Xml(xml);
    if (!val.ok) {
      const errs = val.issues.map((i) => `[${i.path}] ${i.message}`).join("; ");
      throw new ApiError(400, `Błąd walidacji FA(3): ${errs}`);
    }

    // Ustalenie NIP sprzedawcy
    let sellerNip = (sellerProfile?.nip || invoice?.nip || process.env.KSEF_NIP || "").replace(/\D/g, "");
    if (!sellerNip) {
      const settings = await prisma.companySettings.findUnique({ where: { userId: session.id } });
      if (settings?.nip) sellerNip = settings.nip.replace(/\D/g, "");
    }
    if (!sellerNip || sellerNip.length !== 10) {
      throw new ApiError(400, "Uzupełnij NIP sprzedawcy.");
    }

    // ── TRYB DEMO: natychmiastowa symulacja z generowaniem UPO ──
    if (environment === "demo") {
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
      const seq = invoice ? invoice.number.replace(/[^0-9]/g, "").slice(-4) || rand.slice(0, 4) : rand.slice(0, 4);
      const ksefNumber = `${sellerNip}-${ymd}-${seq}${rand}-11`;
      const elemRef = `${ymd}-EE-${rand}0000-B67F415CDC-2C`;
      const sentAt = now.toISOString();
      const upoXml = generateDemoUpoXml(elemRef, ksefNumber);

      let updatedInvoice = invoice;
      if (invoice) {
        updatedInvoice = await prisma.$transaction(async tx => {
        await claimKsefTransmission(tx, { invoiceId: invoice.id, version: invoice.version, userId: session.id });
        return tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "ksef_active",
            documentStatus: "accepted",
            ksefStatus: "accepted",
            referenceNumber: elemRef,
            ksefNumber: ksefNumber,
            upoXml: upoXml,
            ksefXml: xml,
            sentAt: now,
            ksef: {
              number: ksefNumber,
              referenceNumber: elemRef,
              status: "ACTIVE",
              sentAt,
              environment: "demo",
            },
          },
          include: { sellerCompany: true },
        });
        });

        await prisma.notification.create({
          data: {
            userId: session.id,
            kind: "ksef_status",
            title: `Faktura ${updatedInvoice.number}: symulacja KSeF`,
            body: `Numer symulacyjny: ${ksefNumber} · wygenerowano nieurzędowe potwierdzenie demo.`,
            link: `/invoices/${updatedInvoice.id}`,
            read: false,
          },
        });

        await recordAuditLog({
          companyId: updatedInvoice.sellerCompanyId || undefined,
          documentId: updatedInvoice.id,
          userId: session.id,
          userName: session.name || session.email,
          userEmail: session.email,
          action: "ksef_sent",
          entityType: "invoice",
          entityId: updatedInvoice.id,
          description: `Zasymulowano przyjęcie faktury ${updatedInvoice.number} (demo: ${ksefNumber})`,
          details: {
            ksefNumber,
            referenceNumber: elemRef,
            environment: "demo",
          },
        });

        // Symulacji nie wysyłamy automatycznie do kontrahenta jako potwierdzonej przez MF.
      }

      return json({
        success: true,
        demo: true,
        ksefNumber,
        referenceNumber: elemRef,
        status: "ACTIVE",
        ksefStatus: "accepted",
        documentStatus: "accepted",
        timestamp: sentAt,
        hasUpo: true,
        message: `Symulacja lokalna: dokument nie trafił do MF. Numer demonstracyjny: ${ksefNumber}`,
        environment: "demo",
        invoice: updatedInvoice ? invoiceToDto(updatedInvoice) : null,
      });
    }

    // ── TRYB PRODUKCYJNY LUB TESTOWY (oficjalne API Ministerstwa Finansów v2.0) ──
    const client = new KsefClient({ environment });

    // Ustal token KSeF
    let ksefToken = "";
    if (invoice?.sellerCompany?.ksefToken) {
      ksefToken = invoice.sellerCompany.ksefToken.trim();
    }
    if (!ksefToken) {
      const comp = await prisma.companyProfile.findFirst({
        where: { userId: session.id, nip: sellerNip },
      });
      if (comp?.ksefToken) ksefToken = comp.ksefToken.trim();
    }
    if (!ksefToken) {
      ksefToken = (process.env.KSEF_TOKEN || "").trim();
    }

    if (!ksefToken) {
      throw new ApiError(
        400,
        `Brak tokena autoryzacyjnego KSeF dla NIP ${sellerNip}. Dodaj token w Centrum KSeF lub w profilu firmy.`
      );
    }

    // Sprawdź czy mamy aktywny accessToken sesji KSeF dla tego NIP i środowiska
    let activeSession = await prisma.ksefSession.findFirst({
      where: {
        nip: sellerNip,
        environment,
        status: "ACTIVE",
        validUntil: { gt: new Date(Date.now() + 60_000) },
        accessToken: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });

    let accessToken = activeSession?.accessToken || "";

    if (!accessToken) {
      // Uwierzytelnienie w KSeF 2.0
      const loginResult = await client.loginWithKsefToken(sellerNip, ksefToken);
      accessToken = loginResult.accessToken;

      activeSession = await prisma.ksefSession.upsert({
        where: { referenceNumber: loginResult.referenceNumber },
        update: {
          accessToken: loginResult.accessToken,
          authenticationToken: loginResult.authenticationToken,
          refreshToken: loginResult.refreshToken,
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
          refreshToken: loginResult.refreshToken,
          validUntil: new Date(loginResult.validUntil),
          status: "ACTIVE",
          nip: sellerNip,
          environment,
          userId: session.id,
        },
      });
    }

    await prisma.$transaction(tx => claimKsefTransmission(tx, { invoiceId: invoice.id, version: invoice.version, userId: session.id }));
    let onlineSession;
    let sendResult;
    try {
      // Persisted claim keeps a crash or uncertain response from becoming a duplicate send.
      onlineSession = await client.openOnlineSession(accessToken);
      // Wyślij zaszyfrowaną fakturę do KSeF API
      sendResult = await client.sendInvoiceEncrypted(
        accessToken,
        onlineSession.referenceNumber,
        xml,
        onlineSession.symmetricKey,
        onlineSession.iv,
        Boolean(invoice.isOffline)
      );
    } catch (sendErr: any) {
      // W razie błędu sieciowego lub timeoutu — oznacz jako weryfikacja wymagana
      if (invoice) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            ksefStatus: "verify_needed",
          },
        });
      }
      throw sendErr;
    }

    const invoiceRef = sendResult.elementReferenceNumber;
    const sentAt = new Date().toISOString();

    let updated = invoice;
    if (invoice) {
      // Zgodnie z wymaganiami KSeF: numer KSeF NIE jest nadawany przy wysyłce!
      // Nadawany jest wyłącznie po uzyskaniu kodu 200 i wygenerowaniu UPO przez MF.
      updated = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "ksef_sent",
          documentStatus: "ready",
          ksefStatus: "sending",
          referenceNumber: invoiceRef,
          ksefNumber: null,
          ksefXml: xml,
          sentAt: new Date(),
          ksefSessionId: activeSession?.id ?? null,
          ksef: {
            referenceNumber: invoiceRef,
            sessionReferenceNumber: onlineSession.referenceNumber,
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
          title: `Faktura ${updated.number} przekazana do KSeF (${environment})`,
          body: `Identyfikator przetwarzania w sesji: ${invoiceRef}. Oczekiwanie na nadanie numeru KSeF i UPO.`,
          link: `/invoices/${updated.id}`,
          read: false,
        },
      });

      await recordAuditLog({
        companyId: updated.sellerCompanyId || undefined,
        documentId: updated.id,
        userId: session.id,
        userName: session.name || session.email,
        userEmail: session.email,
        action: "ksef_sent",
        entityType: "invoice",
        entityId: updated.id,
        description: `Przekazano fakturę ${updated.number} do KSeF (${environment})`,
        details: {
          referenceNumber: invoiceRef,
          sessionReferenceNumber: onlineSession.referenceNumber,
          environment,
        },
      });
    }

    return json({
      success: true,
      demo: false,
      ksefNumber: null,
      referenceNumber: invoiceRef,
      sessionReferenceNumber: onlineSession.referenceNumber,
      status: "QUEUED",
      ksefStatus: "sending",
      documentStatus: "ready",
      timestamp: sentAt,
      message: `Faktura została zaszyfrowana (AES-256-CBC/RSA-OAEP) i przyjęta przez KSeF (${environment}). Identyfikator przetwarzania: ${invoiceRef}. Trwa weryfikacja schematu i nadawanie numeru KSeF.`,
      environment,
      invoice: updated ? invoiceToDto(updated) : null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
