import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { json } from "@/lib/api";

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

    // Pobierz dane użytkownika z powiązaniami
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        companyProfiles: true,
        legalConsents: {
          orderBy: { acceptedAt: "desc" },
        },
      },
    });

    if (!user) {
      return json({ error: "Użytkownik nie istnieje." }, { status: 404 });
    }

    // Pobierz faktury użytkownika (jeśli istnieją)
    let invoices: unknown[] = [];
    try {
      invoices = await prisma.invoice.findMany({
        where: { userId },
        select: {
          id: true,
          number: true,
          issueDate: true,
          totalGross: true,
          currency: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
    } catch {
      // Model Invoice może nie istnieć
    }

    // Pobierz kontrahentów
    let contractors: unknown[] = [];
    try {
      contractors = await prisma.contractor.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          nip: true,
          email: true,
          address: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      // Model Contractor może nie istnieć
    }

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
        count: (invoices as unknown[]).length,
        note: "Pełne dane faktur dostępne w eksporcie CSV/JSON z panelu aplikacji.",
      },
      contractors_count: (contractors as unknown[]).length,
    };

    // Zwróć jako plik JSON do pobrania
    const filename = `fakturaprosto-export-${user.email?.replace("@", "_at_")}-${new Date().toISOString().split("T")[0]}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache",
      },
    });
  } catch (error) {
    console.error("[ExportData] Błąd:", error);
    return json(
      { error: "Nie udało się wyeksportować danych." },
      { status: 500 }
    );
  }
}
