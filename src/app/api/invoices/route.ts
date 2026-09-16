import { contractorForCompany } from "@/lib/company-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { parseInvoiceBody } from "@/lib/parsers";
import { requireCompanyAccess, getCompanyMembership } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

/** POST /api/invoices — nowa faktura z granularną autoryzacją i audytem. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);

    // Sprawdź firmy powiązane z użytkownikiem
    const memberships = await prisma.companyMember.findMany({
      where: { userId: user.id },
      select: { companyId: true, company: { select: { userId: true } } },
    });
    const accessibleCompanyIds = memberships.map((m) => m.companyId);

    const data = await parseInvoiceBody(body, {
      contractorOwnedBy: async (id) => contractorForCompany(user.id, id, body.sellerCompanyId),
      companyOwnedBy: async (id) =>
        accessibleCompanyIds.includes(id) ||
        (await prisma.companyProfile.count({ where: { id, userId: user.id } })) > 0,
    });

    // Weryfikacja granularnego uprawnienia do wystawiania faktur
    if (data.sellerCompanyId) {
      const access = await requireCompanyAccess(user.id, data.sellerCompanyId, data.isCorrection ? "canCreateCorrections" : "canIssueInvoices");
      if (!access.ok) throw new ApiError(access.status, access.error);
    }

    // Ochrona przed duplikatem numeru faktury w ramach profilu sprzedawcy
    if (data.sellerCompanyId) {
      const existingWithSameNumber = await prisma.invoice.findFirst({
        where: {
          sellerCompanyId: data.sellerCompanyId,
          number: data.number,
        },
      });
      if (existingWithSameNumber) {
        throw new ApiError(409, `Faktura o numerze "${data.number}" już istnieje w tej firmie.`);
      }
    } else {
      const existingWithSameNumber = await prisma.invoice.findFirst({
        where: {
          userId: user.id,
          sellerCompanyId: null,
          number: data.number,
        },
      });
      if (existingWithSameNumber) {
        throw new ApiError(409, `Faktura o numerze "${data.number}" już istnieje.`);
      }
    }

    const invoice = await prisma.$transaction(async tx => {
    const invoice = await tx.invoice.create({
      data: {
        userId: user.id,
        ...data,
        version: 1,
      },
      include: {
        sellerCompany: {
          include: { bankAccounts: true },
        },
      },
    });

    // Zarejestruj utworzenie dokumentu w trwałym dzienniku zdarzeń
    await recordAuditLog({
      client: tx,
      companyId: invoice.sellerCompanyId || undefined,
      documentId: invoice.id,
      userId: user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: "invoice_created",
      entityType: "invoice",
      entityId: invoice.id,
      description: `Wystawiono dokument ${invoice.number} (${invoice.currency})`,
      details: {
        number: invoice.number,
        type: invoice.type,
        currency: invoice.currency,
        exchangeRate: invoice.exchangeRate,
        exchangeRateTable: invoice.exchangeRateTable,
      },
    });

    return invoice;
    });

    return json({ invoice: invoiceToDto(invoice) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

