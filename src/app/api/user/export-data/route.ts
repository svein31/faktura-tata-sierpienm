import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/user/export-data
 * Eksport danych użytkownika zgodnie z art. 20 RODO (prawo do przenoszenia danych).
 * Zwraca JSON z profilem, firmami, historią zgód i podstawowymi metadanymi.
 */
export async function GET(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return json({ error: "Brak autoryzacji." }, { status: 401 });
    }

    const userId = sessionUser.id;

    // Do not load password hashes, KSeF credentials or entire catalogs for a summary export.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, nip: true, companyName: true, createdAt: true, updatedAt: true,
        termsAcceptedAt: true, termsAcceptedVersion: true,
        companyProfiles: { select: { id: true, companyName: true, nip: true, city: true, isDefault: true, createdAt: true } },
        legalConsents: {
          orderBy: { acceptedAt: "desc" },
          select: { documentType: true, documentVersion: true, accepted: true, acceptedAt: true, revokedAt: true, context: true },
        },
      },
    });

    if (!user) {
      return json({ error: "Użytkownik nie istnieje." }, { status: 404 });
    }

    const [invoicesCount, contractorsCount] = await Promise.all([
      prisma.invoice.count({ where: { userId } }),
      prisma.contractor.count({ where: { userId } }),
    ]);

    // Skonstruuj obiekt eksportu
    const exportData = {
      _metadata: {
        exportDate: new Date().toISOString(),
        exportedBy: "FakturaProsto — Eksport danych RODO (art. 20)",
        serviceUrl: "https://fakturaprosto.pl",
        format: "application/json",
        version: "1.0.0",
      },
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        nip: user.nip,
        companyName: user.companyName,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        termsAcceptedAt: user.termsAcceptedAt,
        termsAcceptedVersion: user.termsAcceptedVersion,
      },
      companies: (user.companyProfiles || []).map((cp: Record<string, unknown>) => ({
        id: cp.id,
        companyName: cp.companyName,
        nip: cp.nip,
        city: cp.city,
        isDefault: cp.isDefault,
        createdAt: cp.createdAt,
      })),
      legalConsents: (user.legalConsents || []).map((lc: Record<string, unknown>) => ({
        documentType: lc.documentType,
        documentVersion: lc.documentVersion,
        accepted: lc.accepted,
        acceptedAt: lc.acceptedAt,
        revokedAt: lc.revokedAt,
        context: lc.context,
      })),
      invoices_summary: {
        count: invoicesCount,
        note: "Pełne dane faktur dostępne w eksporcie CSV/JSON z panelu aplikacji.",
      },
      contractors_count: contractorsCount,
    };

    // Zwróć jako plik JSON do pobrania
    // A database ObjectId is ASCII; international email/quotes cannot corrupt Content-Disposition.
    const filename = `fakturaprosto-export-${userId}-${new Date().toISOString().split("T")[0]}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
