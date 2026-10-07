import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Remove personal audit snapshots before their relations would otherwise be set to null. */
export async function deleteUserAccount(userId: string, db: PrismaClient = prisma) {
  await db.$transaction(async tx => {
    const companies = await tx.companyProfile.findMany({ where: { userId }, select: { id: true } });
    await tx.auditLog.deleteMany({
      where: { OR: [{ userId }, { companyId: { in: companies.map(company => company.id) } }] },
    });
    await tx.user.delete({ where: { id: userId } });
  }, { maxWait: 5_000, timeout: 30_000 });
}
