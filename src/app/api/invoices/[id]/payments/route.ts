import { PURCHASE_INVOICE_READ_ONLY } from "@/lib/invoice-policy";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, handleApiError, json, readJson, num, str } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { invoiceTotals, round2 } from "@/lib/format";
import type { InvoiceLine } from "@/lib/types";
import { getCompanyMembership, requireCompanyAccess } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Pomocnicza funkcja weryfikacji dostępu do faktury */
async function getInvoiceWithAccess(invoiceId: string, userId: string) {
  if (!/^[0-9a-fA-F]{24}$/.test(invoiceId)) return null;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      sellerCompany: { include: { bankAccounts: true } },
      payments: true,
    },
  });

  if (!invoice) return null;

  if (!invoice.sellerCompanyId && invoice.userId === userId) {
    return { invoice, isDirectOwner: true };
  }

  if (invoice.sellerCompanyId) {
    const membership = await getCompanyMembership(userId, invoice.sellerCompanyId);
    if (membership) {
      return { invoice, isDirectOwner: false };
    }
  }

  return null;
}

/**
 * GET /api/invoices/[id]/payments — Lista wpłat zarejestrowanych dla faktury
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const result = await getInvoiceWithAccess((await params).id, user.id);
    if (!result) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const payments = await prisma.paymentRecord.findMany({
      where: { invoiceId: result.invoice.id },
      orderBy: { paidAt: "desc" },
    });

    return json({ payments });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/invoices/[id]/payments — Rejestracja wpłaty (częściowej lub całkowitej)
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const result = await getInvoiceWithAccess((await params).id, user.id);
    if (!result) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const { invoice } = result;
    if (invoice.type === "purchase") throw new ApiError(403, PURCHASE_INVOICE_READ_ONLY);

    // Sprawdź uprawnienie do rejestracji płatności w firmie
    if (invoice.sellerCompanyId) {
      const access = await requireCompanyAccess(user.id, invoice.sellerCompanyId, "canRecordPayments");
        if (!access.ok) throw new ApiError(access.status, access.error);
    }

    const body = await readJson(req);
    const amount = round2(num(body.amount));
    const method = str(body.method) || "transfer";
    const note = str(body.note) || null;
    const paidAtStr = str(body.paidAt);
    const paidAt = paidAtStr ? new Date(paidAtStr) : new Date();

    if (isNaN(amount) || amount <= 0) {
      throw new ApiError(400, "Kwota wpłaty musi być większa od 0.");
    }

    // Oblicz kwotę brutto faktury
    const lines = (invoice.lines as unknown as InvoiceLine[]) || [];
    const totals = invoiceTotals({ lines } as any);
    const grossTotal = round2(totals.gross);

    // Utwórz wpłatę
    const payment = await prisma.paymentRecord.create({
      data: {
        invoiceId: invoice.id,
        userId: user.id,
        amount,
        paidAt,
        method,
        note,
      },
    });

    // Oblicz sumę wszystkich wpłat dla tej faktury
    const allPayments = await prisma.paymentRecord.findMany({
      where: { invoiceId: invoice.id },
    });
    const totalPaid = round2(allPayments.reduce((acc, p) => acc + p.amount, 0));

    // Ustal status płatności
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = invoice.dueDate ? invoice.dueDate < today : false;

    let paymentStatus: "unpaid" | "partially_paid" | "paid" | "overdue" = "unpaid";
    if (totalPaid >= grossTotal) {
      paymentStatus = "paid";
    } else if (totalPaid > 0) {
      paymentStatus = "partially_paid";
    } else if (isOverdue) {
      paymentStatus = "overdue";
    }

    // Aktualizuj fakturę
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: totalPaid,
        paymentStatus,
        status: paymentStatus === "paid" ? "paid" : invoice.status,
        version: (invoice.version || 1) + 1,
      },
      include: {
        sellerCompany: { include: { bankAccounts: true } },
        payments: true,
      },
    });

    // Zapisz zdarzenie w dzienniku audytu firmy
    await recordAuditLog({
      companyId: invoice.sellerCompanyId || undefined,
      documentId: invoice.id,
      userId: user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: "payment_registered",
      entityType: "invoice",
      entityId: invoice.id,
      description: `Zarejestrowano wpłatę ${amount.toFixed(2)} ${invoice.currency} do faktury ${invoice.number}`,
      details: {
        paymentId: payment.id,
        amount,
        totalPaid,
        grossTotal,
        paymentStatus,
        currency: invoice.currency,
        method,
      },
    });

    return json({
      success: true,
      payment,
      paidAmount: totalPaid,
      remainingAmount: round2(Math.max(0, grossTotal - totalPaid)),
      paymentStatus,
      invoice: invoiceToDto(updatedInvoice),
      message: paymentStatus === "paid"
        ? "Faktura została w całości opłacona."
        : `Zarejestrowano wpłatę ${amount.toFixed(2)} ${invoice.currency}. Pozostało do zapłaty: ${Math.max(0, grossTotal - totalPaid).toFixed(2)} ${invoice.currency}.`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
