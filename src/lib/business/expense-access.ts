import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { getCompanyMembership } from '@/lib/permissions';
import { ApiError } from '@/lib/api';
import { objectId } from './validation';
export async function expenseAccess(req:Request,id:string,write=false) {
 const user=await getSessionUser();if(!user)throw new ApiError(401,'Zaloguj się.');
 const expense=await prisma.expense.findUnique({where:{id:objectId(id)}});
 if(!expense)throw new ApiError(404,'Nie znaleziono kosztu.');
 if(expense.companyId){
  const membership=await getCompanyMembership(user.id,expense.companyId);
  if(!membership)throw new ApiError(404,'Nie znaleziono kosztu.');
  if(write&&!['owner','accountant','employee'].includes(membership.role))throw new ApiError(403,'Brak uprawnień do edycji kosztów.');
 }else{
  if(expense.userId!==user.id)throw new ApiError(404,'Nie znaleziono kosztu.');
  if(write&&user.role==='viewer')throw new ApiError(403,'Brak uprawnień do edycji kosztów.');
 }
 const origin=req.headers.get('origin');if(write&&origin&&origin!==new URL(req.url).origin)throw new ApiError(403,'Niedozwolone źródło żądania.');
 return {user,expense};
}
