import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

/** Resolve the bank account from the seller, never from a client-supplied snapshot. */
export async function invoiceBankAccountForCompany(companyId: string | null, bankAccountId: string | null) {
  if (!bankAccountId) {
    return { bankAccountId: null, bankAccountSnapshot: Prisma.JsonNull };
  }
  if (!companyId || !/^[a-f\d]{24}$/i.test(bankAccountId)) {
    throw new ApiError(400, "Wybierz rachunek należący do firmy wystawiającej fakturę.");
  }
  const account = await prisma.companyBankAccount.findFirst({
    where: { id: bankAccountId, companyId },
  });
  if (!account) throw new ApiError(400, "Wybierz rachunek należący do firmy wystawiającej fakturę.");
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
