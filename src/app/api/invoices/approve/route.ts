import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";

export const runtime = "nodejs";

/**
 * POST /api/invoices/approve
 *
 * Ręczne zatwierdzanie faktur zakupowych dla księgowości (pojedynczo lub masowo):
 * body: { invoiceIds: string[], status?: "approved" | "pending" }
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await readJson(req);
    const rawIds = Array.isArray(body.invoiceIds)
      ? body.invoiceIds
      : typeof body.invoiceId === "string"
      ? [body.invoiceId]
      : [];

    const status = body.status === "pending" ? "pending" : "approved";
    const validIds = rawIds.filter((id): id is string => typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id));

    if (validIds.length === 0) {
      throw new ApiError(400, "Nie podano prawidłowych identyfikatorów faktur.");
    }

    const now = new Date();
    const approvedBy = user.name || user.email;

    // Aktualizacja w bazie dla faktur należących do użytkownika
    await prisma.invoice.updateMany({
      where: {
        id: { in: validIds },
        userId: user.id,
      },
      data: {
        approvalStatus: status,
        approvedAt: status === "approved" ? now : null,
        approvedBy: status === "approved" ? approvedBy : null,
      },
    });

    const updatedInvoices = await prisma.invoice.findMany({
      where: {
        id: { in: validIds },
        userId: user.id,
      },
      include: { sellerCompany: true },
    });

    return json({
      success: true,
      status,
      count: updatedInvoices.length,
      invoices: updatedInvoices.map(invoiceToDto),
      message:
        status === "approved"
          ? `Zaakceptowano ${updatedInvoices.length} faktur dla księgowości.`
          : `Cofnięto akceptację ${updatedInvoices.length} faktur.`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
