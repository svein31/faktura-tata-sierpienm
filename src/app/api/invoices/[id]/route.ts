import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { parseInvoiceBody } from "@/lib/parsers";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

/** GET /api/invoices/[id] — szczegóły (tylko własny rekord; 404 dla innych użytkowników). */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const existing = await prisma.invoice.findFirst({
      where: { id: params.id, userId: user.id },
      include: { sellerCompany: true },
    });
    if (!existing) return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });

    return json({ invoice: invoiceToDto(existing) });
  } catch (e) {
    return handleApiError(e);
  }
}

/** PUT /api/invoices/[id] — pełna aktualizacja (tylko własny rekord). */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const existing = await prisma.invoice.findFirst({ where: { id: params.id, userId: user.id } });
    if (!existing) return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });

    const body = await readJson(req);
    const data = await parseInvoiceBody(body, {
      contractorOwnedBy: async (id) =>
        (await prisma.contractor.count({ where: { id, userId: user.id } })) > 0,
      companyOwnedBy: async (id) =>
        (await prisma.companyProfile.count({ where: { id, userId: user.id } })) > 0,
    });

    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data,
      include: { sellerCompany: true },
    });
    return json({ invoice: invoiceToDto(invoice) });
  } catch (e) {
    return handleApiError(e);
  }
}

/** DELETE /api/invoices/[id] — usunięcie (tylko własny rekord). */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const existing = await prisma.invoice.findFirst({ where: { id: params.id, userId: user.id } });
    if (!existing) return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });

    await prisma.invoice.delete({ where: { id: existing.id } });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
