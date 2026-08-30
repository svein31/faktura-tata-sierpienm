import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { buildFa3Xml, validateFa3Xml, KsefClient, type KsefEnvironment, calculateFa3Totals } from "@/lib/ksef/index";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ksef/invoices/send
 *
 * Wysyłka faktury do KSeF API 2.0:
 * 1. Pobranie lub konwersja obiektu JSON faktury do formatu XML FA(3)
 * 2. Walidacja zgodności ze schematem FA(3)
 * 3. Wyliczenie skrótów SHA-256 i zaszyfrowanie XML kluczem AES-256-CBC (oraz klucza AES kluczem RSA MF)
 * 4. Wysłanie zaszyfrowanej paczki do endpointu /online/Invoice/Send w KSeF
 * 5. Zapisanie wpisu w bazie Prisma ze statusem PENDING i numerem referencyjnym
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const body = await readJson(req);

    const envInput = str(body.environment).toLowerCase() || process.env.KSEF_ENV || process.env.KSEF_ENVIRONMENT || "test";
    const environment: KsefEnvironment = envInput === "production" ? "production" : envInput === "demo" ? "demo" : "test";

    let xmlContent = "";
    let invoiceRecord: any = null;
    let invoiceData: Invoice | null = null;
    let sellerProfile: CompanyProfile | null = null;
    let buyerContractor: Contractor | null = null;

    // A. Jeśli przekazano gotowy XML
    if (typeof body.xml === "string" && body.xml.trim().length > 0) {
      xmlContent = body.xml.trim();
    }

    // B. Jeśli przekazano invoiceId lub invoiceNumber
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

      // Pobieramy dane sprzedawcy
      const company = await prisma.companySettings.findUnique({
        where: { userId: invoiceRecord.userId },
      });

      sellerProfile = company ? {
        name: company.name,
        nip: company.nip,
        regon: company.regon,
        street: company.street,
        city: company.city,
        postal: company.postal,
        country: company.country,
        iban: company.iban,
        bankName: company.bankName,
        email: company.email,
        phone: company.phone,
      } : null;

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
      // C. Jeśli przekazano pełny obiekt faktury JSON w body
      invoiceData = body.invoice as Invoice;
      sellerProfile = (body.seller as CompanyProfile) || null;
      buyerContractor = (body.buyer as Contractor) || null;
    }

    // Jeśli nie mamy jeszcze XML, budujemy go z obiektu faktury w schemacie FA(3)
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
      const errorMsg = validation.issues.map((i: { path: string; message: string }) => `[${i.path}] ${i.message}`).join("; ");
      throw new ApiError(400, `Błędy walidacji schematu FA(3): ${errorMsg}`);
    }

    // Ustalenie NIP sprzedawcy
    const sellerNip = (sellerProfile?.nip || process.env.KSEF_NIP || "").replace(/[^0-9]/g, "").trim();

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

    const client = new KsefClient({ environment });

    if (!activeSession || !activeSession.accessToken) {
      // Automatyczne zalogowanie z wykorzystaniem tokena
      const token = (process.env.KSEF_TOKEN || "").trim();
      const loginResult = await client.loginWithKsefToken(sellerNip || "5260301706", token || "demo-token");

      activeSession = await prisma.ksefSession.upsert({
        where: { referenceNumber: loginResult.referenceNumber },
        update: {
          accessToken: loginResult.accessToken,
          authenticationToken: loginResult.authenticationToken,
          validUntil: new Date(loginResult.validUntil),
          status: "ACTIVE",
          nip: sellerNip || "5260301706",
          environment,
          userId: user?.id ?? null,
        },
        create: {
          referenceNumber: loginResult.referenceNumber,
          accessToken: loginResult.accessToken,
          authenticationToken: loginResult.authenticationToken,
          validUntil: new Date(loginResult.validUntil),
          status: "ACTIVE",
          nip: sellerNip || "5260301706",
          environment,
          userId: user?.id ?? null,
        },
      });
    }

    // Szyfrowanie faktury (AES-256-CBC) i wysyłka do KSeF API
    const sendResult = await client.sendInvoiceEncrypted(
      activeSession.accessToken!,
      xmlContent
    );

    // Wyliczenie kwoty brutto
    const totals = invoiceData ? calculateFa3Totals(invoiceData.lines) : { totalGross: 0 };

    // Aktualizacja rekordu faktury w bazie Prisma
    if (invoiceRecord) {
      await prisma.invoice.update({
        where: { id: invoiceRecord.id },
        data: {
          status: "PENDING",
          referenceNumber: sendResult.referenceNumber || sendResult.elementReferenceNumber,
          ksefNumber: sendResult.elementReferenceNumber,
          nip: sellerNip,
          totalGross: totals.totalGross,
          ksefSessionId: activeSession.id,
          ksef: {
            number: sendResult.elementReferenceNumber,
            referenceNumber: sendResult.referenceNumber,
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
            body: `Numer referencyjny: ${sendResult.elementReferenceNumber || sendResult.referenceNumber}`,
            link: `/invoices/${invoiceRecord.id}`,
            read: false,
          },
        });
      }
    }

    return json({
      success: true,
      status: "PENDING",
      referenceNumber: sendResult.referenceNumber,
      elementReferenceNumber: sendResult.elementReferenceNumber,
      timestamp: sendResult.timestamp,
      environment,
      message: `Faktura została pomyślnie zaszyfrowana (AES-256-CBC/RSA-OAEP) i przesłana do KSeF. Identyfikator przetwarzania: ${sendResult.elementReferenceNumber}`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
