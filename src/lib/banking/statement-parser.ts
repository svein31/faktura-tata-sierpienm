import {XMLParser,XMLValidator} from "fast-xml-parser";
import {ApiError} from "../api";
import {bankAmount,bankDate,parseBankStatementCsv,type ParsedRawTransaction} from "./csv-parser";
export type StatementFormat="auto"|"csv"|"mt940"|"camt053";
const array=(v:any):any[]=>v==null?[]:Array.isArray(v)?v:[v];
const text=(v:any):string=>typeof v==="object"?String(v?.["#text"]??""):String(v??"");
function mt940(content:string){
 const fields:Array<{tag:string;value:string}>=[];
 for(const line of content.split(/\r?\n/)){const match=line.match(/^:(\d{2}[A-Z]?):(.*)$/);if(match)fields.push({tag:match[1],value:match[2]});else if(fields.length)fields[fields.length-1].value+="\n"+line;}
 const sourceAccount=fields.find(f=>f.tag==="25")?.value.trim(),balance=fields.find(f=>/^60[FM]$/.test(f.tag))?.value,currency=balance?.match(/^[CD]\d{6}([A-Z]{3})/)?.[1];
 if(!currency)throw new ApiError(400,"MT940 wymaga salda początkowego z walutą.");
 const rows:ParsedRawTransaction[]=[];
 for(let i=0;i<fields.length;i++){const f=fields[i];if(f.tag!=="61")continue;const m=f.value.match(/^(\d{2})(\d{2})(\d{2})(?:\d{4})?(RC|RD|C|D)(?:[A-Z])?(\d+[,.]\d{0,2})([\s\S]*)$/);if(!m)throw new ApiError(400,"Nieobsługiwana operacja :61: MT940.");const year=Number(m[1])>=70?"19":"20",date=bankDate(`${year}${m[1]}-${m[2]}-${m[3]}`),direction=m[4],amount=bankAmount(m[5].replace(/[,.]$/,",0"))*(direction==="D"||direction==="RC"?-1:1),details=fields[i+1]?.tag==="86"?fields[i+1].value:"",parts=new Map(Array.from(details.matchAll(/\?(\d{2})([^?]*)/g),m=>[m[1],m[2].trim()]));
 const title=parts.size?Array.from({length:10},(_,j)=>parts.get(String(20+j))||"").join(" ").trim():details.trim();
 rows.push({date,amount,currency,sourceAccount,title,senderName:[parts.get("32"),parts.get("33")].filter(Boolean).join(" "),senderAccount:parts.get("31"),reference:m[6].match(/\/\/([^\n\r]+)/)?.[1]?.trim(),reversal:direction.startsWith("R"),raw:f.value+"\n"+details});}
 return rows;
}
function camt(content:string){
 if(/<!DOCTYPE|<!ENTITY/i.test(content))throw new ApiError(400,"Deklaracje DTD i ENTITY nie są dozwolone.");if(XMLValidator.validate(content)!==true)throw new ApiError(400,"Nieprawidłowy XML.");
 const document=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,trimValues:true}).parse(content)?.Document;
 if(!document?.BkToCstmrStmt)throw new ApiError(400,"XML nie jest wyciągiem camt.053.");const rows:ParsedRawTransaction[]=[];
 for(const statement of array(document.BkToCstmrStmt.Stmt)){const sourceAccount=text(statement.Acct?.Id?.IBAN||statement.Acct?.Id?.Othr?.Id),accountCurrency=text(statement.Acct?.Ccy);
  for(const entry of array(statement.Ntry)){
   const status=text(entry.Sts?.Cd||entry.Sts);if(status&&status!=="BOOK")continue;
   const currency=text(entry.Amt?.["@_Ccy"]||accountCurrency),direction=text(entry.CdtDbtInd);if(!/^[A-Z]{3}$/.test(currency)||!["CRDT","DBIT"].includes(direction))throw new ApiError(400,"Brak waluty lub kierunku operacji XML.");
   const entryAmount=bankAmount(text(entry.Amt));if(entryAmount<=0)throw new ApiError(400,"Kwota XML wymaga dodatniej wartości i osobnego kierunku.");
   const date=bankDate(text(entry.BookgDt?.Dt||entry.BookgDt?.DtTm).slice(0,10)),details=array(entry.NtryDtls).flatMap(d=>array(d.TxDtls));let sum=0;
   for(const [position,detail] of (details.length?details:[{}]).entries()){
    const specific=detail.Amt||detail.AmtDtls?.TxAmt?.Amt||detail.AmtDtls?.InstdAmt?.Amt;
    if(details.length>1&&!specific)throw new ApiError(400,"Zbiorcza operacja wymaga kwot każdego przelewu.");
    const ccy=text(specific?.["@_Ccy"]||currency);if(ccy!==currency)throw new ApiError(400,"Nieobsługiwana konwersja waluty wewnątrz operacji.");
    const amount=specific?bankAmount(text(specific)):entryAmount;if(amount<=0)throw new ApiError(400,"Kwota części operacji XML musi być dodatnia.");sum+=Math.round(amount*100);
    const parties=detail.RltdPties||{},party=direction==="CRDT"?(parties.Dbtr?.Pty||parties.Dbtr):(parties.Cdtr?.Pty||parties.Cdtr),account=direction==="CRDT"?parties.DbtrAcct:parties.CdtrAcct;
    const title=array(detail.RmtInf?.Ustrd).map(text).join(" ")||text(entry.AddtlNtryInf),reference=[detail.Refs?.AcctSvcrRef,detail.Refs?.TxId,detail.Refs?.EndToEndId].map(text).find(v=>v&&v!=="NOTPROVIDED")||([entry.AcctSvcrRef,entry.NtryRef].map(text).find(v=>v&&v!=="NOTPROVIDED")||"")+(details.length>1?`#${position}`:"");
    rows.push({date,amount:amount*(direction==="DBIT"?-1:1),currency,sourceAccount,title,senderName:text(party?.Nm),senderAccount:text(account?.Id?.IBAN),reference:reference&&reference!=="NOTPROVIDED"?reference:undefined,reversal:text(entry.RvslInd)==="true",raw:JSON.stringify(detail)});
   }
   if(sum!==Math.round(entryAmount*100))throw new ApiError(400,"Suma przelewów XML nie odpowiada kwocie operacji.");
  }
 }return rows;
}
export function parseBankStatement(content:string,format:StatementFormat="auto",currency="PLN"){
 if(Buffer.byteLength(content,"utf8")>2_000_000)throw new ApiError(413,"Wyciąg jest zbyt duży.");
 const selected=format==="auto"?(content.trim().startsWith("<")?"camt053":/^:20:|^:60[FM]:/m.test(content)?"mt940":"csv"):format;
 if(!["csv","mt940","camt053"].includes(selected))throw new ApiError(400,"Nieobsługiwany format wyciągu.");
 const transactions=selected==="csv"?parseBankStatementCsv(content,currency):selected==="mt940"?mt940(content):camt(content);
 if(!transactions.length)throw new ApiError(400,"Brak zaksięgowanych operacji w wyciągu.");if(transactions.length>10000)throw new ApiError(413,"Wyciąg zawiera ponad 10 000 operacji.");return {format:selected,transactions};
}
