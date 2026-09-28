import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { accountConflictsWithAnotherCompany } from "@/lib/company-bank-account-scope";

/** Resolve the bank account from the seller, never from a client-supplied snapshot. */
export async function invoiceBankAccountForCompany(companyId: string | null, bankAccountId: string | null) {
  if (!bankAccountId) {
    return { bankAccountId: null, bankAccountSnapshot: null };
  }
  if (!companyId || !/^[a-f\d]{24}$/i.test(bankAccountId)) {
    throw new ApiError(400, "Wybierz rachunek należący do firmy wystawiającej fakturę.");
  }
  const account = await prisma.companyBankAccount.findFirst({
    where: { id: bankAccountId, companyId },
  });
  if (!account) throw new ApiError(400, "Wybierz rachunek należący do firmy wystawiającej fakturę.");
  const company = await prisma.companyProfile.findUnique({ where: { id: companyId }, select: { userId: true } });
  if (!company) throw new ApiError(400, "Nie znaleziono firmy wystawiającej fakturę.");
  const profiles = await prisma.companyProfile.findMany({
    where: { userId: company.userId }, select: { id: true, bankAccount: true, companyName: true },
  });
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
