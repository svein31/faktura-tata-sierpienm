import {prisma} from "@/lib/db";
import {getSessionUser} from "@/lib/auth";
import {ApiError,handleApiError,json,readJson} from "@/lib/api";
import {companyAccess} from "@/lib/company-write";
import {accountingDocuments,REVIEW_STATUSES} from "@/lib/accountant-documents";
import {requireWorkflowIndex} from "@/lib/workflow-readiness";
import {assertAccountingPeriodsOpen} from "@/lib/accounting-period";
import {recordAuditLog} from "@/lib/audit";
import {round2} from "@/lib/format";
export const runtime="nodejs";
function monthValue(value:unknown){if(typeof value!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw new ApiError(400,"Wybierz poprawny miesiąc.");return value;}
export async function GET(req:Request){try{
 const user=await getSessionUser();if(!user)throw new ApiError(401,"Nieautoryzowany.");const url=new URL(req.url),{company,role}=await companyAccess(prisma,user.id,url.searchParams.get("companyId"),"canExport"),month=monthValue(url.searchParams.get("month")),{documents,overflow}=await accountingDocuments(prisma,company.id,month);if(overflow)throw new ApiError(413,"Zbyt dużo dokumentów w miesiącu.");
 const ids=documents.map(d=>d.id),[reviews,comments]=await Promise.all([prisma.accountingDocumentReview.findMany({where:{companyId:company.id,documentId:{in:ids}}}),prisma.documentComment.findMany({where:{docId:{in:ids},docType:{in:["invoice","expense"]}},orderBy:{createdAt:"desc"},take:1000})]);
 return json({canReview:["owner","admin","accountant"].includes(role),documents:documents.map(d=>{const review=reviews.find(r=>r.documentType===d.type&&r.documentId===d.id);return {...d,status:review?.sourceRevision===d.sourceRevision?review.status:"to_verify",reviewVersion:review?.version||0,stale:!!review&&review.sourceRevision!==d.sourceRevision,comments:comments.filter(c=>c.docId===d.id&&c.docType===d.type).map(c=>({id:c.id,author:c.authorName,message:c.message,createdAt:c.createdAt}))};})});
}catch(e){return handleApiError(e);}}
export async function POST(req:Request){try{
 const user=await getSessionUser();if(!user)throw new ApiError(401,"Nieautoryzowany.");const body=await readJson(req),month=monthValue(body.month),{company}=await companyAccess(prisma,user.id,body.companyId,"canExport");
 if(!Array.isArray(body.documents)||!body.documents.length||body.documents.length>100||new Set(body.documents.map((d:any)=>d.type+":"+d.id)).size!==body.documents.length)throw new ApiError(400,"Wybierz od 1 do 100 różnych dokumentów.");
 const status=body.status,comment=typeof body.comment==="string"?body.comment.trim():"";if(status!==undefined&&!REVIEW_STATUSES.includes(status as any))throw new ApiError(400,"Nieprawidłowy status.");if(comment.length>2000||(!comment&&status===undefined))throw new ApiError(400,"Dodaj uwagę lub wybierz status.");if(status!==undefined)await requireWorkflowIndex("AccountingDocumentReview");
 await prisma.$transaction(async tx=>{
  const access=await companyAccess(tx,user.id,company.id,"canExport");if(!["owner","admin","accountant"].includes(access.role))throw new ApiError(403,"Weryfikacja wymaga roli księgowej lub administratora.");
  const {documents,overflow}=await accountingDocuments(tx,company.id,month);if(overflow)throw new ApiError(413,"Zbyt dużo dokumentów.");
  for(const selected of body.documents as any[]){const doc=documents.find(d=>d.type===selected.type&&d.id===selected.id);if(!doc)throw new ApiError(403,"Dokument nie należy do wybranej firmy i miesiąca.");if(doc.sourceRevision!==selected.sourceRevision)throw new ApiError(409,"Dokument zmienił się. Odśwież listę.");
   if(status!==undefined){await assertAccountingPeriodsOpen(tx,[{companyId:company.id,issueDate:doc.date}]);const review=await tx.accountingDocumentReview.findUnique({where:{companyId_documentType_documentId:{companyId:company.id,documentType:doc.type,documentId:doc.id}}});if((review?.version||0)!==selected.reviewVersion)throw new ApiError(409,"Inna osoba zmieniła weryfikację. Odśwież listę.");
    const old=review?.sourceRevision===doc.sourceRevision?review.status:"to_verify",from=REVIEW_STATUSES.indexOf(old as any),to=REVIEW_STATUSES.indexOf(status as any);if(status!=="to_verify"&&to!==from+1)throw new ApiError(409,"Kolejność: weryfikacja, zatwierdzenie, zaksięgowanie.");
    if(status!=="to_verify"){if(![doc.totalNet,doc.totalVat,doc.totalGross].every(Number.isFinite)||Math.abs(round2(doc.totalNet+doc.totalVat)-doc.totalGross)>.01)throw new ApiError(409,"Sprawdź kwoty dokumentu.");if(doc.costReviewId){const cost=await tx.costReview.findUnique({where:{id:doc.costReviewId}});if(cost?.status!=="approved")throw new ApiError(409,"Najpierw zatwierdź koszt w obiegu.");}}
    if(review){const changed=await tx.accountingDocumentReview.updateMany({where:{id:review.id,version:review.version},data:{status:status as string,sourceRevision:doc.sourceRevision,version:{increment:1},updatedBy:user.id}});if(changed.count!==1)throw new ApiError(409,"Weryfikacja zmieniła się.");}else await tx.accountingDocumentReview.create({data:{companyId:company.id,documentType:doc.type,documentId:doc.id,sourceRevision:doc.sourceRevision,status:status as string,updatedBy:user.id}});
    await recordAuditLog({client:tx,companyId:company.id,userId:user.id,userName:user.name,userEmail:user.email,action:"accountant.document_reviewed",entityType:doc.type,entityId:doc.id,details:{old,status,sourceRevision:doc.sourceRevision}});
   }
   if(comment){await tx.documentComment.create({data:{userId:user.id,authorName:user.name||user.email,authorRole:access.role,docType:doc.type,docId:doc.id,invoiceId:doc.type==="invoice"?doc.id:null,expenseId:doc.type==="expense"?doc.id:null,message:comment}});await recordAuditLog({client:tx,companyId:company.id,userId:user.id,userName:user.name,userEmail:user.email,action:"accountant.comment_added",entityType:doc.type,entityId:doc.id});}
  }
 });return json({ok:true});
}catch(e){if(["P2002","P2034"].includes((e as any)?.code))return handleApiError(new ApiError(409,"Równoczesna zmiana dokumentu. Odśwież listę."));return handleApiError(e);}}
