import { getSessionUser } from '@/lib/auth';
import { getCompanyMembership } from '@/lib/permissions';
import { ApiError } from '@/lib/api';
import { objectId } from './validation';
export async function businessAccess(req: Request, action: 'read'|'write'|'owner'|'finance' = 'read') {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, 'Zaloguj się.', 'UNAUTHENTICATED');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) throw new ApiError(403, 'Niedozwolone źródło żądania.');
  }
  const companyId = objectId(new URL(req.url).searchParams.get('companyId') || req.headers.get('x-company-id'), 'companyId');
  const membership = await getCompanyMembership(user.id, companyId);
  if (!membership) throw new ApiError(403, 'Brak dostępu do firmy.');
  if (action === 'owner' && membership.role !== 'owner') throw new ApiError(403, 'Wymagane uprawnienia właściciela.');
  if (action === 'write' && !['owner','accountant','employee'].includes(membership.role)) throw new ApiError(403, 'Brak uprawnień do edycji.');
  if (action === 'finance' && !['owner','accountant'].includes(membership.role)) throw new ApiError(403, 'Wymagane uprawnienia księgowe.');
  return { user, companyId, membership, ownerId: membership.company.userId };
}
