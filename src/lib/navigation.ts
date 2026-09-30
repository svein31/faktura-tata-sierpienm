import type { CompanyProfile } from "./types";
export type NavigationGroup = { id: string; label: string; items: {href:string;label:string}[] };
const group = (id:string,label:string,items:string[][]):NavigationGroup => ({id,label,items:items.map(([href,label])=>({href,label}))});
export const NAVIGATION: NavigationGroup[] = [
 group("dashboard","Pulpit",[["/dashboard","Podsumowanie"],["/analytics","Analityka"],["/calendar","Terminarz płatności"]]),
 group("sales","Dokumenty",[["/invoices","Faktury"],["/advances","Proformy i zaliczki"],["/offers","Oferty"],["/recurring","Cykliczne"],["/reminders","Przypomnienia"],["/ksef","KSeF"]]),
 group("expenses","Wydatki",[["/expenses","Koszty"],["/documents","Skrzynka i skaner OCR"],["/cost-reviews","Obieg i akceptacje"],["/finances","Bank i rozliczenia"]]),
 group("contacts","Kontrahenci",[["/contractors","Kontrahenci"]]),
 group("warehouse","Magazyn i usługi",[["/products","Produkty i usługi"],["/warehouse","Magazyn"]]),
 group("projects","Projekty i czas",[["/orders","Zlecenia i czas"],["/projects","Rentowność"]]),
 group("accounting","Zespół i księgowość",[["/accountant/portal","Portal księgowy"],["/accountant","Zamknięcie i eksporty"],["/jpk","JPK"],["/tax-estimate","Prognoza B2B / CIT"],["/settings/team","Zespół i uprawnienia"],["/audit","Dziennik zmian"]]),
 group("settings","Ustawienia",[["/settings/companies","Firmy i rachunki"],["/settings/appearance","Wygląd"],["/settings/pdf-templates","Szablony PDF"],["/settings/currencies","Waluty i kursy NBP"],["/settings/integrations","API i integracje"],["/settings/health","Stan przetwarzania"],["/settings/account","Konto i bezpieczeństwo"],["/help","Pomoc i informacje prawne"]]),
];
export function currentNavigation(pathname:string,groups=NAVIGATION) {
 return groups.flatMap(group=>group.items.map(item=>({group,item}))).filter(({item})=>pathname===item.href||pathname.startsWith(item.href+"/")).sort((a,b)=>b.item.href.length-a.item.href.length)[0];
}
export function navigationForCompany(company?:Pick<CompanyProfile,"currentUserRole"|"currentUserPermissions">|null) {
 if(company?.currentUserRole!=="accountant")return NAVIGATION;
 const paths=new Set(["/accountant/portal","/invoices","/expenses","/documents","/cost-reviews","/finances","/accountant","/jpk","/tax-estimate","/audit","/ksef","/settings/account","/settings/companies","/settings/appearance","/help"]);
 if(company.currentUserPermissions?.canManageIntegrations)paths.add("/settings/integrations");
 if(company.currentUserPermissions?.canManageTeam)paths.add("/settings/team");
 return NAVIGATION.filter(g=>["dashboard","sales","expenses","accounting","settings"].includes(g.id)).map(g=>({...g,label:g.id==="dashboard"?"Pulpit księgowy":g.label,items:g.id==="dashboard"?[{href:"/accountant/portal",label:"Dokumenty do weryfikacji"}]:g.items.filter(i=>paths.has(i.href)&&i.href!=="/accountant/portal")})).filter(g=>g.items.length);
}
