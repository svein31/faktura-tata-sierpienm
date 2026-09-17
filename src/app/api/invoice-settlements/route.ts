import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireCompanyAccess, getCompanyMembership } from "@/lib/permissions";
import { objectId, contractorForCompany } from "@/lib/company-scope";
import { ApiError, cleanStr, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { parseInvoiceBody } from "@/lib/parsers";
import { buildAdvanceLines, buildFinalLines } from "@/lib/advance-lines";
import { invoiceTotals } from "@/lib/format";
import { warsawDate, addCalendarDays } from "@/lib/scheduling";
import { isIsoCalendarDate } from "@/lib/nbp";
import { recordAuditLog } from "@/lib/audit";
import type { InvoiceLine } from "@/lib/types";
import type { Prisma } from "@prisma/client";
export const runtime="nodejs";
export async function GET(req:Request){try{
 const user=await getSessionUser();if(!user)throw new ApiError(401,"Nieautoryzowany.");const companyId=new URL(req.url).searchParams.get("companyId");if(!objectId(companyId))throw new ApiError(400,"Wybierz firmę.");
 if(!await getCompanyMembership(user.id,companyId))throw new ApiError(403,"Brak dostępu.");
 return json({settlements:await prisma.invoiceSettlement.findMany({where:{companyId},orderBy:{createdAt:"asc"},select:{id:true,invoiceId:true,sourceId:true,companyId:true,kind:true,createdAt:true}})});
}catch(e){return handleApiError(e);}}
export async function POST(req:Request){try{
 const user=await getSessionUser();if(!user)throw new ApiError(401,"Nieautoryzowany.");const body=await readJson(req);
 if(!objectId(body.sourceId)||typeof body.requestId!=="string"||!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId))throw new ApiError(400,"Nieprawidłowy dokument lub identyfikator operacji.");
 const source=await prisma.invoice.findUnique({where:{id:body.sourceId}});
 if(!source?.sellerCompanyId || !source.isProforma || source.type!=="sale" || source.documentStatus==="cancelled")throw new ApiError(400,"Wybierz proformę sprzedaży przypisaną do firmy.");
 const companyId=source.sellerCompanyId,access=await requireCompanyAccess(user.id,companyId,"canIssueInvoices");if(!access.ok)throw new ApiError(access.status,access.error);
 const kind=String(body.kind);if(!["advance","final"].includes(kind))throw new ApiError(400,"Wybierz zaliczkę lub fakturę końcową.");
 const issueDate=String(body.issueDate||warsawDate()),receivedDate=String(body.receivedDate||"");
 if(!isIsoCalendarDate(issueDate)||issueDate>warsawDate())throw new ApiError(400,"Nieprawidłowa data wystawienia.");
 if(kind==="advance"&&(!isIsoCalendarDate(receivedDate)||receivedDate>issueDate||body.receiptConfirmed!==true))throw new ApiError(400,"Potwierdź rzeczywiste otrzymanie zaliczki i jej datę.");
 const number=cleanStr(body.number,100,"numer");if(!number)throw new ApiError(400,"Podaj numer dokumentu.");
 const requestKey=`${user.id}:${body.requestId}`;
 const repeat=await prisma.invoiceSettlement.findUnique({where:{requestKey}});
 if(repeat){if(repeat.sourceId!==source.id||repeat.kind!==kind)throw new ApiError(409,"Identyfikator operacji był już użyty.");return json({invoice:invoiceToDto(await prisma.invoice.findUniqueOrThrow({where:{id:repeat.invoiceId}}))});}
 const ledger=await prisma.invoiceSettlement.findMany({where:{sourceId:source.id},orderBy:{createdAt:"asc"}});
 if(ledger.some(d=>d.kind==="final"))throw new ApiError(409,"Proforma została już rozliczona fakturą końcową.");
 if(kind==="final"&&ledger.length===0)throw new ApiError(400,"Faktura końcowa wymaga co najmniej jednej rozliczonej zaliczki.");
 if(ledger.length>=100)throw new ApiError(400,"Limit 100 dokumentów zaliczkowych.");
 const advances=await prisma.invoice.findMany({where:{id:{in:ledger.map(d=>d.invoiceId)}}});
 if(advances.some(a=>a.advanceReceivedDate && a.advanceReceivedDate>issueDate))throw new ApiError(400,"Data końcowa nie może poprzedzać zaliczek.");
 const order=source.lines as unknown as InvoiceLine[];
 const lines=kind==="advance"?buildAdvanceLines(order,advances.map(a=>a.lines as unknown as InvoiceLine[]),Number(body.amountNet)):buildFinalLines(order,advances.map(a=>({number:a.number,lines:a.lines as unknown as InvoiceLine[]})));
 const totals=invoiceTotals({lines});
 const inheritedFx=source.exchangeRateRule==="manual"?{exchangeRateRule:"manual",exchangeRate:source.exchangeRate||undefined,exchangeRateUnit:source.exchangeRateUnit||1,exchangeRateDate:source.exchangeRateDate||undefined,exchangeRateJustification:source.exchangeRateJustification||"Kurs odziedziczony z zatwierdzonej proformy"}:{exchangeRateRule:source.exchangeRateRule||undefined,taxPointDate:source.taxPointDate||undefined};
 const saleDate=kind==="advance"?receivedDate:source.saleDate;
 const data=await parseInvoiceBody({number,type:"sale",status:kind==="advance"?"paid":"issued",documentStatus:"issued",contractorId:source.contractorId,sellerCompanyId:companyId,issueDate,saleDate,dueDate:addCalendarDays(issueDate,source.paymentTermDays),paymentTermDays:source.paymentTermDays,paymentMethod:source.paymentMethod,currency:source.currency,language:source.language,lines,...inheritedFx,notes:`Na podstawie proformy ${source.number}. ${advances.map(a=>`Zaliczka ${a.number}: ${invoiceTotals({lines:a.lines as unknown as InvoiceLine[]}).gross.toFixed(2)} ${source.currency}`).join("; ")}`}, {contractorOwnedBy:id=>contractorForCompany(user.id,id,companyId),companyOwnedBy:async id=>id===companyId,allowSettlementLines:true});
 const invoice=await prisma.$transaction(async tx=>{
  const locked=await tx.invoice.updateMany({where:{id:source.id,isProforma:true,OR:[{version:source.version},...((source.version??1)<=1?[{version:{isSet:false}}]:[])]},data:{version:(source.version||1)+1}});if(!locked.count)throw new ApiError(409,"Proforma zmieniła się. Odśwież i ponów operację.");
  if(await tx.invoice.count({where:{sellerCompanyId:companyId,number}}))throw new ApiError(409,"Numer jest już używany.");
  const metadata={sourceId:source.id,sourceNumber:source.number,orderLines:order,advances:advances.map(a=>({id:a.id,number:a.number,ksefNumber:a.ksefNumber,gross:invoiceTotals({lines:a.lines as unknown as InvoiceLine[]}).gross}))};
  const created=await tx.invoice.create({data:{...data,userId:user.id,documentKind:kind,advanceReceivedDate:kind==="advance"?receivedDate:null,settlementMetadata:metadata as unknown as Prisma.InputJsonValue,lines:lines as unknown as Prisma.InputJsonValue,totalNet:totals.net,totalVat:totals.vat,totalGross:totals.gross,totalNetPln:data.totalNetPln,totalVatPln:data.totalVatPln,totalGrossPln:data.totalGrossPln,...(kind==="advance"?{paidAmount:totals.gross}:{}),version:1}});
  await tx.invoiceSettlement.create({data:{invoiceId:created.id,sourceId:source.id,companyId,kind,requestKey,finalKey:kind==="final"?`final:${source.id}`:`advance:${created.id}`}});
  await recordAuditLog({client:tx,userId:user.id,userName:user.name,userEmail:user.email,companyId,documentId:created.id,entityType:"invoice",entityId:created.id,action:`${kind}_invoice_created`,details:{sourceId:source.id,net:totals.net,gross:totals.gross}});return created;
 });return json({invoice:invoiceToDto(invoice)},{status:201});
}catch(e){return handleApiError(e);}}
