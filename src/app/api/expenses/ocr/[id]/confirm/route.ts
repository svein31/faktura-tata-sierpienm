import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError, json, readJson } from '@/lib/api';
import { businessAccess } from '@/lib/business/access';
import { objectId } from '@/lib/business/validation';
import { normalizeInvoice } from '@/lib/ocr/contract';
export const runtime='nodejs';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {
 try {
  const {companyId,user,ownerId}=await businessAccess(req,'write');const id=objectId((await ctx.params).id);
  const body=await readJson(req);const {data}=normalizeInvoice(body,true);
  const expense=await prisma.$transaction(async tx=>{
   const draft=await tx.ocrDraft.findFirst({where:{id,companyId}});
   if(!draft)throw new ApiError(404,'Nie znaleziono odczytu.');
   if(draft.status==='confirmed'&&draft.expenseId)return tx.expense.findUnique({where:{id:draft.expenseId}});
   if(draft.expiresAt<new Date())throw new ApiError(410,'Odczyt wygasł. Prześlij dokument ponownie.');
   const claimed=await tx.ocrDraft.updateMany({where:{id,companyId,status:'review'},data:{status:'confirming'}});
   if(claimed.count!==1)throw new ApiError(409,'Dokument jest już zatwierdzany.');
   const duplicate=await tx.expense.findFirst({where:{companyId,number:data.number!,nip:data.nip}});
   if(duplicate)throw new ApiError(409,'Koszt o tym numerze i NIP już istnieje.');
   const row=await tx.expense.create({data:{companyId,userId:ownerId,number:data.number!,contractorName:data.contractorName!,nip:data.nip,issueDate:data.issueDate!,saleDate:data.saleDate,dueDate:data.dueDate,totalNet:data.totalNet!,totalVat:data.totalVat!,totalGross:data.totalGross!,currency:data.currency!,iban:data.iban,lines:JSON.parse(JSON.stringify(data.lines)),ocrDraftId:id,ocrDocumentKey:createHash('sha256').update(JSON.stringify([companyId,data.nip || data.contractorName,data.number])).digest('hex'),workflowStatus:'verified',attachmentName:draft.filename}});
   await tx.ocrDraft.update({where:{id},data:{status:'confirmed',expenseId:row.id,confirmedAt:new Date(),data:JSON.parse(JSON.stringify(data))}});
   await tx.auditLog.create({data:{companyId,userId:user.id,entityType:'expense',entityId:row.id,action:'ocr_confirmed',description:'Zatwierdzono odczyt faktury kosztowej.'}});
   return row;
  });
  return json({expense},{status:201});
 }catch(e){if((e as {code?:string}).code==='P2002')return json({error:'Ten dokument kosztowy został już zapisany.',code:'DUPLICATE_EXPENSE'},{status:409});if((e as {code?:string}).code==='P2034')return json({error:'Równoległe zatwierdzanie dokumentu. Spróbuj ponownie.',code:'RETRY_CONFIRMATION'},{status:409});return handleApiError(e);}
}
