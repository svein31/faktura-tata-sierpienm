import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { KsefClient, type KsefEnvironment, generateDemoUpoXml } from "@/lib/ksef/index";

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
 * Sprawdzenie statusu przetwarzania dokumentu w KSeF 2.0 i pobranie UPO.
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
      include: { ksefSession: true },
    });

    const ksefJson = (invoice?.ksef as any) || {};
    const env: KsefEnvironment = (ksefJson.environment || "test") as KsefEnvironment;

    // Obsługa trybu DEMO
    if (env === "demo") {
      const demoKsefNum = invoice?.ksefNumber || `5260301706-20260909-${Date.now().toString(16).slice(-12).toUpperCase()}-11`;
      const upo = invoice?.upoXml || generateDemoUpoXml(refNumber, demoKsefNum);

      if (invoice && (!invoice.upoXml || invoice.status !== "ksef_active")) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "ksef_active",
            ksefNumber: demoKsefNum,
            upoXml: upo,
            ksef: {
              ...ksefJson,
              number: demoKsefNum,
              status: "ACTIVE",
            },
          },
        });
      }

      return json({
        success: true,
        referenceNumber: refNumber,
        ksefReferenceNumber: demoKsefNum,
        processingCode: 200,
        processingDescription: "Dokument zarejestrowany poprawnie w KSeF (demo)",
        acquisitionTimestamp: ksefJson.sentAt || new Date().toISOString(),
        status: "ACCEPTED",
        upoXml: upo,
        hasUpo: true,
      });
    }

    // Środowisko produkcyjne / testowe KSeF 2.0
    const client = new KsefClient({ environment: env });

    // Pobierz aktywny accessToken dla sesji
    let accessToken = invoice?.ksefSession?.accessToken;
    if (!accessToken) {
      const session = await prisma.ksefSession.findFirst({
        where: {
          environment: env,
          status: "ACTIVE",
          validUntil: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      accessToken = session?.accessToken || "";
    }

    const sessionRef = ksefJson.sessionReferenceNumber || invoice?.ksefSession?.referenceNumber || "";
    const invoiceElementRef = invoice?.referenceNumber || refNumber;

    if (!accessToken || !sessionRef) {
      // Jeśli nie ma sesji, zwróć bieżący stan z bazy
      return json({
        success: true,
        referenceNumber: refNumber,
        ksefReferenceNumber: invoice?.ksefNumber,
        processingCode: ksefJson.processingCode || 100,
        processingDescription: ksefJson.processingDescription || "Oczekuje na przetworzenie w KSeF",
        acquisitionTimestamp: ksefJson.sentAt || invoice?.sentAt?.toISOString(),
        status: invoice?.status === "ksef_active" ? "ACCEPTED" : "PENDING",
        upoXml: invoice?.upoXml,
        hasUpo: Boolean(invoice?.upoXml),
      });
    }

    // Odpytaj KSeF 2.0 o status
    const statusResult = await client.getInvoiceStatus(accessToken, sessionRef, invoiceElementRef);

    if (invoice) {
      const isAccepted = statusResult.status === "ACCEPTED";
      const isRejected = statusResult.status === "REJECTED";
      const newStatus = isAccepted ? "ksef_active" : isRejected ? "ksef_rejected" : invoice.status;
      const ksefRef = statusResult.ksefReferenceNumber || invoice.ksefNumber;

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: newStatus,
          ksefNumber: ksefRef,
          upoXml: statusResult.upoXml || invoice.upoXml,
          ksef: {
            ...ksefJson,
            number: ksefRef,
            status: isAccepted ? "ACTIVE" : isRejected ? "REJECTED" : "QUEUED",
            processingCode: statusResult.processingCode,
            processingDescription: statusResult.processingDescription,
            acquisitionTimestamp: statusResult.acquisitionTimestamp || new Date().toISOString(),
          },
        },
      });

      if (invoice.userId && (isAccepted || isRejected)) {
        await prisma.notification.create({
          data: {
            userId: invoice.userId,
            kind: "ksef_status",
            title: isAccepted
              ? `Faktura ${invoice.number} zarejestrowana w KSeF`
              : `Błąd przetwarzania faktury ${invoice.number} w KSeF`,
            body: isAccepted
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
      ksefReferenceNumber: statusResult.ksefReferenceNumber || invoice?.ksefNumber,
      processingCode: statusResult.processingCode,
      processingDescription: statusResult.processingDescription,
      acquisitionTimestamp: statusResult.acquisitionTimestamp,
      status: statusResult.status,
      upoXml: statusResult.upoXml || invoice?.upoXml,
      hasUpo: Boolean(statusResult.upoXml || invoice?.upoXml),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
