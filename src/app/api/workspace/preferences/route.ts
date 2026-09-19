import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
async function scope(req: Request, userId: string) {
  const p = new URL(req.url).searchParams, key = p.get("key") || "", companyId = p.get("companyId") || "account";
  if (!/^(invoice-views|favorites|onboarding|accountant:\d{4}-(0[1-9]|1[0-2]))$/.test(key)) throw new ApiError(400, "Nieprawidłowy rodzaj ustawień.");
  if (companyId !== "account") {
    if (!objectId(companyId)) throw new ApiError(400, "Nieprawidłowa firma.");
    const access = await requireCompanyAccess(userId, companyId);
    if (!access.ok) throw new ApiError(access.status, access.error);
  }
  return `${companyId}:${key}`;
}
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const key = await scope(req, user.id);
    const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { workspacePreferences: true } });
    const data = record.workspacePreferences as Record<string, Prisma.JsonValue> | null;
    const value = data?.[key] ?? null;
    return json({ value, revision: hash(value) });
  } catch (e) { return handleApiError(e); }
}
export async function PUT(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const key = await scope(req, user.id), body = await readJson(req);
    const value = body.value ?? null;
    if (JSON.stringify(value).length > 16000) throw new ApiError(400, "Przekroczono limit ustawień widoku.");
    await prisma.$transaction(async tx => {
      const record = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { workspacePreferences: true } });
      const data = (record.workspacePreferences || {}) as Record<string, Prisma.JsonValue>;
      if (body.revision !== hash(data[key] ?? null)) throw new ApiError(409, "Ustawienia zmieniły się w innej karcie. Odśwież stronę.");
      const updated = { ...data, [key]: value };
      if (JSON.stringify(updated).length > 128000) throw new ApiError(400, "Przekroczono limit zapisanych ustawień.");
      await tx.user.update({ where: { id: user.id }, data: { workspacePreferences: updated as Prisma.InputJsonValue } });
    });
    return json({ value, revision: hash(value) });
  } catch (e) { return handleApiError(e); }
}
