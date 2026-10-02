import { randomBytes } from "node:crypto";
import { requireRecentAuth } from "@/lib/security-policy";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, cleanStr, handleApiError, json, readJson } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { requireIntegrationOwner, PUBLIC_API_SCOPES } from "@/lib/public-api";
import { sealWebhook, tokenHash, webhookUrl } from "@/lib/integration-security";
import { recordAuditLog } from "@/lib/audit";
export const runtime = "nodejs";
async function access(companyId: unknown) {
  const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
  if (!objectId(companyId)) throw new ApiError(400, "Wybierz firmę.");
  await requireIntegrationOwner(user.id, companyId); return { user, companyId };
}
export async function GET(req: Request) {
  try {
    const { companyId } = await access(new URL(req.url).searchParams.get("companyId"));
    const [keys, webhooks] = await Promise.all([
      prisma.publicApiKey.findMany({ where: { companyId }, select: { id: true, name: true, prefix: true, scopes: true, revoked: true, createdAt: true } }),
      prisma.statusWebhook.findMany({ where: { companyId }, select: { id: true, url: true, active: true, createdAt: true } }),
    ]);
    const deliveries = await prisma.webhookDelivery.findMany({ where: { webhookId: { in: webhooks.map(w => w.id) } }, select: { id: true, webhookId: true, status: true, attempts: true, lastError: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 });
    return json({ keys, webhooks, deliveries });
  } catch (e) { return handleApiError(e); }
}
export async function POST(req: Request) {
  try {
    const body = await readJson(req), { user, companyId } = await access(body.companyId);
    await requireRecentAuth(user.id);
    const result = await prisma.$transaction(async tx => {
      let result: { id: string; secret?: string; token?: string };
      if (body.action === "createKey") {
        const name = cleanStr(body.name, 80, "name"); if (!name) throw new ApiError(400, "Podaj nazwę klucza.");
        if (await tx.publicApiKey.count({ where: { companyId, revoked: false } }) >= 10) throw new ApiError(400, "Limit 10 aktywnych kluczy.");
        const scopes = body.scopes === undefined ? ["ksef:read"] : body.scopes;
        if (!Array.isArray(scopes) || !scopes.length || scopes.some(s => !PUBLIC_API_SCOPES.includes(s as typeof PUBLIC_API_SCOPES[number]))) throw new ApiError(400, "Wybierz poprawne zakresy klucza.");
        const token = `fkt_${randomBytes(32).toString("hex")}`;
        const key = await tx.publicApiKey.create({ data: { companyId, userId: user.id, name, scopes: [...new Set(scopes)], tokenHash: tokenHash(token), prefix: token.slice(0,12) } });
        result = { id: key.id, token };
      } else if (body.action === "createWebhook") {
        if (await tx.statusWebhook.count({ where: { companyId, active: true } }) >= 10) throw new ApiError(400, "Limit 10 aktywnych webhooków.");
        const url = webhookUrl(body.url).href, secret = randomBytes(32).toString("hex");
        const hook = await tx.statusWebhook.create({ data: { companyId, userId: user.id, url, encryptedSecret: sealWebhook(secret, companyId) } });
        result = { id: hook.id, secret };
      } else if (body.action === "revokeKey" || body.action === "disableWebhook") {
        if (!objectId(body.id)) throw new ApiError(400, "Nieprawidłowy identyfikator.");
        const changed = body.action === "revokeKey" ? await tx.publicApiKey.updateMany({ where: { id: body.id, companyId }, data: { revoked: true } }) : await tx.statusWebhook.updateMany({ where: { id: body.id, companyId }, data: { active: false } });
        if (!changed.count) throw new ApiError(404, "Nie znaleziono integracji.");
        result = { id: body.id };
      } else throw new ApiError(400, "Nieznana operacja.");
      await recordAuditLog({ client: tx, companyId, userId: user.id, userName: user.name, userEmail: user.email, action: `integration_${body.action}`, entityType: "integration", entityId: result.id });
      return result;
    });
    return json(result);
  } catch (e) { return handleApiError(e); }
}

