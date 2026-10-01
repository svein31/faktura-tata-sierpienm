import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { accessibleCompanyIds } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ ksefReferenceNumber: string }> };

/** Download only real documents belonging to an accessible company. */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const reference = (await params).ksefReferenceNumber.trim();
    if (!reference || reference.length > 150 || !/^[a-zA-Z0-9_-]+$/.test(reference)) {
      throw new ApiError(400, "Nieprawidłowy numer referencyjny KSeF.");
    }
    const format = new URL(req.url).searchParams.get("format") || "json";
    if (!["xml", "upo", "json"].includes(format)) throw new ApiError(400, "Nieobsługiwany format dokumentu.");
    const companies = await accessibleCompanyIds(user.id);
    const invoice = await prisma.invoice.findFirst({
      where: { AND: [
        { OR: [{ ksefNumber: reference }, { referenceNumber: reference }, ...(/^[a-f\d]{24}$/i.test(reference) ? [{ id: reference }] : [])] },
        { OR: [{ sellerCompanyId: { in: companies } }, { userId: user.id, sellerCompanyId: null }] },
      ] },
      include: { sellerCompany: true, ksefSession: true },
    });
    if (!invoice) throw new ApiError(404, "Nie znaleziono faktury.");
    if (invoice.sellerCompanyId) {
      const access = await requireCompanyAccess(user.id, invoice.sellerCompanyId, "canExport");
      if (!access.ok) throw new ApiError(access.status, access.error, access.code);
    }
    const download = (xml: string, prefix: string) => new Response(xml, { headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${prefix}-${reference}.xml"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
    if (format === "upo") {
      if (!invoice.upoXml) throw new ApiError(409, "UPO nie jest jeszcze dostępne. Sprawdź status wysyłki do KSeF.", "UPO_NOT_READY");
      return download(invoice.upoXml, "UPO");
    }
    let xml = invoice.ksefXml || "";
    if (!xml) {
      const meta = (invoice.ksef && typeof invoice.ksef === "object" && !Array.isArray(invoice.ksef) ? invoice.ksef : {}) as Record<string, unknown>;
      const env = meta.environment as KsefEnvironment;
      const nip = (invoice.sellerCompany?.nip || invoice.nip || "").replace(/\D/g, "");
      if (!invoice.ksefNumber || !nip || (env !== "production" && env !== "test")) {
        throw new ApiError(409, "Brak zapisanego XML faktury. Sprawdź status dokumentu w KSeF.", "XML_NOT_READY");
      }
      const session = await prisma.ksefSession.findFirst({ where: {
        userId: invoice.userId, nip, environment: env, status: "ACTIVE", validUntil: { gt: new Date() },
      }, orderBy: { createdAt: "desc" } });
      if (!session?.accessToken) throw new ApiError(409, "Brak aktywnej sesji KSeF dla tej firmy. Odnów uwierzytelnienie.", "KSEF_SESSION_REQUIRED");
      try {
        xml = await new KsefClient({ environment: env, timeoutMs: 10000 }).downloadInvoiceXml(session.accessToken, invoice.ksefNumber);
        if (!xml.trim()) throw new Error("Empty KSeF document");
      } catch {
        throw new ApiError(502, "Nie udało się pobrać XML z KSeF. Spróbuj ponownie później.", "KSEF_DOWNLOAD_FAILED");
      }
    }
    if (format === "xml") return download(xml, "FA3");
    return json({
      success: true, ksefReferenceNumber: reference, xml,
      invoice: { id: invoice.id, number: invoice.number, status: invoice.status, issueDate: invoice.issueDate, totalGross: invoice.totalGross },
      upoXml: invoice.upoXml || null,
    });
  } catch (error) { return handleApiError(error); }
}
