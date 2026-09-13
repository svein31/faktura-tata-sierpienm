import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { auditLogToDto } from "@/lib/dto";
import { getCompanyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/audit — Pobieranie wpisów dziennika zdarzeń (Audit Log)
 * z filtrowaniem wg firmy, dokumentu, akcji oraz zakresu dat.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId")?.trim() || undefined;
    const documentId = searchParams.get("documentId")?.trim() || undefined;
    const action = searchParams.get("action")?.trim() || undefined;
    const fromStr = searchParams.get("from")?.trim();
    const toStr = searchParams.get("to")?.trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);

    // Zbuduj warunki wyszukiwania
    const where: any = {};

    if (companyId) {
      // Weryfikacja czy użytkownik ma dostęp do wskazanej firmy
      const membership = await getCompanyMembership(companyId, user.id);
      if (!membership) {
        throw new ApiError(403, "Brak dostępu do dziennika zdarzeń tej firmy.");
      }
      where.companyId = companyId;
    } else if (documentId) {
      // Jeśli zapytanie o konkretny dokument (np. fakturę)
      const invoice = await prisma.invoice.findUnique({
        where: { id: documentId },
        select: { userId: true, sellerCompanyId: true },
      });

      if (!invoice) {
        return json({ logs: [] });
      }

      // Sprawdź uprawnienia do faktury: własna lub należąca do firmy, w której jest członkiem
      let hasAccess = invoice.userId === user.id;
      if (!hasAccess && invoice.sellerCompanyId) {
        const mem = await getCompanyMembership(invoice.sellerCompanyId, user.id);
        hasAccess = !!mem;
      }

      if (!hasAccess) {
        throw new ApiError(403, "Brak dostępu do historii tego dokumentu.");
      }

      where.OR = [
        { documentId },
        { entityId: documentId },
      ];
    } else {
      // Domyślnie pobieramy logi dla wszystkich firm użytkownika oraz jego własnych akcji
      const myMemberships = await prisma.companyMember.findMany({
        where: { userId: user.id },
        select: { companyId: true },
      });
      const accessibleCompanyIds = myMemberships.map((m) => m.companyId);

      where.OR = [
        { userId: user.id },
        ...(accessibleCompanyIds.length > 0 ? [{ companyId: { in: accessibleCompanyIds } }] : []),
      ];
    }

    if (action) {
      where.action = action;
    }

    if (fromStr || toStr) {
      where.createdAt = {};
      if (fromStr) {
        const fromDate = new Date(fromStr);
        if (!isNaN(fromDate.getTime())) where.createdAt.gte = fromDate;
      }
      if (toStr) {
        const toDate = new Date(toStr);
        if (!isNaN(toDate.getTime())) where.createdAt.lte = toDate;
      }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return json({
      logs: logs.map(auditLogToDto),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
