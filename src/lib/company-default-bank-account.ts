/** The explicit default for the invoice currency wins over the legacy primary field. */
export function defaultCompanyBankAccount<T extends {
  id: string; companyId: string; currency: string; isDefault: boolean; isMultiCurrency?: boolean;
}>(companyId: string, accounts: T[], currency: string, hasPrimary = false): T | undefined {
  const own = accounts.filter(account => account.companyId === companyId);
  const exact = own.filter(account => account.currency === currency);
  const multi = own.filter(account => account.currency === "MULTI" || account.isMultiCurrency);
  return exact.find(account => account.isDefault) ?? multi.find(account => account.isDefault)
    ?? ((currency !== "PLN" || !hasPrimary) ? exact[0] ?? multi[0] : undefined)
    ?? own.find(account => account.currency === "PLN" && account.isDefault)
    ?? (!hasPrimary ? own[0] : undefined);
}
