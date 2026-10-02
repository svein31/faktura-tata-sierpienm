import { requireRecentAuth } from "@/lib/security-policy";
import {companyAccess} from "@/lib/company-write";
import {recordAuditLog} from "@/lib/audit";
import {prisma} from "@/lib/db";
import {getSessionUser} from "@/lib/auth";
import {ApiError,cleanStr,handleApiError,json,readJson,str} from "@/lib/api";
import {ksefToDto} from "@/lib/dto";
export const runtime="nodejs";
export async function PUT(req:Request){try{
 const user=await getSessionUser();if(!user)throw new ApiError(401,"Nieautoryzowany.");const body=await readJson(req),environment=str(body.environment);
 if(!["demo","test","production"].includes(environment))throw new ApiError(400,"Nieprawidłowe środowisko KSeF.");
 await requireRecentAuth(user.id);
 const token=typeof body.token==="string"?body.token.trim():"";if(token&&(token.length<4||token.length>10000))throw new ApiError(400,"Nieprawidłowa długość tokena.");const certName=cleanStr(body.certName,200,"certName");
 const settings=await prisma.$transaction(async tx=>{const {company}=await companyAccess(tx,user.id,body.companyId,"canManageIntegrations");const profile=await tx.companyProfile.update({where:{id:company.id},data:{ksefEnvironment:environment,...(token?{ksefToken:token}:{})}});const data={environment,tokenSet:Boolean(profile.ksefToken),tokenMask:"",certName,autoValidate:body.autoValidate!==false};const result=await tx.ksefSettings.upsert({where:{userId:user.id},create:{userId:user.id,...data},update:data});await recordAuditLog({client:tx,companyId:company.id,userId:user.id,userName:user.name,userEmail:user.email,action:"ksef.settings_updated",entityType:"company",entityId:company.id,details:{environment,credentialsChanged:Boolean(token)}});return result;});return json({ksef:ksefToDto(settings)});
}catch(e){return handleApiError(e);}}
