/** Keep legacy extra accounts out of a second company when the account is
 * already the primary or active account of another accessible profile, or when
 * an auto-migrated "Konto podstawowe" row fell out of sync with `company.bankAccount`. */
export function normalizedBankAccount(value: string | null | undefined): string {
  const normalized = (value || "").replace(/\s+/g, "").toUpperCase();
  return /^PL\d{26}$/.test(normalized) ? normalized.slice(2) : normalized;
}

export function isStaleMigratedBankAccount(
  account: { accountName?: string | null; bankName?: string | null; accountNumber?: string | null },
  primaryBankAccount?: string | null,
): boolean {
  const primary = normalizedBankAccount(primaryBankAccount);
  const accNum = normalizedBankAccount(account.accountNumber);
  if (!primary || !accNum || primary === accNum) return false;
  return (account.accountName || "").trim() === "Konto podstawowe" &&
    (account.bankName || "").trim() === "Rachunek bieżący";
}

export function accountConflictsWithAnotherCompany(
  companyId: string,
  accountNumber: string,
  profiles: {
    id: string;
    bankAccount?: string | null;
    companyName?: string | null;
    bankAccounts?: { accountNumber?: string | null; accountName?: string | null; bankName?: string | null }[] | null;
  }[],
  beneficiaryName?: string | null,
): boolean {
  const account = normalizedBankAccount(accountNumber);
  const beneficiary = (beneficiaryName || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pl-PL");
  const currentName = profiles.find(profile => profile.id === companyId)?.companyName?.trim().replace(/\s+/g, " ").toLocaleUpperCase("pl-PL");
  return profiles.some(profile => profile.id !== companyId && (
    (Boolean(account) && normalizedBankAccount(profile.bankAccount) === account) ||
    (Boolean(account) && (profile.bankAccounts || []).some(otherAcc =>
      !isStaleMigratedBankAccount(otherAcc, profile.bankAccount) &&
      normalizedBankAccount(otherAcc.accountNumber) === account
    )) ||
    (Boolean(beneficiary) && beneficiary !== currentName && Boolean(profile.companyName) && (profile.companyName || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pl-PL") === beneficiary)
  ));
}
