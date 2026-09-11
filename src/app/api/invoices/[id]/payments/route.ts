import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, num, str } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { invoiceTotals, round2 } from "@/lib/format";
import type { InvoiceLine } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

/**
 * GET /api/invoices/[id]/payments — Lista wpłat zarejestrowanych dla faktury
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    if (!/^[0-9a-fA-F]{24}$/.test(params.id)) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!invoice) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const payments = await prisma.paymentRecord.findMany({
      where: { invoiceId: invoice.id, userId: user.id },
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
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    if (!/^[0-9a-fA-F]{24}$/.test(params.id)) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, userId: user.id },
      include: { sellerCompany: true },
    });

    if (!invoice) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
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
      },
      include: { sellerCompany: true },
    });

    // Zapisz audyt
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "payment_registered",
        entityType: "invoice",
        entityId: invoice.id,
        details: {
          paymentId: payment.id,
          amount,
          totalPaid,
          grossTotal,
          paymentStatus,
        },
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
        : `Zarejestrowano wpłatę ${amount.toFixed(2)} PLN. Pozostało do zapłaty: ${Math.max(0, grossTotal - totalPaid).toFixed(2)} PLN.`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
