import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: {
    refNumber: string;
  };
}

/**
 * GET /api/ksef/status/[refNumber]
 *
 * Sprawdzenie statusu przetwarzania dokumentu na serwerach MF:
 * 1. Odpytanie KSeF API (/online/Invoice/Status/[refNumber])
 * 2. Po sukcesie: pobranie numeru KSeF oraz Urzędowego Poświadczenia Odbioru (UPO)
 * 3. Aktualizacja bazy Prisma
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    const refNumber = decodeURIComponent(params.refNumber || "").trim();

    if (!refNumber) {
      throw new ApiError(400, "Brak numeru referencyjnego faktury (refNumber).");
    }

    // Znajdź fakturę w bazie
    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { referenceNumber: refNumber },
          { ksefNumber: refNumber },
          { id: refNumber },
        ],
        ...(user ? { userId: user.id } : {}),
      },
    });

    // Pobierz aktywną sesję KSeF
    const session = await prisma.ksefSession.findFirst({
      where: {
        status: "ACTIVE",
        validUntil: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    const env = (session?.environment as KsefEnvironment) || (process.env.KSEF_ENV as KsefEnvironment) || "test";
    const client = new KsefClient({ environment: env });

    const statusResult = await client.getInvoiceStatus(
      session?.accessToken || "session-token",
      refNumber
    );

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
      referenceNumber: refNumber,
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
