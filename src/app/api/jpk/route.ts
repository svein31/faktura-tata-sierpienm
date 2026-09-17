import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { ApiError, handleApiError, readJson } from "@/lib/api";
import { invoiceToDto, contractorToDto, companyProfileToDto } from "@/lib/dto";
import { buildJpk, parseJpkOptions } from "@/lib/jpk";
import { recordAuditLog } from "@/lib/audit";
export const runtime="nodejs";
export async function POST(req:Request){try{
 const user=await getSessionUser();if(!user)throw new ApiError(401,"Nieautoryzowany.");
 const body=await readJson(req);if(!objectId(body.companyId))throw new ApiError(400,"Wybierz firmę.");
 const access=await requireCompanyAccess(user.id,body.companyId,"canExport");if(!access.ok)throw new ApiError(access.status,access.error);
 const options=parseJpkOptions(body),company=await prisma.companyProfile.findUniqueOrThrow({where:{id:body.companyId}});
 const invoices=await prisma.invoice.findMany({where:{sellerCompanyId:company.id,issueDate:{gte:options.dateFrom,lte:options.dateTo}},orderBy:[{issueDate:"asc"},{id:"asc"}],take:10001});
 if(invoices.length>10000)throw new ApiError(400,"Eksport obejmuje ponad 10000 faktur. Zawęź okres.");
 const contractors=await prisma.contractor.findMany({where:{id:{in:[...new Set(invoices.map(i=>i.contractorId).filter(objectId))]}}});
 const xml=buildJpk(invoices.map(invoiceToDto),contractors.map(contractorToDto),companyProfileToDto(company),options);
 await recordAuditLog({companyId:company.id,userId:user.id,action:"jpk_exported",entityType:"export",entityId:company.id,details:{format:options.format,dateFrom:options.dateFrom,dateTo:options.dateTo}});
 return new Response(xml,{headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"no-store","Content-Disposition":`attachment; filename="${options.format==='fa'?'JPK_FA4':'JPK_V7M3-ewidencja'}-${options.dateFrom}-${options.dateTo}.xml"`}});
}catch(e){return handleApiError(e);}}
