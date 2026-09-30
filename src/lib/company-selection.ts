import type { CompanyProfile, Invoice, KsefSettings } from "./types";

export function resolveSelectedCompany(companies: CompanyProfile[], selectedId: string | null, fallback: CompanyProfile | null = null): CompanyProfile | null {
  return companies.find((c) => c.id === selectedId) ?? companies.find((c) => c.isDefault) ?? companies[0] ?? fallback;
}

export function invoicesForCompany(invoices: Invoice[], companyId: string | null): Invoice[] {
  return invoices.filter((invoice) => (invoice.sellerCompanyId || null) === companyId);
}

export function companyKsefSettings(company:CompanyProfile|null,settings:KsefSettings|null):KsefSettings|null {
 if(!company&&!settings)return null;
 return {environment:company?.ksefEnvironment||settings?.environment||"demo",tokenSet:Boolean(company?.ksefTokenSet),tokenMask:"",certName:settings?.certName||"",autoValidate:settings?.autoValidate!==false};
}
