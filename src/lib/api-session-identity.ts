import "server-only";
import type { PrismaClient, User } from "@prisma/client";
import { isSessionBearer, sessionTokenHash } from "./session-token";

export type ApiIdentity = Pick<User, "id" | "name" | "email">;
type IdentityResult = { state: "missing" | "denied" } | { state: "live"; user: ApiIdentity };
function bsonDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (!value || typeof value !== "object" || !("$date" in value)) return null;
  const raw = (value as { $date: unknown }).$date;
  const date = typeof raw === "string" ? new Date(raw)
    : raw && typeof raw === "object" && "$numberLong" in raw ? new Date(Number((raw as { $numberLong: unknown }).$numberLong)) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

/** One indexed Mongo command; no credential/profile fields or process-level permission cache.
 * A missing hashed session alone permits the established legacy upgrade path.
 */
export async function readApiIdentity(db: PrismaClient, token: string): Promise<IdentityResult> {
  if (!isSessionBearer(token)) return { state: "denied" };
  const rows = await db.session.aggregateRaw({ pipeline: [
    { $match: { sessionToken: sessionTokenHash(token) } }, { $limit: 1 },
    { $lookup: { from: "User", localField: "userId", foreignField: "_id", pipeline: [
      { $project: { _id: 0, id: { $toString: "$_id" }, email: 1, name: { $ifNull: ["$name", ""] } } },
    ], as: "user" } }, { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "UserMfa", localField: "userId", foreignField: "userId", pipeline: [{ $project: { _id: 0, enabledAt: 1 } }], as: "mfa" } },
    { $project: { _id: 0, sessionId: { $toString: "$_id" }, expiresAt: 1, mfaVerifiedAt: 1,
      mfaEnabledAt: { $ifNull: [{ $arrayElemAt: ["$mfa.enabledAt", 0] }, null] }, user: 1 } },
  ] });
  const session = (rows as unknown as Record<string, unknown>[])[0];
  if (!session) return { state: "missing" };
  const expiresAt = bsonDate(session.expiresAt);
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    if (typeof session.sessionId === "string" && /^[a-f0-9]{24}$/i.test(session.sessionId))
      await db.session.delete({ where: { id: session.sessionId } }).catch(() => undefined);
    return { state: "denied" };
  }
  if (session.mfaEnabledAt != null) {
    const enabledAt = bsonDate(session.mfaEnabledAt), verifiedAt = bsonDate(session.mfaVerifiedAt);
    if (!enabledAt || !verifiedAt || enabledAt.getTime() !== verifiedAt.getTime()) return { state: "denied" };
  }
  const user = session.user as ApiIdentity | undefined;
  if (!user || !/^[a-f0-9]{24}$/i.test(user.id) || typeof user.email !== "string" || (user.name != null && typeof user.name !== "string")) return { state: "denied" };
  return { state: "live", user: { id: user.id, email: user.email, name: user.name ?? "" } };
}
