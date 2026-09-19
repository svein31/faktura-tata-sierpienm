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

    return await prisma.$transaction(async tx => {
    if (["converted", "rejected", "expired"].includes(offer.status)) throw new ApiError(409, "Oferta została już przekształcona, odrzucona lub wygasła.");
    await tx.offer.update({ where: { id: offer.id, version: offer.version, status: offer.status }, data: { status: "converted", version: { increment: 1 } } });
    const body = await readJson(req);
    const target = body.target === "order" ? "order" : "invoice";

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

      return json({ success: true, target: "order", order: orderToDto(order) });
    } else {
      // Konwersja do faktury
      const year = new Date().getFullYear();
      const invoiceCount = await tx.invoice.count({ where: { userId: user.id, type: "sale" } });
      const invoiceNumber = `FV/${year}/${(invoiceCount + 1).toString().padStart(4, "0")}`;
      const today = new Date().toISOString().slice(0, 10);
      const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const invoice = await tx.invoice.create({
        data: {
          userId: user.id,
          sellerCompanyId: offer.companyId,
          contractorId: offer.contractorId || "",
          number: invoiceNumber,
          type: "sale",
          status: "issued",
          documentStatus: "issued",
          paymentStatus: "unpaid",
          issueDate: today,
          saleDate: today,
          dueDate,
          currency: offer.currency,
          language: "PL",
          paymentMethod: "transfer",
          paymentTermDays: 14,
          notes: `Wystawiono na podstawie oferty ${offer.number}. ${offer.notes || ""}`.trim(),
          totalNet: offer.totalNet, totalVat: offer.totalGross - offer.totalNet, totalGross: offer.totalGross,
          lines: offer.lines as any,
          shareToken: crypto.randomBytes(16).toString("hex"),
        },
      });

      await tx.offer.update({
        where: { id: offer.id },
        data: { status: "converted" },
      });

      return json({ success: true, target: "invoice", invoice: invoiceToDto(invoice) });
    }
    });
  } catch (e) {
    return handleApiError(e);
  }
}

