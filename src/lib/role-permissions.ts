import type {CompanyRole,CompanyPermissions} from "./types";
const none:CompanyPermissions={canIssueInvoices:false,canCreateCorrections:false,canRecordPayments:false,canExport:false,canSendKsef:false,canManageBankAccounts:false,canManageTeam:false,canManageIntegrations:false};
const all=Object.fromEntries(Object.keys(none).map(key=>[key,true])) as unknown as CompanyPermissions;
export const DEFAULT_ROLE_PERMISSIONS:Record<CompanyRole,CompanyPermissions>={owner:{...all},admin:{...all},sales:{...none,canIssueInvoices:true},accountant:{...none,canRecordPayments:true,canExport:true},employee:{...none,canIssueInvoices:true,canSendKsef:true},viewer:{...none}};
export const ROLE_LABELS:Record<CompanyRole,string>={owner:"Właściciel",admin:"Administrator",sales:"Dział sprzedaży",accountant:"Księgowa / Biuro",employee:"Pracownik",viewer:"Podgląd (Odczyt)"};
