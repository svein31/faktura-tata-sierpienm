import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { invoiceTotals, round2 } from "@/lib/format";
import type { InvoiceLine } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/invoices/export — Eksport faktur za okres do CSV / JSON / ZIP dla księgowości
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const format = (str(body.format) || "csv").toLowerCase();
    const typeFilter = str(body.type) || "all"; // "sale" | "purchase" | "all"
    const dateFrom = str(body.dateFrom);
    const dateTo = str(body.dateTo);

    const whereClause: any = { userId: user.id };

    if (typeFilter === "sale" || typeFilter === "purchase") {
      whereClause.type = typeFilter;
    }

    if (dateFrom && dateTo) {
      whereClause.issueDate = { gte: dateFrom, lte: dateTo };
    } else if (dateFrom) {
      whereClause.issueDate = { gte: dateFrom };
    } else if (dateTo) {
      whereClause.issueDate = { lte: dateTo };
    }

    const [invoices, contractors] = await Promise.all([
      prisma.invoice.findMany({
        where: whereClause,
        include: {
          sellerCompany: true,
        },
        orderBy: { issueDate: "asc" },
      }),
      prisma.contractor.findMany({
        where: { userId: user.id },
      }),
    ]);

    const contractorMap = new Map(contractors.map((c) => [c.id, c]));

    // Zapisz audyt
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "invoices_exported",
        entityType: "invoice_batch",
        entityId: `${dateFrom || "all"}_${dateTo || "all"}`,
        details: {
          count: invoices.length,
          format,
          typeFilter,
          userRole: user.role,
        },
      },
    });

    if (format === "csv") {
      // Nagłówki CSV ze średnikiem (standard polskiego Excela)
      const headers = [
        "Lp",
        "Typ dokumentu",
        "Numer faktury",
        "Data wystawienia",
        "Data sprzedaży",
        "Termin płatności",
        "Kontrahent",
        "NIP Kontrahenta",
        "Netto PLN",
        "VAT PLN",
        "Brutto PLN",
        "Status płatności",
        "Zapłacono PLN",
        "Pozostało PLN",
        "Status KSeF",
        "Numer KSeF",
        "Waluta",
      ];

      const rows = invoices.map((inv, idx) => {
        const lines = (inv.lines as unknown as InvoiceLine[]) || [];
        const t = invoiceTotals({ lines } as any);
        const paid = round2(inv.paidAmount || 0);
        const remaining = round2(Math.max(0, t.gross - paid));
        const contractor = inv.contractorId ? contractorMap.get(inv.contractorId) : null;
        const contractorName = contractor?.name || inv.nip || "Klient detaliczny";
        const contractorNip = contractor?.nip || inv.nip || "—";

        const docType = inv.type === "purchase" ? "Zakupowa (FZ)" : (inv.isCorrection ? "Korekta (KOR)" : "Sprzedaż (FS)");

        return [
          idx + 1,
          `"${docType}"`,
          `"${inv.number}"`,
          inv.issueDate,
          inv.saleDate || inv.issueDate,
          inv.dueDate || "—",
          `"${contractorName.replace(/"/g, '""')}"`,
          `"${contractorNip}"`,
          t.net.toFixed(2).replace(".", ","),
          t.vat.toFixed(2).replace(".", ","),
          t.gross.toFixed(2).replace(".", ","),
          inv.paymentStatus || (inv.status === "paid" ? "paid" : "unpaid"),
          paid.toFixed(2).replace(".", ","),
          remaining.toFixed(2).replace(".", ","),
          inv.ksefStatus || (inv.ksefNumber ? "accepted" : "none"),
          `"${inv.ksefNumber || "—"}"`,
          inv.currency || "PLN",
        ].join(";");
      });

      // UTF-8 BOM dla poprawnego otwierania polskich znaków w Excelu
      const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="eksport-faktur-${dateFrom || "od-poczatku"}-${dateTo || "do-teraz"}.csv"`,
        },
      });
    }

    // Domyślnie format JSON
    return json({
      count: invoices.length,
      dateFrom,
      dateTo,
      invoices: invoices.map((inv) => {
        const lines = (inv.lines as unknown as InvoiceLine[]) || [];
        const t = invoiceTotals({ lines } as any);
        return {
          id: inv.id,
          number: inv.number,
          type: inv.type,
          isCorrection: inv.isCorrection,
          issueDate: inv.issueDate,
          saleDate: inv.saleDate,
          dueDate: inv.dueDate,
          contractor: inv.contractorId && contractorMap.has(inv.contractorId)
            ? { name: contractorMap.get(inv.contractorId)!.name, nip: contractorMap.get(inv.contractorId)!.nip }
            : null,
          totals: t,
          paidAmount: inv.paidAmount || 0,
          paymentStatus: inv.paymentStatus,
          ksefStatus: inv.ksefStatus,
          ksefNumber: inv.ksefNumber,
        };
      }),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
