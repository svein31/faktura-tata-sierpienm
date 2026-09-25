import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { parseInvoicePattern } from "@/lib/invoice-numbering";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany." }, { status: 401 });
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new ApiError(404, "Nie znaleziono firmy.");
    const company = await prisma.companyProfile.findFirst({ where: { id, userId: user.id } });
    if (!company) throw new ApiError(403, "Format numeracji może ustawić właściciel firmy.");
    const body = await readJson(req);
    if (typeof body.pattern !== "string") throw new ApiError(400, "Podaj format numeru.");
    const pattern = body.pattern.trim();
    try { parseInvoicePattern(pattern); }
    catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "Nieprawidłowy format numeru."); }
    const updated = await prisma.companyProfile.update({ where: { id }, data: { invoiceNumberPattern: pattern } });
    return json({ pattern: updated.invoiceNumberPattern });
  } catch (error) { return handleApiError(error); }
}
