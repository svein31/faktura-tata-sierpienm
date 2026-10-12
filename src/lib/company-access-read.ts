import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CompanyPermissions } from "./types";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

// Prisma applies schema defaults to absent Mongo fields, independently of role defaults.
const MEMBER_PERMISSION_DEFAULTS: CompanyPermissions = {
  canIssueInvoices: true,
  canCreateCorrections: false,
  canRecordPayments: false,
  canExport: false,
  canSendKsef: false,
  canManageBankAccounts: false,
  canManageTeam: false,
  canManageIntegrations: false,
};

export interface CompanyAccessRead {
  company: { id: string; userId: string; companyName: string; nip: string };
  member: { id: string; role: string; permissions: CompanyPermissions; valid: boolean } | null;
  requireMfa: boolean;
  mfaEnabled: boolean;
}

/** Indexed joins, with permission and MFA fields only; no account or integration credentials. */
export function companyAccessPipeline(userId: string, companyId: string): Prisma.InputJsonObject[] {
  return [
    { $match: { _id: { $oid: companyId } } },
    { $limit: 1 },
    { $project: { _id: 1, userId: 1, companyName: 1, nip: 1 } },
    { $lookup: {
      from: "CompanyMember",
      let: { companyId: "$_id" },
      pipeline: [
        { $match: { userId: { $oid: userId }, $expr: { $eq: ["$companyId", "$$companyId"] } } },
        { $limit: 1 },
        { $project: { _id: 0, id: { $toString: "$_id" }, role: 1,
          canIssueInvoices: 1, canCreateCorrections: 1, canRecordPayments: 1,
          canExport: 1, canSendKsef: 1, canManageBankAccounts: 1,
          canManageTeam: 1, canManageIntegrations: 1 } },
      ],
      as: "members",
    } },
    { $lookup: {
      from: "CompanySecurityPolicy", localField: "_id", foreignField: "_id",
      pipeline: [{ $project: { _id: 0, requireMfa: 1 } }], as: "policies",
    } },
    { $lookup: {
      from: "UserMfa",
      let: { required: { $eq: [{ $arrayElemAt: ["$policies.requireMfa", 0] }, true] } },
      pipeline: [
        { $match: { userId: { $oid: userId }, $expr: "$$required" } },
        { $limit: 1 },
        { $project: { _id: 0, enabled: { $eq: [{ $type: "$enabledAt" }, "date"] } } },
      ],
      as: "mfa",
    } },
    { $project: { _id: 0, company: { id: { $toString: "$_id" }, userId: { $toString: "$userId" }, companyName: "$companyName", nip: "$nip" },
      members: 1, policies: 1, mfaEnabled: { $ifNull: [{ $arrayElemAt: ["$mfa.enabled", 0] }, false] } } },
  ];
}

/** Read current access in the supplied Prisma session, including an interactive transaction. */
export async function readCompanyAccess(
  db: PrismaClient | Prisma.TransactionClient,
  userId: string,
  companyId: string
): Promise<CompanyAccessRead | null> {
  if (!OBJECT_ID.test(userId) || !OBJECT_ID.test(companyId)) return null;
  const rows = await db.companyProfile.aggregateRaw({ pipeline: companyAccessPipeline(userId, companyId) });
  const row = (rows as unknown as Record<string, unknown>[])[0];
  if (!row) return null;
  const company = row.company as CompanyAccessRead["company"] | undefined;
  if (!company || typeof company.id !== "string" || !OBJECT_ID.test(company.id)
    || typeof company.userId !== "string" || !OBJECT_ID.test(company.userId)
    || typeof company.companyName !== "string" || typeof company.nip !== "string") return null;

  const policy = (row.policies as Record<string, unknown>[] | undefined)?.[0];
  // Required schema booleans containing null or other types must never grant access.
  if (policy?.requireMfa !== undefined && typeof policy.requireMfa !== "boolean") return null;
  const rawMember = (row.members as Record<string, unknown>[] | undefined)?.[0];
  let member: CompanyAccessRead["member"] = null;
  if (rawMember) {
    const permissions = { ...MEMBER_PERMISSION_DEFAULTS };
    let valid = typeof rawMember.id === "string" && OBJECT_ID.test(rawMember.id)
      && (rawMember.role === undefined || typeof rawMember.role === "string");
    for (const key of Object.keys(permissions) as (keyof CompanyPermissions)[]) {
      const value = rawMember[key];
      if (value !== undefined) {
        if (typeof value !== "boolean") valid = false;
        permissions[key] = value === true;
      }
    }
    member = { id: typeof rawMember.id === "string" ? rawMember.id : "",
      role: typeof rawMember.role === "string" ? rawMember.role : rawMember.role === undefined ? "employee" : "",
      permissions, valid };
  }
  return { company, member, requireMfa: policy?.requireMfa === true, mfaEnabled: row.mfaEnabled === true };
}
