import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { excludeExisting, validateImportRows } from "@/lib/contractor-import";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    if (Number(req.headers.get("content-length") || 0) > 220000) throw new ApiError(413, "Plik importu jest za duży.");
    const body = await readJson(req);
    if (body.action !== "preview" && body.action !== "import") throw new ApiError(400, "Nieprawidłowe działanie.");
    const { company } = await companyAccess(prisma, user.id, body.companyId, "canIssueInvoices");
    const { values, results } = validateImportRows(body.rows);
    const existingWhere = { OR: [{ companyId: company.id }, { userId: user.id, companyId: null }] };
    let created = 0;
    if (body.action === "preview") {
      const matches = await prisma.contractor.findMany({ where: { ...existingWhere, nip: { in: values.map(v => v.nip) } }, select: { nip: true } });
      excludeExisting(values, results, matches.map(row => row.nip));
    } else {
      // A company row write serializes competing imports; a conflict rolls back this entire batch.
      await prisma.$transaction(async tx => {
        await companyAccess(tx, user.id, company.id, "canIssueInvoices");
        await tx.companyProfile.update({ where: { id: company.id }, data: { updatedAt: new Date() } });
        const matches = await tx.contractor.findMany({ where: { ...existingWhere, nip: { in: values.map(v => v.nip) } }, select: { nip: true } });
        const pending = excludeExisting(values, results, matches.map(row => row.nip));
        if (pending.length) {
          created = (await tx.contractor.createMany({ data: pending.map(value => ({ ...value, userId: user.id, companyId: company.id })) })).count;
          await recordAuditLog({ client: tx, companyId: company.id, userId: user.id, userName: user.name, userEmail: user.email, action: "contractors_csv_imported", entityType: "companyProfile", entityId: company.id, details: { created, duplicate: results.filter(row => row.status === "duplicate").length, invalid: results.filter(row => row.status === "invalid").length } });
        }
      });
    }
    return json({ created, ready: results.filter(row => row.status === "ready").length, duplicate: results.filter(row => row.status === "duplicate").length, invalid: results.filter(row => row.status === "invalid").length, results });
  } catch (error) { return handleApiError(error); }
}
