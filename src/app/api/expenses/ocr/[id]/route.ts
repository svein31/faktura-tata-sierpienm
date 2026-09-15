import { prisma } from '@/lib/db';
import { ApiError, handleApiError, json } from '@/lib/api';
import { businessAccess } from '@/lib/business/access';
import { objectId } from '@/lib/business/validation';
export const runtime='nodejs';
export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){
 try {const {companyId}=await businessAccess(req,'write');const id=objectId((await ctx.params).id);const result=await prisma.ocrDraft.deleteMany({where:{id,companyId,status:'review'}});if(!result.count)throw new ApiError(404,'Nie znaleziono odczytu do usunięcia.');return json({success:true});}catch(e){return handleApiError(e);}
}
