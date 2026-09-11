import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import * as crypto from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/orders/[id]/convert
 * Przekształca zlecenie w fakturę VAT
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await params;
    const order = await prisma.order.findFirst({
      where: { id, userId: user.id },
    });
    if (!order) return json({ error: "Zlecenie nie zostało znalezione." }, { status: 404 });

    const year = new Date().getFullYear();
    const invoiceCount = await prisma.invoice.count({ where: { userId: user.id, type: "sale" } });
    const invoiceNumber = `FV/${year}/${(invoiceCount + 1).toString().padStart(4, "0")}`;
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    const invoiceLines = [
      {
        id: `line_${Date.now()}`,
        name: order.title,
        quantity: 1,
        unit: "usł.",
        netPrice: order.totalNet || Math.round((order.totalGross / 1.23) * 100) / 100,
        vatRate: "23",
      },
    ];

    const invoice = await prisma.invoice.create({
      data: {
        userId: user.id,
        contractorId: order.contractorId || "",
        number: invoiceNumber,
        type: "sale",
        status: "issued",
        documentStatus: "issued",
        paymentStatus: "unpaid",
        issueDate: today,
        saleDate: today,
        dueDate,
        currency: order.currency,
        language: "PL",
        paymentMethod: "transfer",
        paymentTermDays: 14,
        notes: `Rozliczenie zlecenia ${order.number}: ${order.title}. ${order.notes || ""}`.trim(),
        lines: invoiceLines as any,
        shareToken: crypto.randomBytes(16).toString("hex"),
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "completed", billedInvoiceId: invoice.id },
    });

    return json({ success: true, invoice: invoiceToDto(invoice) });
  } catch (e) {
    return handleApiError(e);
  }
}
