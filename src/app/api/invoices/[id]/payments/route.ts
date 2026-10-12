import { PURCHASE_INVOICE_READ_ONLY } from "@/lib/invoice-policy";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { invoiceTotals, round2 } from "@/lib/format";
import type { InvoiceLine } from "@/lib/types";
import { getCompanyMembership, requireCompanyAccess } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { parseInvoicePayment } from "@/lib/invoice-payment";
import { warsawDate } from "@/lib/scheduling";
import { companyWriteAccess } from "@/lib/company-write";

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

    const { amount, method, note, paidAt } = parseInvoicePayment(await readJson(req));
    let ledger;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        ledger = await prisma.$transaction(async tx => {
          const current = await tx.invoice.findUnique({ where: { id: invoice.id } });
          if (!current) throw new ApiError(404, "Nie znaleziono faktury.");
          if (current.sellerCompanyId) {
            await companyWriteAccess(tx, user.id, current.sellerCompanyId, "canRecordPayments");
          } else if (current.userId !== user.id) {
            throw new ApiError(404, "Nie znaleziono faktury.");
          }
          if (!current.sellerCompanyId) {
            const actor = await tx.user.findUnique({ where: { id: user.id }, select: { role: true } });
            if (!actor || !["owner", "accountant"].includes(actor.role)) throw new ApiError(403, "Brak uprawnienia do rejestrowania wpłat.");
          }
          if (current.type !== "sale" || current.isProforma || current.status === "draft" || current.documentStatus === "draft" || current.documentStatus === "cancelled") throw new ApiError(409, "Wpłatę można zarejestrować do wystawionej faktury sprzedaży.");
          await assertAccountingPeriodsOpen(tx, [{ companyId: current.sellerCompanyId, issueDate: current.issueDate }]);
          // Claim the invoice inside the ledger transaction. Concurrent payments,
          // invoice edits, imports and period closing must serialize on the same row.
          await tx.invoice.update({ where: { id: current.id }, data: { version: (current.version ?? 1) + 1 } });
          const grossTotal = invoiceTotals({ lines: current.lines as unknown as InvoiceLine[] }).gross;
          if (!Number.isFinite(grossTotal) || grossTotal <= 0) throw new ApiError(409, "Sprawdź dodatnią kwotę faktury przed rejestracją wpłaty.");
          const previousPayments = await tx.paymentRecord.findMany({ where: { invoiceId: current.id }, select: { amount: true } });
          // Historical records may carry a paidAmount without itemised entries.
          // Preserve that opening balance; a new entry cannot erase old payments.
          const previousLedger = round2(previousPayments.reduce((sum, item) => sum + item.amount, 0));
          const previousPaid = Math.max(Number.isFinite(current.paidAmount) ? current.paidAmount ?? 0 : 0, previousLedger);
          if (current.status === "paid" || current.paymentStatus === "paid" || previousPaid >= grossTotal) throw new ApiError(409, "Faktura jest już opłacona. Odśwież jej dane przed kolejną operacją.");
          const payment = await tx.paymentRecord.create({ data: { invoiceId: current.id, userId: user.id, amount, paidAt, method, note } });
          const totalPaid = round2(previousPaid + amount);
          if (!Number.isFinite(totalPaid) || totalPaid > 1e12) throw new ApiError(400, "Suma wpłat przekracza obsługiwany zakres.");
          const paymentStatus = totalPaid >= grossTotal ? "paid" : totalPaid > 0 ? "partially_paid" : current.dueDate < warsawDate() ? "overdue" : "unpaid";
          const updatedInvoice = await tx.invoice.update({ where: { id: current.id }, data: { paidAmount: totalPaid, paymentStatus, status: paymentStatus === "paid" ? "paid" : current.status }, include: { sellerCompany: { include: { bankAccounts: true } }, payments: true } });
          await recordAuditLog({ client: tx, companyId: current.sellerCompanyId || undefined, documentId: current.id, userId: user.id, userName: user.name || user.email, userEmail: user.email, action: "payment_registered", entityType: "invoice", entityId: current.id, description: `Zarejestrowano wpłatę ${amount.toFixed(2)} ${current.currency} do faktury ${current.number}`, details: { paymentId: payment.id, amount, totalPaid, grossTotal, paymentStatus, currency: current.currency, method } });
          return { payment, totalPaid, grossTotal, paymentStatus, updatedInvoice };
        });
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2034" || attempt === 7) throw error;
        await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1) + Math.floor(Math.random() * 20)));
      }
    }
    if (!ledger) throw new ApiError(409, "Faktura zmieniła się podczas zapisu wpłaty. Spróbuj ponownie.");
    const { payment, totalPaid, grossTotal, paymentStatus, updatedInvoice } = ledger;

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
