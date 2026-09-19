import { conversionInvoiceData, conversionNumber } from "@/lib/document-conversion";
import { offerAmounts } from "@/lib/offer-validation";
import { recordAuditLog } from "@/lib/audit";
import { documentWhere, requireDocumentWrite } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
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
      where: { id, ...await documentWhere(user.id) },
    });
    if (!order) return json({ error: "Zlecenie nie zostało znalezione." }, { status: 404 });
    await requireDocumentWrite(user, order);

    let lines: unknown[] = [{ id: "order", name: order.title, quantity: 1, unit: "usł.", netPrice: order.totalNet, vatRate: "23" }];
    if (order.offerId) {
      const source = await prisma.offer.findFirst({ where: { id: order.offerId, companyId: order.companyId, ...(!order.companyId ? { userId: user.id } : {}) } });
      if (source && Array.isArray(source.lines)) lines = source.lines;
    }
    const totals = offerAmounts(lines);
    if (Math.abs(totals.totalNet - order.totalNet) > 0.011 || Math.abs(totals.totalGross - order.totalGross) > 0.011) throw new ApiError(400, "Kwoty zlecenia nie odpowiadają pozycjom i stawkom VAT. Wystaw fakturę w formularzu z właściwymi stawkami.");
    const invoiceData = await conversionInvoiceData(user.id, order, lines, `Rozliczenie zlecenia ${order.number}: ${order.title}. ${order.notes || ""}`.trim());
    return await prisma.$transaction(async tx => {
    if (order.billedInvoiceId || order.status === "cancelled") throw new ApiError(409, "Zlecenie jest już rozliczone lub anulowane.");
    await tx.order.update({ where: { id: order.id, updatedAt: order.updatedAt }, data: { status: "completed" } });
    const invoiceNumber = await conversionNumber(tx, order.companyId, user.id);
    const invoice = await tx.invoice.create({
      data: {
        userId: user.id,
        ...invoiceData,
        number: invoiceNumber,
        shareToken: crypto.randomBytes(16).toString("hex"),
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: { status: "completed", billedInvoiceId: invoice.id },
    });

    await recordAuditLog({ client: tx, companyId: order.companyId, userId: user.id, entityType: "order", entityId: order.id, action: "order.converted", details: { invoiceId: invoice.id } });
    return json({ success: true, invoice: invoiceToDto(invoice) });
    });
  } catch (e) {
    return handleApiError(e);
  }
}

