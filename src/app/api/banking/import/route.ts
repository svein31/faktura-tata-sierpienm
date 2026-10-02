import {prisma} from "@/lib/db";
import {getSessionUser} from "@/lib/auth";
import {ApiError,handleApiError,json,readJson} from "@/lib/api";
import {companyAccess} from "@/lib/company-write";
import {parseBankStatement,type StatementFormat} from "@/lib/banking/statement-parser";
import {matchTransactionsToInvoices} from "@/lib/banking/csv-parser";
import {bankEntryFingerprint,normalizedBankAccount} from "@/lib/banking/reconciliation";
import {financialAmounts,isAccountingInvoice} from "@/lib/accountant-summary";
import {requireWorkflowIndex} from "@/lib/workflow-readiness";
import {recordAuditLog} from "@/lib/audit";
import {round2} from "@/lib/format";
import {createHash} from "node:crypto";
export const runtime="nodejs";
export async function GET(req:Request){try{const user=await getSessionUser();if(!user)throw new ApiError(401,"Nieautoryzowany.");const {company}=await companyAccess(prisma,user.id,new URL(req.url).searchParams.get("companyId"),"canRecordPayments");return json({imports:await prisma.bankStatementImport.findMany({where:{companyId:company.id},orderBy:{importedAt:"desc"},take:50})});}catch(e){return handleApiError(e);}}
export async function POST(req:Request){try{
 const user=await getSessionUser();if(!user)throw new ApiError(401,"Nieautoryzowany.");const body=await readJson(req),{company}=await companyAccess(prisma,user.id,body.companyId,"canRecordPayments");
 const content=String(body.content||body.csvContent||"").trim();if(!content)throw new ApiError(400,"Wybierz wyciąg bankowy.");
 const [profile,accounts,invoices,expenses]=await Promise.all([prisma.companyProfile.findUniqueOrThrow({where:{id:company.id}}),prisma.companyBankAccount.findMany({where:{companyId:company.id}}),prisma.invoice.findMany({where:{sellerCompanyId:company.id,paymentStatus:{in:["unpaid","partially_paid","overdue"]}}}),prisma.expense.findMany({where:{companyId:company.id,paymentStatus:"unpaid"}})]);
 const selected=body.accountId?accounts.find(a=>a.id===body.accountId):accounts.find(a=>a.isDefault)||accounts[0];if(body.accountId&&!selected)throw new ApiError(403,"Rachunek nie należy do wybranej firmy.");
 const parsed=parseBankStatement(content,String(body.format||"auto") as StatementFormat,selected&&!selected.isMultiCurrency?selected.currency:String(body.currency||"PLN")),raw=parsed.transactions;
 const fallbackAccount=normalizedBankAccount(selected?.accountNumber||profile.bankAccount||""),allowed=new Set([...accounts.map(a=>normalizedBankAccount(a.accountNumber)),normalizedBankAccount(profile.bankAccount||"")].filter(Boolean));
 for(const tx of raw){const account=normalizedBankAccount(tx.sourceAccount||fallbackAccount);if(tx.sourceAccount&&(!allowed.has(account)||(body.accountId&&account!==normalizedBankAccount(selected!.accountNumber))))throw new ApiError(400,"Wyciąg zawiera rachunek spoza wybranej firmy lub inny niż wskazany.");tx.sourceAccount=account||"csv-unspecified";}
 const contractors=await prisma.contractor.findMany({where:{id:{in:invoices.map(i=>i.contractorId).filter((id):id is string=>Boolean(id))}}}),contacts=new Map(contractors.map(c=>[c.id,c])),published=invoices.filter(isAccountingInvoice),refs=new Set(published.filter(i=>i.type==="purchase").map(i=>i.ksefNumber).filter(Boolean));
 const candidates=[...published.map(i=>({id:i.id,number:i.number,contractorName:contacts.get(i.contractorId||"")?.name,contractorNip:contacts.get(i.contractorId||"")?.nip,totalGross:financialAmounts(i).totalGross,paidAmount:i.paidAmount||0,currency:i.currency,type:i.type as "sale"|"purchase",targetType:"invoice" as const})),...expenses.filter(e=>!e.costReviewId&&(!e.ksefRefNumber||!refs.has(e.ksefRefNumber))).map(e=>({id:e.id,number:e.number,contractorName:e.contractorName,contractorNip:e.nip||e.contractorNip||"",totalGross:e.totalGross,paidAmount:0,currency:e.currency,type:"purchase" as const,targetType:"expense" as const}))];
 const matched=matchTransactionsToInvoices(raw,candidates),occurrences=new Map<string,number>();
 const fingerprints=raw.map(tx=>{const key=bankEntryFingerprint(company.id,tx.sourceAccount!,tx),ordinal=occurrences.get(key)||0;occurrences.set(key,ordinal+1);return bankEntryFingerprint(company.id,tx.sourceAccount!,tx,ordinal);});
 const existing=await prisma.bankImportEntry.findMany({where:{companyId:company.id,fingerprint:{in:fingerprints}},select:{fingerprint:true}}),duplicates=new Set(existing.map(e=>e.fingerprint));
 const totalsByCurrency:Record<string,number>={};for(const tx of raw)totalsByCurrency[tx.currency!]=round2((totalsByCurrency[tx.currency!]||0)+tx.amount);
 const matchedCount=matched.filter((t,i)=>t.matchedInvoiceId&&!duplicates.has(fingerprints[i])).length,totalAmount=Object.keys(totalsByCurrency).length===1?Object.values(totalsByCurrency)[0]:0,fileHash=createHash("sha256").update(JSON.stringify([company.id,body.accountId||fallbackAccount,content])).digest("hex");let appliedCount=0;
 if(body.applyPayments===true){
  await requireWorkflowIndex("BankImportEntry");const oldHash=createHash("sha256").update(user.id).update("\0").update(content).digest("hex");if(await prisma.bankStatementImport.findFirst({where:{fileHash:{in:[fileHash,oldHash]}}}))throw new ApiError(409,"Ten wyciąg został już zaimportowany.","IMPORT_DUPLICATE");
  appliedCount=await prisma.$transaction(async tx=>{
   await companyAccess(tx,user.id,company.id,"canRecordPayments");const imported=await tx.bankStatementImport.create({data:{companyId:company.id,userId:user.id,filename:String(body.filename||"wyciag").slice(0,200),bankFormat:parsed.format,accountNumber:fallbackAccount||null,rowCount:raw.length,matchedCount,totalAmount,fileHash}});let applied=0;
   for(let i=0;i<matched.length;i++){const item=matched[i];if(duplicates.has(fingerprints[i]))continue;
    const ledger=await tx.bankImportEntry.create({data:{fingerprint:fingerprints[i],companyId:company.id,importId:imported.id,sourceAccount:raw[i].sourceAccount!,date:item.date,amount:item.amount,currency:item.currency!,title:item.title.slice(0,2000),reference:raw[i].reference||null}});
    if(!item.matchedInvoiceId||!["exact","high"].includes(item.confidence))continue;const amount=Math.abs(item.amount),paidAt=new Date(item.date+"T12:00:00Z");
    if(item.targetType==="expense"){
     const expense=await tx.expense.findFirst({where:{id:item.matchedInvoiceId,companyId:company.id,paymentStatus:"unpaid",currency:item.currency}});if(!expense||amount!==expense.totalGross)throw new ApiError(409,"Koszt lub saldo zmieniło się. Odśwież wyciąg.");
     const changed=await tx.expense.updateMany({where:{id:expense.id,updatedAt:expense.updatedAt,paymentStatus:"unpaid"},data:{paymentStatus:"paid",paidAt}});if(changed.count!==1)throw new ApiError(409,"Koszt zmienił się podczas importu.");await tx.bankImportEntry.update({where:{id:ledger.id},data:{expenseId:expense.id}});
    }else{
     const invoice=await tx.invoice.findFirst({where:{id:item.matchedInvoiceId,sellerCompanyId:company.id,currency:item.currency,paymentStatus:{in:["unpaid","partially_paid","overdue"]}}});if(!invoice||!isAccountingInvoice(invoice))throw new ApiError(409,"Faktura zmieniła się. Odśwież wyciąg.");
     const total=financialAmounts(invoice).totalGross,newPaid=round2((invoice.paidAmount||0)+amount);if(amount<=0||newPaid>total)throw new ApiError(409,"Kwota operacji przekracza saldo faktury.");
     const changed=await tx.invoice.updateMany({where:{id:invoice.id,sellerCompanyId:company.id,version:invoice.version},data:{paidAmount:newPaid,paymentStatus:newPaid===total?"paid":"partially_paid",status:newPaid===total?"paid":invoice.status,version:(invoice.version||0)+1}});if(changed.count!==1)throw new ApiError(409,"Faktura zmieniła się podczas importu.");
     await tx.paymentRecord.create({data:{userId:user.id,invoiceId:invoice.id,amount,method:"transfer",note:`Wyciąg: ${item.title.slice(0,200)}`,paidAt}});await tx.bankImportEntry.update({where:{id:ledger.id},data:{invoiceId:invoice.id}});
    }
    await recordAuditLog({client:tx,companyId:company.id,userId:user.id,userName:user.name,userEmail:user.email,action:"bank.payment_recorded",entityType:item.targetType||"invoice",entityId:item.matchedInvoiceId,details:{amount,currency:item.currency,importId:imported.id}});applied++;
   }
   await recordAuditLog({client:tx,companyId:company.id,userId:user.id,userName:user.name,userEmail:user.email,action:"bank.statement_imported",entityType:"bankImport",entityId:imported.id,details:{rowCount:raw.length,appliedCount:applied}});return applied;
  });
 }
 return json({transactions:matched.map((t,i)=>({...t,alreadyImported:duplicates.has(fingerprints[i])})),format:parsed.format,rowCount:raw.length,matchedCount,totalAmount,totalsByCurrency,appliedCount,duplicateCount:duplicates.size});
}catch(e){if((e as any)?.code==="P2002")return handleApiError(new ApiError(409,"Operacja lub wyciąg został już zaimportowany.","IMPORT_DUPLICATE"));if((e as any)?.code==="P2034")return handleApiError(new ApiError(409,"Równoczesna zmiana dokumentów. Odśwież i ponów import."));return handleApiError(e);}}
