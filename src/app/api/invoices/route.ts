import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { parseInvoiceBody } from "@/lib/parsers";

export const runtime = "nodejs";

/** POST /api/invoices — nowa faktura bieżącego użytkownika. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const data = await parseInvoiceBody(body, {
      contractorOwnedBy: async (id) =>
        (await prisma.contractor.count({ where: { id, userId: user.id } })) > 0,
      companyOwnedBy: async (id) =>
        (await prisma.companyProfile.count({ where: { id, userId: user.id } })) > 0,
    });

    const invoice = await prisma.invoice.create({
      data: { userId: user.id, ...data },
      include: { sellerCompany: true },
    });
    return json({ invoice: invoiceToDto(invoice) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
