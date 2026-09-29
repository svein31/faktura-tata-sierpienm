import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { accountConflictsWithAnotherCompany } from "@/lib/company-bank-account-scope";
import { defaultCompanyBankAccount } from "@/lib/company-default-bank-account";

/** Resolve the bank account from the seller, never from a client-supplied snapshot. */
export async function invoiceBankAccountForCompany(companyId: string | null, bankAccountId: string | null, currency = "PLN", usePrimary = false) {
  if (!companyId && !bankAccountId) return { bankAccountId: null, bankAccountSnapshot: null };
  if (!companyId || (bankAccountId && !/^[a-f\d]{24}$/i.test(bankAccountId))) {
    throw new ApiError(400, "Wybierz rachunek należący do firmy wystawiającej fakturę.");
  }
  const company = await prisma.companyProfile.findUnique({ where: { id: companyId }, include: { bankAccounts: true } });
  if (!company) throw new ApiError(400, "Nie znaleziono firmy wystawiającej fakturę.");
  const profiles = await prisma.companyProfile.findMany({
    where: { userId: company.userId }, select: { id: true, bankAccount: true, companyName: true },
  });
  const ownAccounts = company.bankAccounts.filter(account => !accountConflictsWithAnotherCompany(companyId, account.accountNumber, profiles, account.beneficiaryName));
  const account = bankAccountId ? company.bankAccounts.find(item => item.id === bankAccountId)
    : usePrimary ? undefined : defaultCompanyBankAccount(companyId, ownAccounts, currency) ?? (!company.bankAccount ? ownAccounts[0] : undefined);
  if (bankAccountId && !account) throw new ApiError(400, "Wybierz rachunek należący do firmy wystawiającej fakturę.");
  if (!account) {
    if (company.bankAccount && accountConflictsWithAnotherCompany(companyId, company.bankAccount, profiles)) throw new ApiError(400, "Główny rachunek jest przypisany do innej firmy.");
    return { bankAccountId: null, bankAccountSnapshot: company.bankAccount ? {
      companyId, accountName: "Główny rachunek firmy", beneficiaryName: company.companyName,
      currency: "PLN", accountNumber: company.bankAccount, bankName: "",
    } : null };
  }
  if (accountConflictsWithAnotherCompany(companyId, account.accountNumber, profiles, account.beneficiaryName)) {
    throw new ApiError(400, "Ten rachunek jest przypisany jako główny do innej firmy. Wybierz rachunek tej firmy.");
  }
  return {
    bankAccountId: account.id,
    bankAccountSnapshot: {
      id: account.id,
      companyId: account.companyId,
      accountName: account.accountName,
      beneficiaryName: account.beneficiaryName,
      currency: account.currency,
      accountNumber: account.accountNumber,
      swiftBic: account.swiftBic,
      bankName: account.bankName,
    },
  };
}
