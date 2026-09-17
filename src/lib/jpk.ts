import { ApiError, cleanStr } from "./api";
import { invoiceTotals, lineNet, lineVat, round2 } from "./format";
import { isIsoCalendarDate, convertToPln } from "./nbp";
import { isValidNipFormat } from "./validation";
import { isValidEmail } from "./email/validation";
import officeCodes from "./jpk-office-codes.json";
import type { Invoice, Contractor, CompanyProfile } from "./types";
export const xmlEscape = (value: unknown) => String(value ?? "").replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]!));
const tag = (name: string,value: unknown) => `<${name}>${xmlEscape(value)}</${name}>`;
const money = (n: number) => { if (!Number.isFinite(n) || Math.abs(n)>1e12) throw new ApiError(400,"Nieprawidłowa kwota JPK."); return round2(n).toFixed(2); };
const text = (value: unknown,name: string,max=200) => {const result=cleanStr(value,max,name);if(!result || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(result))throw new ApiError(400,`Uzupełnij poprawne pole ${name}.`);return result;};
export interface JpkOptions { format:"fa"|"vat"; dateFrom:string; dateTo:string; office:string; email:string; currency:string; individual:boolean; firstName:string; lastName:string; birthDate:string; address:Record<string,string>; exemptionBasis:string; normalDomestic:boolean; fullDeduction:boolean; noSpecialCodes:boolean; nonKsefCode:"BFK"|"OFF"|"DI" }
export function parseJpkOptions(body:Record<string,unknown>):JpkOptions {
 const format=body.format;if(format!=="fa"&&format!=="vat")throw new ApiError(400,"Nieznany format JPK.");
 const dateFrom=String(body.dateFrom||""),dateTo=String(body.dateTo||"");
 if(!isIsoCalendarDate(dateFrom)||!isIsoCalendarDate(dateTo)||dateFrom>dateTo)throw new ApiError(400,"Nieprawidłowy okres.");
 const office=String(body.office||"");if(!officeCodes.includes(office))throw new ApiError(400,"Nieprawidłowy kod urzędu skarbowego.");
 if(body.normalDomestic!==true)throw new ApiError(400,"Eksport wymaga potwierdzenia zwykłych transakcji krajowych, bez procedur szczególnych.");
 if(format==="vat"&&(dateFrom<"2026-02-01"||dateFrom.slice(0,7)!==dateTo.slice(0,7)||dateFrom.slice(8)!=="01"||new Date(Date.UTC(Number(dateTo.slice(0,4)),Number(dateTo.slice(5,7)),0)).toISOString().slice(0,10)!==dateTo))throw new ApiError(400,"JPK_V7M(3): wybierz pełny miesiąc od lutego 2026.");
 const currency=String(body.currency||"PLN");if(!/^[A-Z]{3}$/.test(currency))throw new ApiError(400,"Nieprawidłowa waluta.");
 const email=String(body.email||"").trim();if(format==="vat"&&!isValidEmail(email))throw new ApiError(400,"Podaj e-mail podatnika.");
 const individual=body.individual===true,firstName=cleanStr(body.firstName,30,"imię"),lastName=cleanStr(body.lastName,81,"nazwisko"),birthDate=String(body.birthDate||"");
 if(format==="vat"&&individual&&(!firstName||!lastName||!isIsoCalendarDate(birthDate)))throw new ApiError(400,"Uzupełnij imię, nazwisko i datę urodzenia podatnika.");
 const raw=(body.address && typeof body.address==="object" ? body.address : {}) as Record<string,unknown>, address:Record<string,string>={};
 if(format==="fa") {
  for(const name of ["Wojewodztwo","Powiat","Gmina","NrDomu","Miejscowosc","KodPocztowy"])address[name]=text(raw[name],name,name==="NrDomu"?9:56);
  for(const name of ["Ulica","NrLokalu"])address[name]=cleanStr(raw[name],name==="NrLokalu"?10:65,name);
  if(!/^\d{2}-\d{3}$/.test(address.KodPocztowy))throw new ApiError(400,"Nieprawidłowy kod pocztowy.");
 }
 const nonKsefCode=String(body.nonKsefCode||"");if(format==="vat"&&!["BFK","OFF","DI"].includes(nonKsefCode))throw new ApiError(400,"Wybierz oznaczenie dokumentów bez numeru KSeF.");
 return {format,dateFrom,dateTo,office,email,currency,individual,firstName,lastName,birthDate,address,exemptionBasis:cleanStr(body.exemptionBasis,500,"podstawa zwolnienia"),normalDomestic:true,fullDeduction:body.fullDeduction===true,noSpecialCodes:body.noSpecialCodes===true,nonKsefCode:nonKsefCode as JpkOptions["nonKsefCode"]};
}
function validateInvoice(invoice:Invoice,buyer:Contractor|undefined) {
 if(!buyer || (buyer.country||buyer.address.country||"PL")!=="PL" || !isValidNipFormat(buyer.nip))throw new ApiError(400,`${invoice.number}: eksport podstawowy wymaga krajowego kontrahenta z poprawnym NIP.`);
 if(!isIsoCalendarDate(invoice.issueDate)||!isIsoCalendarDate(invoice.saleDate))throw new ApiError(400,`${invoice.number}: nieprawidłowa data.`);
 text(invoice.number,"numer faktury",256);text(buyer.name,"nazwa kontrahenta",256);
 if(!invoice.lines.length || invoice.lines.some(l=>!["23","8","5","0","zw"].includes(l.vatRate)||!Number.isFinite(l.quantity)||!Number.isFinite(l.netPrice)))throw new ApiError(400,`${invoice.number}: nieobsługiwana stawka lub pozycja JPK.`);
 if(invoice.isCorrection && !invoice.originalInvoiceNumber)throw new ApiError(400,`${invoice.number}: brak numeru korygowanej faktury.`);
 return buyer;
}
function pln(invoice:Invoice,value:number) {
 if(invoice.currency==="PLN")return round2(value);
 if(!invoice.exchangeRate || invoice.exchangeRate<=0 || !Number.isFinite(invoice.exchangeRate))throw new ApiError(400,`${invoice.number}: brak zapisanego kursu.`);
 return convertToPln(value,invoice.exchangeRate,invoice.exchangeRateUnit||1);
}
function rates(invoice:Invoice){const result:Record<string,{net:number;vat:number}>={};for(const l of invoice.lines){const r=result[l.vatRate]||{net:0,vat:0};r.net=round2(r.net+lineNet(l));r.vat=round2(r.vat+lineVat(l));result[l.vatRate]=r;}return result;}
export function buildJpk(invoices:Invoice[],contractors:Contractor[],company:CompanyProfile,o:JpkOptions,now=new Date()) {
 if(!isValidNipFormat(company.nip))throw new ApiError(400,"Uzupełnij NIP firmy.");text(company.companyName,"nazwa firmy",240);
 const map=new Map(contractors.map(c=>[c.id,c]));
 const rows=invoices.filter(i=>!i.isProforma&&i.status!=="draft"&&i.documentStatus!=="draft"&&i.documentStatus!=="cancelled"&&(o.format!=="fa"||(i.type==="sale"&&i.currency===o.currency)));
 for(const row of rows)validateInvoice(row,map.get(row.contractorId));
 const namespace=o.format==="fa"?"http://jpk.mf.gov.pl/wzor/2022/02/17/02171/":"http://crd.gov.pl/wzor/2025/12/19/14090/";
 const etd=o.format==="fa"?"http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2018/08/24/eD/DefinicjeTypy/":"http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/09/13/eD/DefinicjeTypy/";
 const start=`<?xml version="1.0" encoding="UTF-8"?><JPK xmlns="${namespace}" xmlns:etd="${etd}">`;
 if(o.format==="fa") {
  if(!rows.length)throw new ApiError(400,"Brak wystawionych faktur sprzedaży w wybranej walucie i okresie.");
  const header=`<Naglowek><KodFormularza kodSystemowy="JPK_FA (4)" wersjaSchemy="1-0">JPK_FA</KodFormularza><WariantFormularza>4</WariantFormularza><CelZlozenia>1</CelZlozenia>${tag("DataWytworzeniaJPK",now.toISOString())}${tag("DataOd",o.dateFrom)}${tag("DataDo",o.dateTo)}${tag("KodUrzedu",o.office)}</Naglowek>`;
  const address=tag("etd:KodKraju","PL")+["Wojewodztwo","Powiat","Gmina","Ulica","NrDomu","NrLokalu","Miejscowosc","KodPocztowy"].map(k=>o.address[k]?tag(`etd:${k}`,o.address[k]):"").join("");
  const entity=`<Podmiot1><IdentyfikatorPodmiotu>${tag("NIP",company.nip)}${tag("PelnaNazwa",company.companyName)}</IdentyfikatorPodmiotu><AdresPodmiotu>${address}</AdresPodmiotu></Podmiot1>`;
  let total=0,totalLines=0,count=0;
  const documents=rows.map(i=>{
   const buyer=map.get(i.contractorId)!,r=rates(i),t=invoiceTotals(i);total=round2(total+t.gross);
   const summaries=["23","8","5"].map((rate,idx)=>r[rate]?tag(`P_13_${idx+1}`,money(r[rate].net))+tag(`P_14_${idx+1}`,money(r[rate].vat))+(i.currency!=="PLN"?tag(`P_14_${idx+1}W`,money(pln(i,r[rate].vat))):""):"").join("");
   if(r.zw&&!o.exemptionBasis)throw new ApiError(400,`${i.number}: uzupełnij podstawę zwolnienia VAT.`);
   return `<Faktura>${tag("KodWaluty",i.currency)}${tag("P_1",i.issueDate)}${tag("P_2A",i.number)}${tag("P_3A",buyer.name)}${tag("P_3B",`${buyer.address.street}, ${buyer.address.postal} ${buyer.address.city}`)}${tag("P_3C",company.companyName)}${tag("P_3D",`${o.address.Ulica||""} ${o.address.NrDomu}, ${o.address.KodPocztowy} ${o.address.Miejscowosc}`)}${tag("P_4B",company.nip)}${tag("P_5B",buyer.nip)}${tag("P_6",i.saleDate)}${summaries}${r['0']?tag("P_13_6",money(r['0'].net)):""}${r.zw?tag("P_13_7",money(r.zw.net)):""}${tag("P_15",money(t.gross))}<P_16>false</P_16><P_17>false</P_17><P_18>false</P_18><P_18A>false</P_18A>${tag("P_19",Boolean(r.zw))}${r.zw?tag("P_19A",o.exemptionBasis):""}<P_20>false</P_20><P_21>false</P_21><P_22>false</P_22><P_23>false</P_23><P_106E_2>false</P_106E_2><P_106E_3>false</P_106E_3>${tag("RodzajFaktury",i.isCorrection?"KOREKTA":i.documentKind==="advance"?"ZAL":"VAT")}${i.isCorrection?tag("PrzyczynaKorekty",i.correctionReason||"Korekta")+tag("NrFaKorygowanej",i.originalInvoiceNumber):""}${i.settlementMetadata?.advances.length?tag("NrFaZaliczkowej",i.settlementMetadata.advances.map(a=>a.number).join(", ")):""}</Faktura>`;
  }).join("");
  const lines=rows.flatMap(i=>i.lines.map(l=>{count++;totalLines=round2(totalLines+lineNet(l));return `<FakturaWiersz>${tag("P_2B",i.number)}${tag("P_7",text(l.name,"nazwa pozycji",256))}${tag("P_8A",l.unit)}${tag("P_8B",l.quantity)}${tag("P_9A",money(l.netPrice))}${tag("P_11",money(lineNet(l)))}${tag("P_12",l.vatRate)}</FakturaWiersz>`;})).join("");
  const orders=rows.filter(i=>i.documentKind==="advance"&&i.settlementMetadata);
  const ordersXml=orders.map(i=>`<Zamowienie>${tag("P_2AZ",i.number)}${tag("WartoscZamowienia",money(invoiceTotals({lines:i.settlementMetadata!.orderLines}).gross))}${i.settlementMetadata!.orderLines.map(l=>`<ZamowienieWiersz>${tag("P_7Z",l.name)}${tag("P_8AZ",l.unit)}${tag("P_8BZ",l.quantity)}${tag("P_9AZ",money(l.netPrice))}${tag("P_11NettoZ",money(lineNet(l)))}${tag("P_11VatZ",money(lineVat(l)))}${tag("P_12Z",l.vatRate)}</ZamowienieWiersz>`).join("")}</Zamowienie>`).join("");
  const orderCtrl=orders.length?`<ZamowienieCtrl>${tag("LiczbaZamowien",orders.length)}${tag("WartoscZamowien",money(orders.reduce((sum,i)=>sum+invoiceTotals({lines:i.settlementMetadata!.orderLines}).gross,0)))}</ZamowienieCtrl>`:"";
  return start+header+entity+documents+`<FakturaCtrl>${tag("LiczbaFaktur",rows.length)}${tag("WartoscFaktur",money(total))}</FakturaCtrl>`+lines+`<FakturaWierszCtrl>${tag("LiczbaWierszyFaktur",count)}${tag("WartoscWierszyFaktur",money(totalLines))}</FakturaWierszCtrl>${ordersXml}${orderCtrl}</JPK>`;
 }
 if(!o.noSpecialCodes)throw new ApiError(400,"Potwierdź brak obowiązku GTU i procedur szczególnych dla tego eksportu.");
 if(rows.some(i=>i.type==="purchase")&&!o.fullDeduction)throw new ApiError(400,"Potwierdź pełne odliczenie VAT i brak środków trwałych w zakupach.");
 const header=`<Naglowek><KodFormularza kodSystemowy="JPK_V7M (3)" wersjaSchemy="1-0E">JPK_VAT</KodFormularza><WariantFormularza>3</WariantFormularza>${tag("DataWytworzeniaJPK",now.toISOString())}<NazwaSystemu>FakturaProsto</NazwaSystemu><CelZlozenia poz="P_7">1</CelZlozenia>${tag("KodUrzedu",o.office)}${tag("Rok",o.dateFrom.slice(0,4))}${tag("Miesiac",Number(o.dateFrom.slice(5,7)))}</Naglowek>`;
 const person=o.individual?`<OsobaFizyczna>${tag("etd:NIP",company.nip)}${tag("etd:ImiePierwsze",o.firstName)}${tag("etd:Nazwisko",o.lastName)}${tag("etd:DataUrodzenia",o.birthDate)}${tag("Email",o.email)}</OsobaFizyczna>`:`<OsobaNiefizyczna>${tag("NIP",company.nip)}${tag("PelnaNazwa",company.companyName)}${tag("Email",o.email)}</OsobaNiefizyczna>`;
 let saleCount=0,purchaseCount=0,saleVat=0,purchaseVat=0;
 const ksef=(i:Invoice)=>{
  if(i.ksefNumber && !/^([1-9]((\d[1-9])|([1-9]\d))\d{7}|M\d{9}|[A-Z]{3}\d{7})-(20[2-9][0-9]|2[1-9][0-9]{2}|[3-9][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[1-2][0-9]|3[0-1])-([0-9A-F]{6})-?([0-9A-F]{6})-([0-9A-F]{2})$/.test(i.ksefNumber))throw new ApiError(400,`${i.number}: numer KSeF nie spełnia formatu JPK (np. dokument demo).`);
  return i.ksefNumber?tag("NrKSeF",i.ksefNumber):tag(o.nonKsefCode,1);
 };
 const sales=rows.filter(i=>i.type==="sale").map(i=>{const b=map.get(i.contractorId)!,r=rates(i);saleCount++;let fields="";
  if(r.zw)fields+=tag("K_10",money(pln(i,r.zw.net)));if(r['0'])fields+=tag("K_13",money(pln(i,r['0'].net)));
  for(const [rate,net,vat] of [["5",15,16],["8",17,18],["23",19,20]] as const)if(r[rate]){const value=pln(i,r[rate].vat);saleVat=round2(saleVat+value);fields+=tag(`K_${net}`,money(pln(i,r[rate].net)))+tag(`K_${vat}`,money(value));}
  return `<SprzedazWiersz>${tag("LpSprzedazy",saleCount)}<KodKrajuNadaniaTIN>PL</KodKrajuNadaniaTIN>${tag("NrKontrahenta",b.nip)}${tag("NazwaKontrahenta",b.name)}${tag("DowodSprzedazy",i.number)}${tag("DataWystawienia",i.issueDate)}${tag("DataSprzedazy",i.saleDate)}${ksef(i)}${fields}</SprzedazWiersz>`;
 }).join("");
 const purchases=rows.filter(i=>i.type==="purchase").map(i=>{const b=map.get(i.contractorId)!,t=invoiceTotals(i);purchaseCount++;purchaseVat=round2(purchaseVat+pln(i,t.vat));return `<ZakupWiersz>${tag("LpZakupu",purchaseCount)}<KodKrajuNadaniaTIN>PL</KodKrajuNadaniaTIN>${tag("NrDostawcy",b.nip)}${tag("NazwaDostawcy",b.name)}${tag("DowodZakupu",i.number)}${tag("DataZakupu",i.issueDate)}${ksef(i)}${tag("K_42",money(pln(i,t.net)))}${tag("K_43",money(pln(i,t.vat)))}</ZakupWiersz>`;}).join("");
 return start+header+`<Podmiot1 rola="Podatnik">${person}</Podmiot1><Ewidencja>`+sales+`<SprzedazCtrl>${tag("LiczbaWierszySprzedazy",saleCount)}${tag("PodatekNalezny",money(saleVat))}</SprzedazCtrl>`+purchases+`<ZakupCtrl>${tag("LiczbaWierszyZakupow",purchaseCount)}${tag("PodatekNaliczony",money(purchaseVat))}</ZakupCtrl></Ewidencja></JPK>`;
}
