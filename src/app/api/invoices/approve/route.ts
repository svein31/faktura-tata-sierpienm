import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { getCompanyMembership } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany." }, { status: 401 });
    const body = await readJson(req);
    const rawIds = Array.isArray(body.invoiceIds) ? body.invoiceIds : [body.invoiceId];
    if (!rawIds.length || rawIds.length > 200 || rawIds.some((id) => typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id))) {
      throw new ApiError(400, "Nie podano prawidłowych identyfikatorów faktur (maksymalnie 200).");
    }
    if (body.status !== undefined && body.status !== "pending" && body.status !== "approved") {
      throw new ApiError(400, "Nieprawidłowy status akceptacji.");
    }
    const ids = [...new Set(rawIds)] as string[];
    const status = body.status === "pending" ? "pending" : "approved";
    const invoices = await prisma.invoice.findMany({ where: { id: { in: ids } } });
    if (invoices.length !== ids.length) throw new ApiError(404, "Nie znaleziono faktury.");
    // Validate the entire batch before writing anything.
    for (const invoice of invoices) {
      if (invoice.costReviewId) throw new ApiError(409, "Dokument wymaga decyzji w obiegu kosztów.");
      if (invoice.type !== "purchase") throw new ApiError(400, "Akceptacja dotyczy tylko faktur kosztowych.");
      if (invoice.sellerCompanyId) {
        const membership = await getCompanyMembership(user.id, invoice.sellerCompanyId);
        if (!membership || (membership.role !== "owner" && membership.role !== "accountant")) {
          throw new ApiError(403, "Brak uprawnień do akceptacji faktury.");
        }
      } else if (invoice.userId !== user.id) {
        throw new ApiError(403, "Brak dostępu do faktury.");
      }
    }
    await prisma.$transaction(async tx => {
    await assertAccountingPeriodsOpen(tx, invoices.map(i => ({ companyId: i.sellerCompanyId, issueDate: i.issueDate })));
    const changed = await tx.invoice.updateMany({
      where: { id: { in: ids }, type: "purchase", OR: [{ costReviewId: null }, { costReviewId: { isSet: false } }] },
      data: {
        approvalStatus: status,
        approvedAt: status === "approved" ? new Date() : null,
        approvedBy: status === "approved" ? user.name || user.email : null,
        version: { increment: 1 },
      },
    });
    if (changed.count !== ids.length) throw new ApiError(409, "Dokument został przekazany do obiegu kosztów. Odśwież dane.");
    });
    const updated = await prisma.invoice.findMany({
      where: { id: { in: ids } },
      include: { sellerCompany: true },
    });
    return json({ success: true, status, count: updated.length, invoices: updated.map(invoiceToDto) });
  } catch (e) { return handleApiError(e); }
}
