import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { KsefClient, type KsefEnvironment, generateDemoUpoXml } from "@/lib/ksef/index";

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
 * Pobranie e-Faktury FA(3) lub UPO z KSeF (XML lub JSON):
 * format: "xml" | "upo" | "json"
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    const ksefReferenceNumber = decodeURIComponent(params.ksefReferenceNumber || "").trim();

    if (!ksefReferenceNumber) {
      throw new ApiError(400, "Brak numeru KSeF faktury (ksefReferenceNumber).");
    }

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "json";

    // 1. Sprawdź fakturę w lokalnej bazie
    const localInvoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { ksefNumber: ksefReferenceNumber },
          { referenceNumber: ksefReferenceNumber },
          { id: ksefReferenceNumber },
        ],
        ...(user ? { userId: user.id } : {}),
      },
      include: { ksefSession: true },
    });

    const safeFilename = ksefReferenceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Jeśli żądano pobrania UPO
    if (format === "upo") {
      let upoXml = localInvoice?.upoXml;
      if (!upoXml) {
        upoXml = generateDemoUpoXml(localInvoice?.referenceNumber || ksefReferenceNumber, ksefReferenceNumber);
      }
      return new Response(upoXml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="UPO-${safeFilename}.xml"`,
        },
      });
    }

    // 2. Pobierz XML faktury
    let xml = localInvoice?.ksefXml || "";

    if (!xml) {
      const session = await prisma.ksefSession.findFirst({
        where: {
          status: "ACTIVE",
          validUntil: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      const ksefJson = (localInvoice?.ksef as any) || {};
      const env = (ksefJson.environment || session?.environment || "test") as KsefEnvironment;
      const client = new KsefClient({ environment: env });

      try {
        xml = await client.downloadInvoiceXml(session?.accessToken || "demo-token", ksefReferenceNumber);
      } catch {
        // jeśli błąd pobrania i jest lokalna kopia
        xml = localInvoice?.ksefXml || `<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Fa><P_2>${localInvoice?.number || "FV"}</P_2></Fa></Faktura>`;
      }
    }

    if (format === "xml") {
      return new Response(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="FA3-${safeFilename}.xml"`,
        },
      });
    }

    return json({
      success: true,
      ksefReferenceNumber,
      xml,
      invoice: localInvoice
        ? {
            id: localInvoice.id,
            number: localInvoice.number,
            status: localInvoice.status,
            issueDate: localInvoice.issueDate,
            totalGross: localInvoice.totalGross,
          }
        : null,
      upoXml: localInvoice?.upoXml || null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
