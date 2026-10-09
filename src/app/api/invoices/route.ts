import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { captureInvoicePrint } from "@/lib/pdf/invoice-print";
import { contractorForCompany } from "@/lib/company-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { parseInvoiceBody } from "@/lib/parsers";
import { requireCompanyAccess } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";
import { claimInvoiceQuota } from "@/lib/invoice-quota";
import { DEFAULT_INVOICE_PATTERN, invoicePrefix } from "@/lib/invoice-numbering";
import { nextPersistedInvoiceNumber } from "@/lib/invoice-numbering-server";
import { invoiceBankAccountForCompany } from "@/lib/invoice-bank-account";
import { recordPilotEvent } from "@/lib/pilot-metrics";
import { invoiceNumberScope } from "@/lib/invoice-number-scope";
import { resolveInvoiceCorrectionSource } from "@/lib/invoice-correction-source";
import { warsawDate } from "@/lib/scheduling";

export const runtime = "nodejs";

/** POST /api/invoices — nowa faktura z granularną autoryzacją i audytem. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await resolveInvoiceCorrectionSource(prisma, user.id, await readJson(req));

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
      number = await nextPersistedInvoiceNumber(prisma, companyId, seller?.invoiceNumberPattern || DEFAULT_INVOICE_PATTERN,
        String(body.issueDate || ""),
        invoicePrefix(String(body.type), body.isCorrection === true, body.isProforma === true));
    }
    const parsed = await buildData(number);
    if (parsed.status === "paid" || (parsed.paidAmount ?? 0) > 0 || ["paid", "partially_paid"].includes(parsed.paymentStatus))
      throw new ApiError(409, "Najpierw zapisz fakturę, a następnie zarejestruj wpłatę w osobnej operacji płatności.");
    // Creating/importing a cost cannot approve it. Approval has its own role-checked workflow.
    const data = { ...parsed, paidAmount: 0, paymentStatus: parsed.status !== "draft" && parsed.dueDate < warsawDate() ? "overdue" : "unpaid", approvalStatus: "pending", ...await invoiceBankAccountForCompany(parsed.sellerCompanyId, parsed.bankAccountId, parsed.currency, body.bankAccountMode === "primary") };

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
        select: { id: true },
      });
      if (existingWithSameNumber) {
        if (autoNumber && attempt < 7) continue;
        throw new ApiError(409, `Faktura o numerze "${data.number}" już istnieje w tej firmie.`);
      }
    } else {
      const existingWithSameNumber = await prisma.invoice.findFirst({
        where: {
          ...invoiceNumberScope(user.id, null),
          number: data.number,
        },
        select: { id: true },
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

    if (invoice.type === "sale" && !invoice.isProforma && invoice.issuedAt) recordPilotEvent(req, "first_invoice");
    return json({ invoice: invoiceToDto(invoice) }, { status: 201 });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2034") {
        // A quota/accounting CAS conflict rolls back the complete transaction. It does
        // not mean a manually entered invoice number is occupied; retry both modes.
        if (attempt < 7) {
          await new Promise(resolve => setTimeout(resolve, Math.min(200, 20 * (attempt + 1)) + Math.floor(Math.random() * 30)));
          continue;
        }
        throw new ApiError(409, "Firma wystawia równocześnie wiele dokumentów. Spróbuj ponownie za chwilę.");
      }
      if (code === "P2002") {
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
