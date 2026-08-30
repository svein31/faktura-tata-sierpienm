import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import {
  companyProfileToDto,
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
 * Nowy użytkownik dostaje PUSTE tablice (faktury/kontrahenci/produkty/spółki).
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    let [company, companies, ksef, contractors, products, invoices, notifications, prefs] = await Promise.all([
      prisma.companySettings.findUnique({ where: { userId: user.id } }),
      prisma.companyProfile.findMany({
        where: { userId: user.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      }),
      prisma.ksefSettings.findUnique({ where: { userId: user.id } }),
      prisma.contractor.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.product.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.invoice.findMany({
        where: { userId: user.id },
        include: { sellerCompany: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    ]);

    // Automatyczna migracja starego profilu CompanySettings jeśli użytkownik nie ma jeszcze CompanyProfile
    if (companies.length === 0 && company && (company.name || company.nip)) {
      try {
        const created = await prisma.companyProfile.create({
          data: {
            userId: user.id,
            nip: company.nip || "0000000000",
            companyName: company.name || "Moja Firma",
            street: company.street || "",
            buildingNumber: "",
            flatNumber: "",
            city: company.city || "",
            postalCode: company.postal || "",
            bankAccount: company.iban || "",
            isDefault: true,
          },
        });
        companies = [created];
      } catch {
        /* ignore unique conflict */
      }
    }

    const defaultCompany = companies.find((c) => c.isDefault) ?? companies[0] ?? null;

    return json({
      company: defaultCompany ? companyProfileToDto(defaultCompany) : (company ? companyToDto(company) : null),
      companies: companies.map(companyProfileToDto),
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
