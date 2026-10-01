import {prisma} from "@/lib/db";
import {getSessionUser} from "@/lib/auth";
import { assertObjectId, ApiError,handleApiError,json,readJson } from "@/lib/api";
import {teamActor,validateTeamGrant} from "@/lib/team-grants";
import {companyMemberToDto} from "@/lib/dto";
import {recordAuditLog} from "@/lib/audit";
import {objectId} from "@/lib/company-scope";
export const runtime="nodejs";
type Ctx={params:Promise<{id:string}>};
async function mutate(req:Request,{params}:Ctx,remove:boolean){try{
 const user=await getSessionUser();
    assertObjectId((await params).id);if(!user)throw new ApiError(401,"Nieautoryzowany.");const id=(await params).id;if(!objectId(id))throw new ApiError(400,"Nieprawidłowy członek zespołu.");const body=remove?{}:await readJson(req);
 const member=await prisma.$transaction(async tx=>{
  const current=await tx.companyMember.findUnique({where:{id}});if(!current)throw new ApiError(404,"Nie znaleziono członka zespołu.");
  const actor=await teamActor(tx,user.id,current.companyId);
  const grant=remove?null:validateTeamGrant(body.role||current.role,body.permissions,actor);
  if(current.role==="owner"&&actor.role!=="owner")throw new ApiError(403,"Tylko właściciel może zmienić dostęp właściciela.");
  if(current.role==="owner"&&(remove||grant?.role!=="owner")&&await tx.companyMember.count({where:{companyId:current.companyId,role:"owner"}})<=1)throw new ApiError(400,"Nie można odebrać dostępu jedynemu właścicielowi firmy.");
  const company=await tx.companyProfile.findUniqueOrThrow({where:{id:current.companyId}});
  if(remove&&company.userId===current.userId)throw new ApiError(400,"Nie można usunąć członkostwa założyciela firmy.");
  let result=null;if(remove)await tx.companyMember.delete({where:{id}});else result=await tx.companyMember.update({where:{id},data:{role:grant!.role,...grant!.permissions},include:{user:{select:{id:true,name:true,email:true}}}});
  await recordAuditLog({client:tx,companyId:current.companyId,userId:user.id,userName:user.name,userEmail:user.email,action:remove?"team_revoke":"team_permission_change",entityType:"team",entityId:id,details:{targetUserId:current.userId,newRole:grant?.role}});
  return result;
 });return json(remove?{ok:true}:{member:companyMemberToDto(member)});
}catch(e){return handleApiError(e);}}
export async function PUT(req:Request,ctx:Ctx){return mutate(req,ctx,false);}
export async function DELETE(req:Request,ctx:Ctx){return mutate(req,ctx,true);}
