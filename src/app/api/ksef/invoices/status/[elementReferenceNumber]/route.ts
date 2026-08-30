import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: {
    elementReferenceNumber: string;
  };
}

/**
 * GET /api/ksef/invoices/status/[elementReferenceNumber]
 *
 * Sprawdzenie statusu przetwarzania e-Faktury w KSeF:
 * 1. Odpytanie KSeF API (/online/Invoice/Status/...)
 * 2. W przypadku sukcesu (kod 200): pobranie i zapisanie numeru KSeF oraz UPO (Urzędowego Poświadczenia Odbioru)
 * 3. Aktualizacja rekordu w bazie Prisma (status ACCEPTED lub REJECTED)
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    const elementReferenceNumber = decodeURIComponent(params.elementReferenceNumber || "").trim();

    if (!elementReferenceNumber) {
      throw new ApiError(400, "Brak numeru referencyjnego faktury (elementReferenceNumber).");
    }

    // Znajdź fakturę w bazie danych powiązaną z tym numerem
    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { referenceNumber: elementReferenceNumber },
          { ksefNumber: elementReferenceNumber },
          { id: elementReferenceNumber },
        ],
        ...(user ? { userId: user.id } : {}),
      },
    });

    // Pobierz aktywne połączenie sesyjne KSeF
    const session = await prisma.ksefSession.findFirst({
      where: {
        status: "ACTIVE",
        validUntil: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    const env = (session?.environment as KsefEnvironment) || (process.env.KSEF_ENV as KsefEnvironment) || "test";
    const client = new KsefClient({ environment: env });

    // Odpytanie KSeF API o status faktury
    const statusResult = await client.getInvoiceStatus(
      session?.accessToken || "demo-token",
      elementReferenceNumber
    );

    // Aktualizacja rekordu faktury w bazie Prisma
    if (invoice) {
      const updatedStatus = statusResult.status === "ACCEPTED" ? "ACCEPTED" : statusResult.status === "REJECTED" ? "REJECTED" : invoice.status;
      const ksefRef = statusResult.ksefReferenceNumber || invoice.ksefNumber;

      const existingKsefJson = (invoice.ksef as any) || {};

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: updatedStatus,
          ksefNumber: ksefRef,
          upoXml: statusResult.upoXml || invoice.upoXml,
          ksef: {
            ...existingKsefJson,
            number: ksefRef,
            status: statusResult.status === "ACCEPTED" ? "ACTIVE" : statusResult.status === "REJECTED" ? "REJECTED" : "QUEUED",
            processingCode: statusResult.processingCode,
            processingDescription: statusResult.processingDescription,
            acquisitionTimestamp: statusResult.acquisitionTimestamp || new Date().toISOString(),
          },
        },
      });

      // Powiadomienie użytkownika o zmianie statusu
      if (invoice.userId && (statusResult.status === "ACCEPTED" || statusResult.status === "REJECTED")) {
        await prisma.notification.create({
          data: {
            userId: invoice.userId,
            kind: "ksef_status",
            title: statusResult.status === "ACCEPTED"
              ? `Faktura ${invoice.number} zarejestrowana w KSeF`
              : `Błąd przetwarzania faktury ${invoice.number} w KSeF`,
            body: statusResult.status === "ACCEPTED"
              ? `Numer KSeF: ${ksefRef}`
              : `Powód: ${statusResult.processingDescription}`,
            link: `/invoices/${invoice.id}`,
            read: false,
          },
        });
      }
    }

    return json({
      success: true,
      elementReferenceNumber,
      ksefReferenceNumber: statusResult.ksefReferenceNumber,
      processingCode: statusResult.processingCode,
      processingDescription: statusResult.processingDescription,
      acquisitionTimestamp: statusResult.acquisitionTimestamp,
      status: statusResult.status,
      upoXml: statusResult.upoXml,
      hasUpo: !!statusResult.upoXml,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
