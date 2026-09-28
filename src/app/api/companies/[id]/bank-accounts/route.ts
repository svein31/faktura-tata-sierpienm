import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson, cleanStr } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { companyBankAccountToDto } from "@/lib/dto";
import { validateAccountNumber, isValidSwiftBic } from "@/lib/banking/validation";
import { recordAuditLog } from "@/lib/audit";
import { accountConflictsWithAnotherCompany } from "@/lib/company-bank-account-scope";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/companies/[id]/bank-accounts — Pobieranie listy rachunków bankowych firmy
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const companyId = (await params).id;
    const access = await requireCompanyAccess(user.id, companyId);
    if (!access.ok) {
      return json({ error: access.error, code: access.code }, { status: access.status });
    }

    const accounts = await prisma.companyBankAccount.findMany({
      where: { companyId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    const profiles = await prisma.companyProfile.findMany({
      where: { userId: access.membership.company.userId }, select: { id: true, bankAccount: true, companyName: true },
    });
    return json({ accounts: accounts.filter(account =>
      !accountConflictsWithAnotherCompany(companyId, account.accountNumber, profiles, account.beneficiaryName),
    ).map(companyBankAccountToDto) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/companies/[id]/bank-accounts — Dodanie lub aktualizacja rachunku bankowego firmy
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const companyId = (await params).id;
    const access = await requireCompanyAccess(user.id, companyId, "canManageBankAccounts");
    if (!access.ok) {
      return json({ error: access.error, code: access.code }, { status: access.status });
    }

    const body = await readJson(req);
    const accountName = cleanStr(body.accountName, 100, "accountName") || "Rachunek bieżący";
    const beneficiaryName = cleanStr(body.beneficiaryName, 250, "beneficiaryName") || access.membership.company.companyName;
    const currency = (cleanStr(body.currency, 10, "currency") || "PLN").toUpperCase();
    const isMultiCurrency = Boolean(body.isMultiCurrency);
    const accountNumberRaw = cleanStr(body.accountNumber, 64, "accountNumber");
    const swiftBicRaw = cleanStr(body.swiftBic, 20, "swiftBic");
    const bankName = cleanStr(body.bankName, 200, "bankName");
    const bankAddress = cleanStr(body.bankAddress, 300, "bankAddress") || null;
    const transferInstructions = cleanStr(body.transferInstructions, 1000, "transferInstructions") || null;
    const isDefault = Boolean(body.isDefault);

    if (!accountNumberRaw) {
      return json({ error: "Podaj numer rachunku bankowego lub IBAN." }, { status: 400 });
    }

    // Walidacja IBAN / numeru rachunku
    const accountValidation = validateAccountNumber(accountNumberRaw);
    if (!accountValidation.isValid) {
      return json({ error: accountValidation.error || "Nieprawidłowy format numeru rachunku." }, { status: 400 });
    }
    const profiles = await prisma.companyProfile.findMany({
      where: { userId: access.membership.company.userId }, select: { id: true, bankAccount: true, companyName: true },
    });
    if (accountConflictsWithAnotherCompany(companyId, accountValidation.normalized, profiles, beneficiaryName)) {
      return json({ error: "Ten rachunek jest już głównym kontem innej firmy. Przypisz właściwy rachunek do tej firmy." }, { status: 409 });
    }

    // Walidacja SWIFT / BIC jeśli podano
    if (swiftBicRaw && !isValidSwiftBic(swiftBicRaw)) {
      return json({ error: "Kod SWIFT/BIC musi składać się z 8 lub 11 znaków alfanumerycznych." }, { status: 400 });
    }

    // Jeśli rachunek ma być domyślny dla danej waluty, odznacz poprzednie domyślne
    if (isDefault) {
      await prisma.companyBankAccount.updateMany({
        where: { companyId, currency },
        data: { isDefault: false },
      });
    }

    const created = await prisma.companyBankAccount.create({
      data: {
        companyId,
        accountName,
        beneficiaryName,
        currency,
        isMultiCurrency,
        accountNumber: accountValidation.normalized,
        swiftBic: swiftBicRaw ? swiftBicRaw.toUpperCase() : null,
        bankName,
        bankAddress,
        transferInstructions,
        isDefault,
      },
    });

    // Zapis w historii audytowej
    await recordAuditLog({
      companyId,
      userId: user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: "bank_account_create",
      entityType: "bank_account",
      entityId: created.id,
      description: `${user.name || user.email} dodał(a) rachunek bankowy ${accountName} (${currency} - ${accountValidation.normalized})`,
      details: { accountName, currency, accountNumber: accountValidation.normalized, bankName },
    });

    return json({ account: companyBankAccountToDto(created) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * DELETE /api/companies/[id]/bank-accounts?accountId=... — Usunięcie rachunku bankowego
 */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const companyId = (await params).id;
    const access = await requireCompanyAccess(user.id, companyId, "canManageBankAccounts");
    if (!access.ok) {
      return json({ error: access.error, code: access.code }, { status: access.status });
    }

    const url = new URL(req.url);
    const accountId = url.searchParams.get("accountId");
    if (!accountId) {
      return json({ error: "Brak identyfikatora rachunku." }, { status: 400 });
    }

    const account = await prisma.companyBankAccount.findFirst({
      where: { id: accountId, companyId },
    });
    if (!account) {
      return json({ error: "Nie znaleziono rachunku bankowego.", code: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.companyBankAccount.delete({ where: { id: account.id } });

    // Zapis w historii audytowej
    await recordAuditLog({
      companyId,
      userId: user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: "bank_account_delete",
      entityType: "bank_account",
      entityId: account.id,
      description: `${user.name || user.email} usunął(a) rachunek bankowy ${account.accountName} (${account.currency})`,
      details: { accountName: account.accountName, currency: account.currency, accountNumber: account.accountNumber },
    });

    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
