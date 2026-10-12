import { filterCompanyIdsByMfa, catalogWhere } from "@/lib/company-scope";
import { accountConflictsWithAnotherCompany } from "@/lib/company-bank-account-scope";
import { prisma } from "@/lib/db";
import { getApiSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import {
  companyBankAccountToDto,
  companyProfileToDto,
  companyToDto,
  contractorToDto,
  ksefToDto,
  notificationToDto,
  prefsToDto,
  productToDto,
} from "@/lib/dto";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { CompanyRole } from "@/lib/types";
import { invoiceBootstrapScope, readInvoiceSummaries } from "@/lib/invoice-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/data — bootstrap całego stanu zalogowanego użytkownika.
 * Zwraca firmy własne oraz firmy, w których użytkownik jest członkiem zespołu
 * (księgowa, pracownik, podgląd) wraz z rolami i uprawnieniami w każdej z nich.
 */
export async function GET(req: Request) {
  const listMode = new URL(req.url).searchParams.get("invoiceMode") === "list";
  try {
    const user = await getApiSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    // 1. Pobierz członkostwa w zespołach
    const [memberships, initialOwnedCompanies, companySettings, ksef, notifications, prefs] = await Promise.all([
      prisma.companyMember.findMany({
        where: { userId: user.id },
        include: {
          company: {
            include: { bankAccounts: true },
          },
        },
      }),

    // 2. Pobierz profile własne
      prisma.companyProfile.findMany({
        where: { userId: user.id },
        include: { bankAccounts: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      }),
      prisma.companySettings.findUnique({ where: { userId: user.id } }),
      // User-only settings do not depend on company access or linked contacts.
      // Resolve them alongside profiles instead of adding a later query wave.
      prisma.ksefSettings.findUnique({ where: { userId: user.id } }),
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    ]);
    let ownedCompanies = initialOwnedCompanies;

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
    const profiles = [...ownedCompanies, ...memberships.map(m => m.company).filter(Boolean)];
    const scopedAccounts = (company: typeof ownedCompanies[number]) =>
      (company.bankAccounts || [])
        .filter(account => !accountConflictsWithAnotherCompany(company.id, account.accountNumber, profiles, account.beneficiaryName))
        .map(companyBankAccountToDto);

    for (const oc of ownedCompanies) {
      const dto = companyProfileToDto(oc);
      dto.currentUserRole = "owner";
      dto.currentUserPermissions = { ...DEFAULT_ROLE_PERMISSIONS.owner };
      dto.bankAccounts = scopedAccounts(oc);
      companyMap.set(oc.id, dto);
    }

    for (const m of memberships) {
      const role=m.role as CompanyRole;
      if(!Object.hasOwn(DEFAULT_ROLE_PERMISSIONS,role)){companyMap.delete(m.companyId);continue;}
      const dto=companyMap.get(m.companyId)||companyProfileToDto(m.company);
      dto.currentUserRole=role;
      dto.bankAccounts=scopedAccounts(m.company);
      const defaults=DEFAULT_ROLE_PERMISSIONS[role];
      dto.currentUserPermissions=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,role==="owner"?true:(m as any)[key]??value])) as typeof defaults;
      companyMap.set(m.companyId,dto);
    }

    const permitted = new Set(await filterCompanyIdsByMfa(user.id, [...companyMap.keys()]));
    const allCompanies = Array.from(companyMap.values()).filter(c => permitted.has(c.id));
    const accessibleCompanyIds = allCompanies.map((c) => c.id);
    // Pobierz powiązane dane (faktury, kontrahenci, produkty itp.)
    const [contractors, products, invoices] = await Promise.all([
      (async () => {
        const linkedContacts = accessibleCompanyIds.length ? await prisma.invoice.groupBy({
          by: ["contractorId"], where: { sellerCompanyId: { in: accessibleCompanyIds } },
        }) : [];
        const linkedContactIds = linkedContacts.map(i => i.contractorId).filter((id): id is string => Boolean(id));
        return prisma.contractor.findMany({
          where: { OR: [catalogWhere(user.id, accessibleCompanyIds), { id: { in: linkedContactIds }, OR: [{ companyId: null }, { companyId: { isSet: false } }] }] },
          orderBy: { createdAt: "desc" },
        });
      })(),
      prisma.product.findMany({
        where: catalogWhere(user.id, accessibleCompanyIds),
        orderBy: { createdAt: "desc" },
      }),
      listMode ? Promise.resolve([]) : readInvoiceSummaries(prisma, invoiceBootstrapScope(user.id, accessibleCompanyIds)),
    ]);

    const defaultCompany = allCompanies.find((c) => c.isDefault) ?? allCompanies[0] ?? null;

    return json({
      company: defaultCompany ? defaultCompany : (companySettings ? companyToDto(companySettings) : null),
      companies: allCompanies,
      ksef: ksef ? ksefToDto(ksef) : null,
      contractors: contractors.map(contractorToDto),
      products: products.map(productToDto),
      invoices,
      notifications: notifications.map(notificationToDto),
      notificationPrefs: prefsToDto(prefs),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
