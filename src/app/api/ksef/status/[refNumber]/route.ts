import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { reconcileKsefInvoice } from "@/lib/ksef/reconcile-status";
import { accessibleCompanyIds } from "@/lib/company-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ refNumber: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const ref = (await params).refNumber.trim();
    if (!ref || ref.length > 150) throw new ApiError(400, "Nieprawidłowy numer referencyjny.");
    const companies = await accessibleCompanyIds(user.id);
    const invoice = await prisma.invoice.findFirst({
      where: { AND: [
        { OR: [{ referenceNumber: ref }, { ksefNumber: ref }, ...(/^[a-f\d]{24}$/i.test(ref) ? [{ id: ref }] : [])] },
        { OR: [{ sellerCompanyId: { in: companies } }, { userId: user.id, sellerCompanyId: null }] },
      ] },
      include: { sellerCompany: true, ksefSession: true },
    });
    if (!invoice) throw new ApiError(404, "Nie znaleziono faktury.");
    if (invoice.sellerCompanyId) {
      const access = await requireCompanyAccess(user.id, invoice.sellerCompanyId, "canSendKsef");
      if (!access.ok) throw new ApiError(access.status, access.error);
    } else if (invoice.userId !== user.id) throw new ApiError(404, "Nie znaleziono faktury.");

    return json(await reconcileKsefInvoice(invoice, user));
  } catch (error) { return handleApiError(error); }
}
