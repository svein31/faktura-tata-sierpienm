import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import {
  buildFa3Xml,
  validateFa3Xml,
  KsefClient,
  type KsefEnvironment,
  calculateFa3Totals,
  generateDemoUpoXml,
} from "@/lib/ksef/index";
import { companyProfileToDto, companyToDto } from "@/lib/dto";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ksef/invoices/send
 *
 * Wysyłka faktury do KSeF API 2.0 (FA(3))
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const body = await readJson(req);

    const envInput = (
      str(body.environment) ||
      process.env.KSEF_ENV ||
      process.env.KSEF_ENVIRONMENT ||
      "test"
    ).toLowerCase();
    const environment: KsefEnvironment =
      envInput === "production" ? "production" : envInput === "demo" ? "demo" : "test";

    let xmlContent = "";
    let invoiceRecord: any = null;
    let invoiceData: Invoice | null = null;
    let sellerProfile: CompanyProfile | null = null;
    let buyerContractor: Contractor | null = null;

    if (typeof body.xml === "string" && body.xml.trim().length > 0) {
      xmlContent = body.xml.trim();
    }

    const invoiceId = str(body.invoiceId);
    const invoiceNumber = str(body.invoiceNumber);

    if (invoiceId || invoiceNumber) {
      invoiceRecord = await prisma.invoice.findFirst({
        where: {
          OR: [
            ...(invoiceId ? [{ id: invoiceId }] : []),
            ...(invoiceNumber ? [{ number: invoiceNumber }] : []),
          ],
          ...(user ? { userId: user.id } : {}),
        },
      });

      if (!invoiceRecord) {
        throw new ApiError(404, "Nie znaleziono wskazanej faktury w bazie danych.");
      }

      // Pobieramy dane profilu spółki sprzedawcy
      let comp = null;
      if (invoiceRecord.sellerCompanyId) {
        comp = await prisma.companyProfile.findUnique({
          where: { id: invoiceRecord.sellerCompanyId },
        });
      }
      if (!comp) {
        comp =
          (await prisma.companyProfile.findFirst({
            where: { userId: invoiceRecord.userId, isDefault: true },
          })) ||
          (await prisma.companyProfile.findFirst({
            where: { userId: invoiceRecord.userId },
          }));
      }

      if (comp) {
        sellerProfile = companyProfileToDto(comp);
      } else {
        const legacy = await prisma.companySettings.findUnique({
          where: { userId: invoiceRecord.userId },
        });
        sellerProfile = legacy ? companyToDto(legacy) : null;
      }

      // Pobieramy kontrahenta
      if (invoiceRecord.contractorId) {
        const contractor = await prisma.contractor.findUnique({
          where: { id: invoiceRecord.contractorId },
        });
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

      invoiceData = {
        id: invoiceRecord.id,
        number: invoiceRecord.number,
        type: invoiceRecord.type as any,
        status: invoiceRecord.status as any,
        contractorId: invoiceRecord.contractorId,
        issueDate: invoiceRecord.issueDate,
        saleDate: invoiceRecord.saleDate,
        dueDate: invoiceRecord.dueDate,
        currency: invoiceRecord.currency as any,
        language: invoiceRecord.language as any,
        paymentMethod: invoiceRecord.paymentMethod as any,
        paymentTermDays: invoiceRecord.paymentTermDays,
        notes: invoiceRecord.notes || undefined,
        lines: (invoiceRecord.lines as any) || [],
        createdAt: invoiceRecord.createdAt.toISOString(),
      };
    } else if (body.invoice) {
      invoiceData = body.invoice as Invoice;
      sellerProfile = (body.seller as CompanyProfile) || null;
      buyerContractor = (body.buyer as Contractor) || null;
    }

    if (!xmlContent && invoiceData && sellerProfile) {
      xmlContent = buildFa3Xml({
        invoice: invoiceData,
        seller: sellerProfile,
        buyer: buyerContractor,
      });
    }

    if (!xmlContent || !xmlContent.includes("<Faktura")) {
      throw new ApiError(400, "Brak danych faktury lub nie udało się wygenerować dokumentu XML FA(3).");
    }

    // Walidacja schematu FA(3)
    const validation = validateFa3Xml(xmlContent);
    if (!validation.ok) {
      const errorMsg = validation.issues.map((i) => `[${i.path}] ${i.message}`).join("; ");
      throw new ApiError(400, `Błędy walidacji schematu FA(3): ${errorMsg}`);
    }

    const sellerNip = (sellerProfile?.nip || process.env.KSEF_NIP || "5260301706").replace(/\D/g, "").trim();

    // ── TRYB DEMO ──
    if (environment === "demo") {
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
      const ksefNumber = `${sellerNip}-${ymd}-${rand}-11`;
      const elemRef = `${ymd}-EE-${rand}0000-B67F415CDC-2C`;
      const upo = generateDemoUpoXml(elemRef, ksefNumber);

      if (invoiceRecord) {
        await prisma.invoice.update({
          where: { id: invoiceRecord.id },
          data: {
            status: "ksef_active",
            referenceNumber: elemRef,
            ksefNumber,
            upoXml: upo,
            ksefXml: xmlContent,
            sentAt: now,
            ksef: {
              number: ksefNumber,
              referenceNumber: elemRef,
              status: "ACTIVE",
              sentAt: now.toISOString(),
              environment: "demo",
            },
          },
        });
      }

      return json({
        success: true,
        status: "ACCEPTED",
        referenceNumber: elemRef,
        elementReferenceNumber: elemRef,
        ksefNumber,
        timestamp: now.toISOString(),
        environment: "demo",
        hasUpo: true,
        message: `Faktura została pomyślnie zarejestrowana w KSeF (demo). Numer KSeF: ${ksefNumber}`,
      });
    }

    // ── TRYB PRODUKCYJNY / TESTOWY ──
    const client = new KsefClient({ environment });

    let token = "";
    if (sellerProfile && "ksefToken" in sellerProfile && sellerProfile.ksefToken) {
      token = String(sellerProfile.ksefToken).trim();
    }
    if (!token && user) {
      const comp = await prisma.companyProfile.findFirst({
        where: { userId: user.id, nip: sellerNip },
      });
      if (comp?.ksefToken) token = comp.ksefToken.trim();
    }
    if (!token) token = (process.env.KSEF_TOKEN || "").trim();

    if (!token) {
      throw new ApiError(400, `Brak tokena KSeF dla NIP ${sellerNip}. Uzupełnij token w profilu firmy.`);
    }

    // Pobranie lub utworzenie aktywnej sesji
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
      const loginResult = await client.loginWithKsefToken(sellerNip, token);
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
          userId: user?.id ?? null,
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
          userId: user?.id ?? null,
        },
      });
    }

    // Otwarcie sesji interaktywnej dla e-Faktur FA(3)
    const onlineSession = await client.openOnlineSession(accessToken);

    // Zaszyfrowanie i wysłanie faktury
    const sendResult = await client.sendInvoiceEncrypted(
      accessToken,
      onlineSession.referenceNumber,
      xmlContent,
      onlineSession.symmetricKey,
      onlineSession.iv
    );

    const totals = invoiceData ? calculateFa3Totals(invoiceData.lines) : { totalGross: 0 };

    if (invoiceRecord) {
      await prisma.invoice.update({
        where: { id: invoiceRecord.id },
        data: {
          status: "ksef_sent",
          referenceNumber: sendResult.elementReferenceNumber,
          ksefNumber: sendResult.elementReferenceNumber,
          nip: sellerNip,
          totalGross: totals.totalGross,
          ksefSessionId: activeSession?.id ?? null,
          ksefXml: xmlContent,
          sentAt: new Date(),
          ksef: {
            number: sendResult.elementReferenceNumber,
            referenceNumber: sendResult.elementReferenceNumber,
            sessionReferenceNumber: onlineSession.referenceNumber,
            status: "QUEUED",
            sentAt: sendResult.timestamp,
            environment,
          },
        },
      });

      if (user) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            kind: "ksef_status",
            title: `Faktura ${invoiceRecord.number} przekazana do KSeF`,
            body: `Identyfikator przetwarzania: ${sendResult.elementReferenceNumber}`,
            link: `/invoices/${invoiceRecord.id}`,
            read: false,
          },
        });
      }
    }

    return json({
      success: true,
      status: "PENDING",
      referenceNumber: onlineSession.referenceNumber,
      elementReferenceNumber: sendResult.elementReferenceNumber,
      timestamp: sendResult.timestamp,
      environment,
      message: `Faktura została pomyślnie zaszyfrowana (AES-256-CBC/RSA-OAEP) i przesłana do KSeF (${environment}). Identyfikator przetwarzania: ${sendResult.elementReferenceNumber}`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
