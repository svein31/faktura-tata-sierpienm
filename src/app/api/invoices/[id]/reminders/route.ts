import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { formatMoney, invoiceTotals } from "@/lib/format";
import type { InvoiceLine } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

/**
 * GET /api/invoices/[id]/reminders — Podgląd treści wezwania / przypomnienia o płatności
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
      include: { sellerCompany: true },
    });

    if (!invoice) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    let contractor = null;
    if (invoice.contractorId) {
      contractor = await prisma.contractor.findFirst({
        where: { id: invoice.contractorId, userId: user.id },
      });
    }

    const totals = invoiceTotals({ lines: (invoice.lines as unknown as InvoiceLine[]) || [] } as any);
    const paidAmount = invoice.paidAmount || 0;
    const remaining = Math.max(0, totals.gross - paidAmount);

    const subject = `Przypomnienie o płatności: Faktura ${invoice.number}`;
    const message = `Szanowni Państwo,\n\nUprzejmie przypominamy o upływie terminu płatności dla faktury ${invoice.number} z dnia ${invoice.issueDate}.\n\nTermin płatności minął: ${invoice.dueDate || "—"}.\nKwota do zapłaty: ${formatMoney(remaining, (invoice.currency as any) || "PLN")}.\n\nProsimy o uregulowanie należności na rachunek bankowy:\n${invoice.sellerCompany?.bankAccount || "Zgodnie z fakturą"}\n\nJeśli płatność została już zrealizowana, prosimy o zignorowanie tej wiadomości.\n\nZ poważaniem,\n${invoice.sellerCompany?.companyName || user.name || "Fakturo"}`;

    return json({
      subject,
      message,
      recipientEmail: contractor?.email || "",
      remainingAmount: remaining,
      dueDate: invoice.dueDate,
      reminderCount: invoice.paymentReminderCount || 0,
      lastSentAt: invoice.lastPaymentReminderSentAt,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/invoices/[id]/reminders — Rejestracja wysłania przypomnienia o płatności
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
    });

    if (!invoice) {
      throw new ApiError(404, "Nie znaleziono faktury.");
    }

    const now = new Date();
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        lastPaymentReminderSentAt: now,
        paymentReminderCount: { increment: 1 },
      },
    });

    // Zapisz audyt
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "payment_reminder_sent",
        entityType: "invoice",
        entityId: invoice.id,
        details: {
          sentAt: now,
          reminderCount: updated.paymentReminderCount,
        },
      },
    });

    return json({
      success: true,
      sentAt: now,
      reminderCount: updated.paymentReminderCount,
      invoice: invoiceToDto(updated),
      message: `Wysłano przypomnienie o płatności (łącznie: ${updated.paymentReminderCount}).`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
