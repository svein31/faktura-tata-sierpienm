import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { conversionInvoiceData, conversionNumber } from "@/lib/document-conversion";
import { recordAuditLog } from "@/lib/audit";
import { documentWhere, requireDocumentWrite } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto, orderToDto } from "@/lib/dto";
import * as crypto from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/offers/[id]/convert
 * body: { target: "invoice" | "order" }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await params;
    const offer = await prisma.offer.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!offer) return json({ error: "Oferta nie została znaleziona." }, { status: 404 });
    await requireDocumentWrite(user, offer);

    const body = await readJson(req);
    const target = body.target === "order" ? "order" : "invoice";
    const invoiceData = target === "invoice" ? await conversionInvoiceData(user.id, offer, offer.lines as unknown[], `Wystawiono na podstawie oferty ${offer.number}. ${offer.notes || ""}`.trim()) : null;
    return await prisma.$transaction(async tx => {
    if (["converted", "rejected", "expired"].includes(offer.status)) throw new ApiError(409, "Oferta została już przekształcona, odrzucona lub wygasła.");
    await tx.offer.update({ where: { id: offer.id, version: offer.version, status: offer.status }, data: { status: "converted", version: { increment: 1 } } });

    if (target === "order") {
      const orderCount = await tx.order.count({ where: { userId: user.id } });
      const orderNumber = `ZL/${new Date().getFullYear()}/${(orderCount + 1).toString().padStart(4, "0")}`;

      const order = await tx.order.create({
        data: {
          userId: user.id,
          companyId: offer.companyId,
          contractorId: offer.contractorId,
          contractorName: offer.contractorName,
          offerId: offer.id,
          number: orderNumber,
          title: `Realizacja oferty: ${offer.title}`,
          status: "in_progress",
          stages: [
            {
              id: "s1",
              name: "Realizacja całości zlecenia",
              amount: offer.totalGross,
              status: "in_progress",
              dueDate: offer.validUntil,
            },
          ],
          totalNet: offer.totalNet,
          totalGross: offer.totalGross,
          currency: offer.currency,
          notes: offer.notes,
        },
      });

      await tx.offer.update({
        where: { id: offer.id },
        data: { status: "converted", convertedOrderId: order.id },
      });

      await recordAuditLog({ client: tx, companyId: offer.companyId, userId: user.id, entityType: "offer", entityId: offer.id, action: "offer.converted", details: { orderId: order.id } });
      return json({ success: true, target: "order", order: orderToDto(order) });
    } else {
      // Konwersja do faktury
      await assertAccountingPeriodsOpen(tx, [{ companyId: invoiceData!.sellerCompanyId, issueDate: invoiceData!.issueDate }]);
      const invoiceNumber = await conversionNumber(tx, offer.companyId, user.id);
      const invoice = await tx.invoice.create({
        data: {
          userId: user.id,
          ...invoiceData!,
          number: invoiceNumber,
          shareToken: crypto.randomBytes(16).toString("hex"),
        },
      });

      await tx.offer.update({
        where: { id: offer.id },
        data: { status: "converted" },
      });

      await recordAuditLog({ client: tx, companyId: offer.companyId, userId: user.id, entityType: "offer", entityId: offer.id, action: "offer.converted", details: { invoiceId: invoice.id } });
      return json({ success: true, target: "invoice", invoice: invoiceToDto(invoice) });
    }
    });
  } catch (e) {
    return handleApiError(e);
  }
}
