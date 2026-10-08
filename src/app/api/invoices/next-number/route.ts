import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";
import { DEFAULT_INVOICE_PATTERN, invoiceNumberSeries, invoicePrefix } from "@/lib/invoice-numbering";
import { nextPersistedInvoiceNumber } from "@/lib/invoice-numbering-server";

export const runtime = "nodejs";

/** Small authenticated preview; POST still reserves the definitive number atomically. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams, companyId = params.get("companyId");
    if (!objectId(companyId)) throw new ApiError(400, "Wybierz firmę.");
    const access = await requireCompanyAccess(user.id, companyId);
    if (!access.ok) throw new ApiError(access.status, access.error);
    const type = params.get("type") || "sale";
    if (!["sale", "purchase"].includes(type)) throw new ApiError(400, "Nieprawidłowy typ dokumentu.");
    const date = params.get("date") || "";
    const seller = await prisma.companyProfile.findUniqueOrThrow({ where: { id: companyId }, select: { invoiceNumberPattern: true } });
    const pattern = seller.invoiceNumberPattern || DEFAULT_INVOICE_PATTERN;
    const prefix = invoicePrefix(type, params.get("correction") === "1", params.get("proforma") === "1");
    try { invoiceNumberSeries(pattern, date, prefix); }
    catch (failure) { throw new ApiError(400, failure instanceof Error ? failure.message : "Sprawdź wzór numeracji i datę."); }
    const [number, last] = await Promise.all([
      nextPersistedInvoiceNumber(prisma, companyId, pattern, date, prefix),
      prisma.invoice.findFirst({ where: { sellerCompanyId: companyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { number: true } }),
    ]);
    return json({ number, lastNumber: last?.number ?? null });
  } catch (failure) { return handleApiError(failure); }
}
