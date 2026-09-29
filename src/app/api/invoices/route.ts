import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { captureInvoicePrint } from "@/lib/pdf/invoice-print";
import { contractorForCompany } from "@/lib/company-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { parseInvoiceBody } from "@/lib/parsers";
import { requireCompanyAccess, getCompanyMembership } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";
import { claimInvoiceQuota } from "@/lib/invoice-quota";
import { DEFAULT_INVOICE_PATTERN, invoicePrefix, nextFormattedInvoiceNumber } from "@/lib/invoice-numbering";
import { invoiceBankAccountForCompany } from "@/lib/invoice-bank-account";

export const runtime = "nodejs";

/** POST /api/invoices — nowa faktura z granularną autoryzacją i audytem. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    if (body.isCorrection && typeof body.originalInvoiceId === "string" && /^[a-f0-9]{24}$/i.test(body.originalInvoiceId)) {
      const original = await prisma.invoice.findUnique({where:{id:body.originalInvoiceId},select:{documentKind:true}});
      if (original?.documentKind === "advance" || original?.documentKind === "final") throw new ApiError(400,"Korekta rozliczenia zaliczki wymaga odrębnego przeliczenia całego rozliczenia; ten formularz obsługuje korekty zwykłych faktur.");
    }

    // Sprawdź firmy powiązane z użytkownikiem
    const memberships = await prisma.companyMember.findMany({
      where: { userId: user.id },
      select: { companyId: true, company: { select: { userId: true } } },
    });
    const accessibleCompanyIds = memberships.map((m) => m.companyId);

    const buildData = (number: string) => parseInvoiceBody({ ...body, number }, {
      contractorOwnedBy: async (id) => contractorForCompany(user.id, id, body.sellerCompanyId),
      companyOwnedBy: async (id) =>
        accessibleCompanyIds.includes(id) ||
        (await prisma.companyProfile.count({ where: { id, userId: user.id } })) > 0,
    });

    // The server picks the next number from persisted documents, not from a stale browser tab.
    // A deterministic Mongo _id reserves that number atomically even on the first deploy.
    for (let attempt = 0; attempt < 8; attempt++) {
    const companyId = typeof body.sellerCompanyId === "string" ? body.sellerCompanyId : null;
    const autoNumber = body.autoNumber === true;
    let number = String(body.number ?? "");
    if (autoNumber) {
      if (!companyId || !/^[a-f0-9]{24}$/i.test(companyId)) throw new ApiError(400, "Wybierz firmę wystawiającą fakturę.");
      const seller = await prisma.companyProfile.findUnique({ where: { id: companyId }, select: { invoiceNumberPattern: true } });
      const reservationPrefix = `${companyId}:`;
      const [existing, reservations] = await Promise.all([
        prisma.invoice.findMany({ where: { sellerCompanyId: companyId }, select: { number: true } }),
        prisma.invoiceNumberClaim.findMany({ where: { id: { startsWith: reservationPrefix } }, select: { id: true } }),
      ]);
      number = nextFormattedInvoiceNumber(seller?.invoiceNumberPattern || DEFAULT_INVOICE_PATTERN,
        [...existing.map(inv => inv.number), ...reservations.map(claim => claim.id.slice(reservationPrefix.length))], String(body.issueDate || ""),
        invoicePrefix(String(body.type), body.isCorrection === true, body.isProforma === true));
    }
    const parsed = await buildData(number);
    const data = { ...parsed, ...await invoiceBankAccountForCompany(parsed.sellerCompanyId, parsed.bankAccountId, parsed.currency, body.bankAccountMode === "primary") };

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
        if (autoNumber && attempt < 7) continue;
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
        if (autoNumber && attempt < 7) continue;
        throw new ApiError(409, `Faktura o numerze "${data.number}" już istnieje.`);
      }
    }

    try {
    const invoice = await prisma.$transaction(async tx => {
    await assertAccountingPeriodsOpen(tx, [{ companyId: data.sellerCompanyId, issueDate: data.issueDate }]);
    await tx.invoiceNumberClaim.create({ data: { id: `${data.sellerCompanyId || user.id}:${data.number}` } });
    const issuedAt = data.type === "sale" && !data.isProforma && data.status !== "draft"
      ? await claimInvoiceQuota(tx, user.id, data.sellerCompanyId) : null;
    const invoice = await tx.invoice.create({
      data: {
        userId: user.id,
        ...data,
        issuedAt,
        version: 1,
        recurringUserId: data.isRecurring ? user.id : null,
      },
      include: {
        sellerCompany: {
          include: { bankAccounts: true },
        },
      },
    });

    await captureInvoicePrint(tx, invoice);
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
    } catch (error) {
      if ((error as { code?: string }).code === "P2002" || (error as { code?: string }).code === "P2034") {
        if (autoNumber && attempt < 7) continue;
        throw new ApiError(409, `Numer "${number}" jest już zajęty. Odśwież numer i spróbuj ponownie.`);
      }
      throw error;
    }
    }
    throw new ApiError(409, "Nie udało się nadać wolnego numeru faktury. Spróbuj ponownie.");
  } catch (e) {
    return handleApiError(e);
  }
}
