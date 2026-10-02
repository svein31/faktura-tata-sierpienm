import type {BankStatementTransaction} from "../types";
import {uid} from "../utils";
import {ApiError} from "../api";
export interface ParsedRawTransaction {date:string;amount:number;title:string;senderName:string;senderAccount?:string;raw:string;currency?:string;sourceAccount?:string;reference?:string;reversal?:boolean;}
export function bankDate(value:string){
 let date=value.trim(),match=date.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})$/);
 if(match)date=`${match[3]}-${match[2]}-${match[1]}`;
 date=date.replace(/^(\d{4})[.\/](\d{2})[.\/](\d{2})$/,"$1-$2-$3");
 const parsed=new Date(date+"T12:00:00Z");if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new ApiError(400,"Nieprawidłowa data operacji bankowej.");return date;
}
export function bankAmount(value:string){
 let text=value.trim().replace(/\s|\u00a0/g,"").replace(/[A-Z]{3}$/i,"");
 if(/^\(.*\)$/.test(text))text="-"+text.slice(1,-1);
 const comma=text.lastIndexOf(","),dot=text.lastIndexOf(".");
 if(comma>=0&&dot>=0){const decimal=comma>dot?",":".",separator=decimal===","?".":",";text=text.split(separator).join("").replace(decimal,".");}else text=text.replace(",",".");
 if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text))throw new ApiError(400,"Nieprawidłowa kwota w wyciągu. Wymagane najwyżej dwa miejsca po przecinku.");
 const amount=Number(text);if(!Number.isSafeInteger(Math.round(amount*100))||Math.abs(amount)>1e12)throw new ApiError(400,"Kwota wykracza poza obsługiwany zakres.");return amount;
}
const header=(s:string)=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ł/g,"l").trim();
function csvRows(text:string,delimiter:string){const rows:string[][]=[];let row:string[]=[],cell="",quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(c===delimiter&&!quote){row.push(cell.trim());cell="";}else if((c==="\n"||c==="\r")&&!quote){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell="";}else cell+=c;}if(quote)throw new ApiError(400,"Niezamknięty cudzysłów w CSV.");row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;}
export function parseBankStatementCsv(text:string,defaultCurrency="PLN"):ParsedRawTransaction[]{
 if(text.length>2_000_000)throw new ApiError(413,"Wyciąg jest zbyt duży.");
 let rows:string[][]=[],headers:string[]=[],index=-1;
 for(const delimiter of [";",",","\t","|"]){const candidate=csvRows(text.replace(/^\uFEFF/,""),delimiter);const found=candidate.slice(0,25).findIndex(row=>{const h=row.map(header);const date=h.findIndex(c=>/data|date/.test(c)),amount=h.findIndex(c=>/kwota|wartosc|amount|debit|credit|obciazeni|uznani/.test(c));return date>=0&&amount>=0&&date!==amount;});if(found>=0){rows=candidate;headers=rows[found].map(header);index=found;break;}}
 if(index<0)throw new ApiError(400,"Brak rozpoznanych nagłówków CSV: data i kwota (lub obciążenie/uznanie).");
 const col=(pattern:RegExp)=>headers.findIndex(h=>pattern.test(h)),dateCol=col(/data|date/),amountCol=col(/kwota|wartosc|amount/),debit=col(/debit|obciazeni/),credit=col(/credit|uznani/),title=col(/tytul|opis|szczegol|title|description/),party=col(/nadawca|odbiorca|kontrahent|nazwa|name/),account=col(/rachunek|konto|iban|account/),currency=col(/walut|currency/),reference=col(/referenc|identyfikator|reference|transaction id/);
 const transactions:ParsedRawTransaction[]=[];
 for(const row of rows.slice(index+1)){if(row.length<headers.length)throw new ApiError(400,"Niepełny wiersz CSV.");let amount=0;
  if(amountCol>=0)amount=bankAmount(row[amountCol]);else{const d=debit>=0&&row[debit]?Math.abs(bankAmount(row[debit])):0,c=credit>=0&&row[credit]?Math.abs(bankAmount(row[credit])):0;if(d&&c)throw new ApiError(400,"Wiersz zawiera jednocześnie uznanie i obciążenie.");amount=c-d;}
  const date=bankDate(row[dateCol]),ccy=(currency>=0?row[currency]:defaultCurrency).toUpperCase();if(!/^[A-Z]{3}$/.test(ccy))throw new ApiError(400,"Nieprawidłowa waluta operacji.");if(amount===0)continue;
  transactions.push({date,amount,currency:ccy,title:title>=0?row[title]:"",senderName:party>=0?row[party]:"",senderAccount:account>=0?row[account].replace(/\s/g,""):undefined,reference:reference>=0?row[reference]||undefined:undefined,raw:row.join(";")});
 }
 if(transactions.length>10000)throw new ApiError(413,"Wyciąg zawiera ponad 10 000 operacji.");return transactions;
}
export interface MatchCandidate {id:string;number:string;contractorName?:string;contractorNip?:string;totalGross:number;paidAmount:number;currency?:string;type?:"sale"|"purchase";targetType?:"invoice"|"expense";}
export type MatchedTransaction=BankStatementTransaction&ParsedRawTransaction&{targetType?:"invoice"|"expense";alreadyImported?:boolean};
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
export function matchTransactionsToInvoices(transactions:ParsedRawTransaction[],candidates:MatchCandidate[]):MatchedTransaction[]{return transactions.map(tx=>{
 const title=tx.title.toLowerCase(),party=header(tx.senderName),amount=Math.abs(tx.amount);
 const eligible=candidates.filter(c=>!tx.reversal&&(c.currency||"PLN")===(tx.currency||"PLN")&&(c.type||"sale")===(tx.amount>0?"sale":"purchase")&&amount>0&&amount<=Math.round((c.totalGross-c.paidAmount)*100)/100&&(!(c.targetType==="expense")||Math.abs(amount-(c.totalGross-c.paidAmount))<.001));
 const numbered=eligible.filter(c=>c.number&&new RegExp(`(^|[^a-z0-9/\\-])${escape(c.number.toLowerCase())}($|[^a-z0-9/\\-])`).test(title));
 let found=numbered.length===1?numbered[0]:undefined,confidence:BankStatementTransaction["confidence"]=found?(Math.abs(amount-(found.totalGross-found.paidAmount))<.001?"exact":"high"):"none";
 if(!numbered.length){const identity=eligible.filter(c=>Math.abs(amount-(c.totalGross-c.paidAmount))<.001&&((c.contractorNip&&new RegExp(`(^|\\D)${escape(c.contractorNip)}($|\\D)`).test(title+" "+tx.senderName))||(c.contractorName&&header(c.contractorName).length>=4&&party.includes(header(c.contractorName)))));if(identity.length===1){found=identity[0];confidence="high";}}
 return {...tx,id:uid("tx"),confidence,matchedInvoiceId:found?.id,matchedInvoiceNumber:found?.number,matchedContractorName:found?.contractorName,targetType:found?.targetType||"invoice"};
});}
