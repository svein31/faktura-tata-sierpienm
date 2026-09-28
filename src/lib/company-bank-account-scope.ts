/** Keep legacy extra accounts out of a second company when the account is
 * already the primary account of another accessible profile. */
export function normalizedBankAccount(value: string | null | undefined): string {
  const normalized = (value || "").replace(/\s+/g, "").toUpperCase();
  return /^PL\d{26}$/.test(normalized) ? normalized.slice(2) : normalized;
}

export function accountConflictsWithAnotherCompany(
  companyId: string,
  accountNumber: string,
  profiles: { id: string; bankAccount?: string | null; companyName?: string | null }[],
  beneficiaryName?: string | null,
): boolean {
  const account = normalizedBankAccount(accountNumber);
  const beneficiary = (beneficiaryName || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pl-PL");
  const currentName = profiles.find(profile => profile.id === companyId)?.companyName?.trim().replace(/\s+/g, " ").toLocaleUpperCase("pl-PL");
  return profiles.some(profile => profile.id !== companyId && (
    (Boolean(account) && normalizedBankAccount(profile.bankAccount) === account) ||
    (Boolean(beneficiary) && beneficiary !== currentName && Boolean(profile.companyName) && (profile.companyName || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pl-PL") === beneficiary)
  ));
}
