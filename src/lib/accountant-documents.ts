import type { Prisma } from "@prisma/client";
import {createHash} from "node:crypto";
import {financialAmounts,isAccountingInvoice} from "./accountant-summary";
export const REVIEW_STATUSES=["to_verify","verified","approved","booked"] as const;
export function sourceRevision(source:unknown){return createHash("sha256").update(JSON.stringify(source)).digest("hex");}
export async function accountingDocuments(db:Prisma.TransactionClient,companyId:string,month:string){
 const [invoices,costs]=await Promise.all([db.invoice.findMany({where:{sellerCompanyId:companyId,issueDate:{startsWith:month}},take:10001,orderBy:{issueDate:"asc"}}),db.expense.findMany({where:{companyId,issueDate:{startsWith:month}},take:10001,orderBy:{issueDate:"asc"}})]);
 const posted=invoices.filter(isAccountingInvoice),refs=new Set(posted.filter(i=>i.type==="purchase").map(i=>i.ksefNumber).filter(Boolean));
 const documents=[...posted.map(i=>({id:i.id,type:"invoice" as const,number:i.number,kind:i.type,date:i.issueDate,currency:i.currency,...financialAmounts(i),sourceRevision:sourceRevision(i),costReviewId:i.costReviewId})),...costs.filter(e=>!e.ksefRefNumber||!refs.has(e.ksefRefNumber)).map(e=>({id:e.id,type:"expense" as const,number:e.number,kind:"purchase",date:e.issueDate,currency:e.currency,...financialAmounts(e),sourceRevision:sourceRevision(e),costReviewId:e.costReviewId}))];
 return {documents,overflow:invoices.length>10000||costs.length>10000};
}
