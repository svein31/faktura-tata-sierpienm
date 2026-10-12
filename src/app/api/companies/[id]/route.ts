import { requireRecentAuth } from "@/lib/security-policy";
import { recordAuditLog, buildFieldDiff } from "@/lib/audit";
import { getCompanyMembership } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyProfileToDto } from "@/lib/dto";
import { parseCompanyProfileBody } from "@/lib/parsers";
import { accountConflictsWithAnotherCompany, normalizedBankAccount } from "@/lib/company-bank-account-scope";
import { validateInlineLogoForStorage } from "@/lib/pdf/png-embedding";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/companies/[id]
 * Pobiera szczegóły profilu firmy (tylko własny rekord).
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    if (!/^[0-9a-fA-F]{24}$/.test((await params).id)) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    const membership = await getCompanyMembership(user.id, (await params).id);
    if (!membership) return json({ error: "Nie znaleziono firmy." }, { status: 404 });
    const company = await prisma.companyProfile.findUnique({ where: { id: membership.company.id } });
    if (!company) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    return json({ company: companyProfileToDto(company) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * PUT /api/companies/[id]
 * Aktualizuje dane firmy (NIP, adres, nr konta, token KSeF, status domyślnej).
 */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    if (!/^[0-9a-fA-F]{24}$/.test((await params).id)) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    const existing = await prisma.companyProfile.findFirst({
      where: { id: (await params).id, userId: user.id },
    });
    if (!existing) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await readJson(req);
    if (Object.hasOwn(body, "ksefToken")) await requireRecentAuth(user.id);
    const data = parseCompanyProfileBody(body);
    await validateInlineLogoForStorage(data.logoUrl);
    if (data.bankAccount && normalizedBankAccount(data.bankAccount) !== normalizedBankAccount(existing.bankAccount)) {
      const profiles = await prisma.companyProfile.findMany({
        where: { userId: user.id }, select: { id: true, bankAccount: true, companyName: true },
      });
      if (accountConflictsWithAnotherCompany(existing.id, data.bankAccount, profiles)) {
        throw new ApiError(409, "Ten rachunek jest już głównym kontem innej firmy.");
      }
    }

    // Sprawdzenie czy NIP nie koliduje z inną firmą tego użytkownika
    if (data.nip !== existing.nip) {
      const duplicateNip = await prisma.companyProfile.findFirst({
        where: {
          userId: user.id,
          nip: data.nip,
          id: { not: existing.id },
        },
      });
      if (duplicateNip) {
        throw new ApiError(400, "Posiadasz już inny profil firmy z tym numerem NIP.");
      }
    }

    const updated = await prisma.$transaction(async tx => {
      if (data.isDefault && !existing.isDefault) await tx.companyProfile.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      const company = await tx.companyProfile.update({ where: { id: existing.id }, data });
      const { diff } = buildFieldDiff(existing, company, { companyName: "Nazwa", nip: "NIP", street: "Ulica", city: "Miasto", postalCode: "Kod pocztowy", ksefToken: "Token KSeF", isDefault: "Firma domyślna" });
      await recordAuditLog({ client: tx, companyId: company.id, userId: user.id, userName: user.name, userEmail: user.email,
        action: "company_updated", entityType: "company", entityId: company.id, diff });
      return company;
    });

    return json({ company: companyProfileToDto(updated) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * DELETE /api/companies/[id]
 * Usuwa profil firmy (jeśli nie ma powiązanych wystawionych faktur).
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    if (!/^[0-9a-fA-F]{24}$/.test((await params).id)) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    const existing = await prisma.companyProfile.findFirst({
      where: { id: (await params).id, userId: user.id },
    });
    if (!existing) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    // Bezpieczeństwo relacji: sprawdzenie powiązanych faktur
    const linkedInvoicesCount = await prisma.invoice.count({
      where: { sellerCompanyId: existing.id },
    });
    if (linkedInvoicesCount > 0) {
      throw new ApiError(
        400,
        `Nie można usunąć profilu firmy (${existing.companyName}), ponieważ wystawiono z niego ${linkedInvoicesCount} faktur(y).`
      );
    }

    const businessRecords = await Promise.all([
      prisma.expense.count({where:{companyId:existing.id}}),
      prisma.offer.count({where:{companyId:existing.id}}),
      prisma.order.count({where:{companyId:existing.id}}),
      prisma.project.count({where:{companyId:existing.id}}),
      prisma.expenseScan.count({where:{companyId:existing.id}}),
      prisma.warehouse.count({where:{companyId:existing.id}}),
      prisma.accountingPeriod.count({where:{companyId:existing.id}}),
      prisma.jpkExport.count({where:{companyId:existing.id}}),
      prisma.costReview.count({where:{companyId:existing.id}}),
    ]);
    if (businessRecords.some(count=>count>0)) throw new ApiError(409, "Firma posiada dokumenty kosztowe, oferty, zlecenia lub inne dane robocze. Nie można jej usunąć bez uporządkowania tych danych.");

    const catalogCount = await prisma.contractor.count({ where: { companyId: existing.id } }) + await prisma.product.count({ where: { companyId: existing.id } });
    if (catalogCount) throw new ApiError(409, "Firma posiada katalog kontrahentów lub produktów. Usuń nieużywane rekordy przed usunięciem profilu.");
    await prisma.$transaction(async (tx) => {
      await recordAuditLog({ client: tx, companyId: existing.id, userId: user.id, userName: user.name, userEmail: user.email,
        action: "company_deleted", entityType: "company", entityId: existing.id, details: { companyName: existing.companyName, nip: existing.nip } });
      await tx.companyProfile.delete({ where: { id: existing.id } });

      // Jeśli usunięta firma była domyślna, ustaw kolejną jako domyślną
      if (existing.isDefault) {
        const remaining = await tx.companyProfile.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });
        if (remaining) {
          await tx.companyProfile.update({
            where: { id: remaining.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
