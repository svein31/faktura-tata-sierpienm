import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: {
    ksefReferenceNumber: string;
  };
}

/**
 * GET /api/ksef/invoices/download/[ksefReferenceNumber]
 *
 * Pobranie nagłówków oraz zawartości faktury z KSeF w formacie XML (lub JSON):
 * 1. Sprawdzenie uprawnień użytkownika
 * 2. Odpytanie KSeF API (/online/Invoice/Get/...)
 * 3. Zwrócenie pobranego pliku XML lub struktury z metadanymi
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    const ksefReferenceNumber = decodeURIComponent(params.ksefReferenceNumber || "").trim();

    if (!ksefReferenceNumber) {
      throw new ApiError(400, "Brak numeru KSeF faktury (ksefReferenceNumber).");
    }

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "json"; // "xml" | "json"

    // 1. Sprawdź czy mamy już zapisaną fakturę lub UPO lokalnie
    const localInvoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { ksefNumber: ksefReferenceNumber },
          { referenceNumber: ksefReferenceNumber },
          { id: ksefReferenceNumber },
        ],
        ...(user ? { userId: user.id } : {}),
      },
    });

    // 2. Pobierz aktywną sesję KSeF
    const session = await prisma.ksefSession.findFirst({
      where: {
        status: "ACTIVE",
        validUntil: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    const env = (session?.environment as KsefEnvironment) || (process.env.KSEF_ENV as KsefEnvironment) || "test";
    const client = new KsefClient({ environment: env });

    // 3. Pobranie XML z KSeF API
    const xml = await client.downloadInvoiceXml(
      session?.accessToken || "demo-token",
      ksefReferenceNumber
    );

    if (format === "xml") {
      return new Response(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="ksef-${ksefReferenceNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.xml"`,
        },
      });
    }

    return json({
      success: true,
      ksefReferenceNumber,
      xml,
      invoice: localInvoice ? {
        id: localInvoice.id,
        number: localInvoice.number,
        status: localInvoice.status,
        issueDate: localInvoice.issueDate,
        totalGross: localInvoice.totalGross,
      } : null,
      upoXml: localInvoice?.upoXml || null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
