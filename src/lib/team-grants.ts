import {ApiError} from "./api";
import {DEFAULT_ROLE_PERMISSIONS} from "./role-permissions";
import type {CompanyRole,CompanyPermissions} from "./types";
export function validateTeamGrant(roleValue:unknown,permissionValue:unknown,actor:{role:CompanyRole;permissions:CompanyPermissions}) {
 if(typeof roleValue!=="string"||!Object.hasOwn(DEFAULT_ROLE_PERMISSIONS,roleValue))throw new ApiError(400,"Wybierz poprawną rolę zespołu.");
 const role=roleValue as CompanyRole;
 if(role==="owner"&&actor.role!=="owner")throw new ApiError(403,"Tylko właściciel może nadawać rolę właściciela.");
 if(permissionValue!=null&&(typeof permissionValue!=="object"||Array.isArray(permissionValue)))throw new ApiError(400,"Nieprawidłowe uprawnienia.");
 const permissions={...DEFAULT_ROLE_PERMISSIONS[role]};
 for(const [key,value] of Object.entries((permissionValue||{}) as Record<string,unknown>)){
  if(!Object.hasOwn(DEFAULT_ROLE_PERMISSIONS.owner,key)||typeof value!=="boolean")throw new ApiError(400,"Uprawnienia muszą być wartościami tak/nie z dozwolonej listy.");
  if(role!=="owner")permissions[key as keyof CompanyPermissions]=value;
 }
 if(actor.role!=="owner")for(const key of Object.keys(permissions) as (keyof CompanyPermissions)[]){if(permissions[key]&&!actor.permissions[key])throw new ApiError(403,"Nie możesz nadać uprawnień, których sam nie posiadasz.");}
 return {role,permissions};
}
export async function teamActor(tx:import("@prisma/client").Prisma.TransactionClient,userId:string,companyId:string){
 const {companyAccess}=await import("./company-write");
 const access=await companyAccess(tx,userId,companyId,"canManageTeam");
 await tx.companyProfile.update({where:{id:companyId},data:{updatedAt:new Date()}});
 const member=await tx.companyMember.findUnique({where:{companyId_userId:{companyId,userId}}});
 const permissions={...DEFAULT_ROLE_PERMISSIONS[access.role as CompanyRole]};
 if(member&&access.role!=="owner")for(const key of Object.keys(permissions) as (keyof CompanyPermissions)[])permissions[key]=member[key]??permissions[key];
 return {...access,role:access.role as CompanyRole,permissions};
}
