import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import {
  companyBankAccountToDto,
  companyProfileToDto,
  companyToDto,
  contractorToDto,
  invoiceToDto,
  ksefToDto,
  notificationToDto,
  prefsToDto,
  productToDto,
} from "@/lib/dto";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { CompanyRole } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/data — bootstrap całego stanu zalogowanego użytkownika.
 * Zwraca firmy własne oraz firmy, w których użytkownik jest członkiem zespołu
 * (księgowa, pracownik, podgląd) wraz z rolami i uprawnieniami w każdej z nich.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    // 1. Pobierz członkostwa w zespołach
    const memberships = await prisma.companyMember.findMany({
      where: { userId: user.id },
      include: {
        company: {
          include: { bankAccounts: true },
        },
      },
    });

    // 2. Pobierz profile własne
    let ownedCompanies = await prisma.companyProfile.findMany({
      where: { userId: user.id },
      include: { bankAccounts: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    const companySettings = await prisma.companySettings.findUnique({ where: { userId: user.id } });

    // Automatyczna migracja starego profilu CompanySettings jeśli użytkownik nie ma jeszcze CompanyProfile
    if (ownedCompanies.length === 0 && companySettings && (companySettings.name || companySettings.nip)) {
      try {
        const created = await prisma.companyProfile.create({
          data: {
            userId: user.id,
            nip: companySettings.nip || "0000000000",
            companyName: companySettings.name || "Moja Firma",
            street: companySettings.street || "",
            buildingNumber: "",
            flatNumber: "",
            city: companySettings.city || "",
            postalCode: companySettings.postal || "",
            bankAccount: companySettings.iban || "",
            isDefault: true,
          },
          include: { bankAccounts: true },
        });

        // Dodaj członkostwo właściciela
        await prisma.companyMember.create({
          data: {
            companyId: created.id,
            userId: user.id,
            role: "owner",
            canIssueInvoices: true,
            canCreateCorrections: true,
            canRecordPayments: true,
            canExport: true,
            canSendKsef: true,
            canManageBankAccounts: true,
            canManageTeam: true,
          },
        });

        ownedCompanies = [created];
      } catch {
        /* ignore unique conflict */
      }
    }

    // Scal wszystkie firmy (własne + z zaproszenia/członkostwa), usuwając duplikaty
    const companyMap = new Map<string, any>();

    for (const oc of ownedCompanies) {
      const dto = companyProfileToDto(oc);
      dto.currentUserRole = "owner";
      dto.currentUserPermissions = { ...DEFAULT_ROLE_PERMISSIONS.owner };
      dto.bankAccounts = (oc.bankAccounts || []).map(companyBankAccountToDto);
      companyMap.set(oc.id, dto);
    }

    for (const m of memberships) {
      if (m.company && !companyMap.has(m.company.id)) {
        const dto = companyProfileToDto(m.company);
        const role = (m.role as CompanyRole) || "employee";
        const defaults = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.employee;

        dto.currentUserRole = role;
        dto.currentUserPermissions = {
          canIssueInvoices: m.canIssueInvoices ?? defaults.canIssueInvoices,
          canCreateCorrections: m.canCreateCorrections ?? defaults.canCreateCorrections,
          canRecordPayments: m.canRecordPayments ?? defaults.canRecordPayments,
          canExport: m.canExport ?? defaults.canExport,
          canSendKsef: m.canSendKsef ?? defaults.canSendKsef,
          canManageBankAccounts: m.canManageBankAccounts ?? defaults.canManageBankAccounts,
          canManageTeam: m.canManageTeam ?? defaults.canManageTeam,
        };
        dto.bankAccounts = (m.company.bankAccounts || []).map(companyBankAccountToDto);
        companyMap.set(m.company.id, dto);
      } else if (m.company && companyMap.has(m.company.id)) {
        // Uzupełnij rolę jeśli istnieje
        const existing = companyMap.get(m.company.id);
        const role = (m.role as CompanyRole) || "owner";
        existing.currentUserRole = role;
      }
    }

    const allCompanies = Array.from(companyMap.values());
    const accessibleCompanyIds = allCompanies.map((c) => c.id);
    const companyOwnersUserIds = Array.from(new Set(allCompanies.map((c) => c.userId)));

    // Pobierz powiązane dane (faktury, kontrahenci, produkty itp.)
    const [ksef, contractors, products, invoices, notifications, prefs] = await Promise.all([
      prisma.ksefSettings.findUnique({ where: { userId: user.id } }),
      prisma.contractor.findMany({
        where: {
          OR: [
            { userId: user.id },
            { userId: { in: companyOwnersUserIds } },
          ],
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.findMany({
        where: {
          OR: [
            { userId: user.id },
            { userId: { in: companyOwnersUserIds } },
          ],
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.findMany({
        where: {
          OR: [
            { userId: user.id },
            { sellerCompanyId: { in: accessibleCompanyIds } },
          ],
        },
        include: {
          sellerCompany: {
            include: { bankAccounts: true },
          },
          payments: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    ]);

    const defaultCompany = allCompanies.find((c) => c.isDefault) ?? allCompanies[0] ?? null;

    return json({
      company: defaultCompany ? defaultCompany : (companySettings ? companyToDto(companySettings) : null),
      companies: allCompanies,
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
