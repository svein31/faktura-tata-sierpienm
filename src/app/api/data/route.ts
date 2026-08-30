import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import {
  companyToDto,
  contractorToDto,
  invoiceToDto,
  ksefToDto,
  notificationToDto,
  prefsToDto,
  productToDto,
} from "@/lib/dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/data — bootstrap całego stanu zalogowanego użytkownika.
 * Backend jest źródłem prawdy; klient traktuje to jako cache.
 * Nowy użytkownik dostaje PUSTE tablice (faktury/kontrahenci/produkty).
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const [company, ksef, contractors, products, invoices, notifications, prefs] = await Promise.all([
      prisma.companySettings.findUnique({ where: { userId: user.id } }),
      prisma.ksefSettings.findUnique({ where: { userId: user.id } }),
      prisma.contractor.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.product.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.invoice.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    ]);

    return json({
      company: company ? companyToDto(company) : null,
      ksef: ksef ? ksefToDto(ksef) : null,
      contractors: contractors.map(contractorToDto),
      products: products.map(productToDto),
      invoices: invoices.map(invoiceToDto),
      notifications: notifications.map(notificationToDto),
      notificationPrefs: prefsToDto(prefs),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
