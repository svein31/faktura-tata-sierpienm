import "server-only";
import { prisma } from "./db";
import { ApiError } from "./api";
import { tokenHash } from "./integration-security";
import { getCompanyMembership } from "./permissions";
export async function requireIntegrationOwner(userId: string, companyId: string) {
  const membership = await getCompanyMembership(userId, companyId);
  if (membership?.role !== "owner" && !membership?.permissions.canManageIntegrations) throw new ApiError(403, "Brak uprawnienia do zarządzania integracjami.");
  return membership;
}
export const PUBLIC_API_SCOPES = ["ksef:read", "documents:read", "catalogs:read"] as const;
export async function authenticatePublicApi(req: Request, requiredScope: typeof PUBLIC_API_SCOPES[number] = "ksef:read") {
  const match = /^Bearer (fkt_[a-f0-9]{64})$/.exec(req.headers.get("authorization") || "");
  if (!match) throw new ApiError(401, "Wymagany klucz API Bearer.");
  const key = await prisma.publicApiKey.findUnique({ where: { tokenHash: tokenHash(match[1]) } });
  if (!key || key.revoked) throw new ApiError(401, "Nieprawidłowy klucz API.");
  await requireIntegrationOwner(key.userId, key.companyId);
  const scopes = Array.isArray(key.scopes) ? key.scopes : ["ksef:read"];
  if (!scopes.includes(requiredScope)) throw new ApiError(403, "Klucz nie ma wymaganego zakresu dostępu.");
  const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000);
  await prisma.publicApiKey.updateMany({ where: { id: key.id, windowStart: { lt: windowStart } }, data: { windowStart, requests: 0 } });
  const claim = await prisma.publicApiKey.updateMany({ where: { id: key.id, revoked: false, requests: { lt: 120 } }, data: { requests: { increment: 1 } } });
  if (!claim.count) throw new ApiError(429, "Limit 120 żądań na minutę. Ponów w kolejnej minucie.");
  return key;
}
export const statusSelect = { id: true, number: true, sellerCompanyId: true, ksefStatus: true, ksefNumber: true, referenceNumber: true, updatedAt: true } as const;

