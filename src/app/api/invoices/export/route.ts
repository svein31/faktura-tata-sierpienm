import { requireRecentAuth } from "@/lib/security-policy";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { invoiceTotals, round2 } from "@/lib/format";
import { csvCell } from "@/lib/accountant-summary";
import { spreadsheet } from "@/lib/xlsx";
import { recordAuditLog } from "@/lib/audit";
import type { InvoiceLine } from "@/lib/types";
import type { Prisma } from "@prisma/client";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return POST(new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(Object.fromEntries(q)) }));
}
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    await requireRecentAuth(user.id);
    const body = await readJson(req), format = (str(body.format) || "csv").toLowerCase(), typeFilter = str(body.type) || "all", dateFrom = str(body.dateFrom), dateTo = str(body.dateTo);
    if (!["csv", "json", "xlsx"].includes(format) || !["sale", "purchase", "all"].includes(typeFilter)) throw new ApiError(400, "Nieprawidłowy format lub rodzaj eksportu.");
    for (const d of [dateFrom, dateTo].filter(Boolean)) {
      const parsed = new Date(d + "T00:00:00Z");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) throw new ApiError(400, "Nieprawidłowy zakres dat.");
    }
    if (dateFrom && dateTo && dateFrom > dateTo) throw new ApiError(400, "Początek okresu jest późniejszy niż koniec.");
    const companyId = body.companyId;
    if (companyId !== undefined && !objectId(companyId)) throw new ApiError(400, "Wybierz poprawną firmę.");
    if (companyId) { const access = await requireCompanyAccess(user.id, companyId as string, "canExport"); if (!access.ok) throw new ApiError(access.status, access.error); }
    const where: Prisma.InvoiceWhereInput = { ...(companyId ? { sellerCompanyId: companyId as string } : { userId: user.id }), ...(typeFilter !== "all" ? { type: typeFilter } : {}), ...(dateFrom || dateTo ? { issueDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}) };
    const invoices = await prisma.invoice.findMany({ where, orderBy: { issueDate: "asc" }, take: 10001 });
    if (invoices.length > 10000) throw new ApiError(413, "Wybierz krótszy okres (maksymalnie 10 000 faktur).");
    if (!companyId) for (const id of new Set(invoices.map(i => i.sellerCompanyId).filter(Boolean))) {
      const access = await requireCompanyAccess(user.id, id!, "canExport"); if (!access.ok) throw new ApiError(access.status, access.error);
    }
    if (!companyId && user.role === "viewer") throw new ApiError(403, "Brak uprawnień eksportu.");
    const contacts = await prisma.contractor.findMany({ where: { id: { in: invoices.map(i => i.contractorId) } } }), contactMap = new Map(contacts.map(c => [c.id, c]));
    const headers = ["Lp", "Rodzaj", "Numer", "Data wystawienia", "Data sprzedaży", "Termin płatności", "Kontrahent", "NIP", "Waluta", "Netto", "VAT", "Brutto", "Zapłacono", "Pozostało", "Netto PLN", "VAT PLN", "Brutto PLN", "Status płatności", "Status KSeF", "Numer KSeF"];
    const data = invoices.map((i, index) => {
      const totals = invoiceTotals({ lines: (i.lines as unknown as InvoiceLine[]) || [] }), contact = contactMap.get(i.contractorId), paid = round2(i.paidAmount || 0);
      const row = [index + 1, i.isProforma ? "Proforma" : i.isCorrection ? "Korekta" : i.type === "purchase" ? "Zakup" : "Sprzedaż", i.number, i.issueDate, i.saleDate, i.dueDate, contact?.name || "", contact?.nip || i.nip || "", i.currency, totals.net, totals.vat, totals.gross, paid, round2(Math.max(0, totals.gross - paid)), i.currency === "PLN" ? totals.net : i.totalNetPln, i.currency === "PLN" ? totals.vat : i.totalVatPln, i.currency === "PLN" ? totals.gross : i.totalGrossPln, i.paymentStatus, i.ksefStatus, i.ksefNumber || ""];
      return { row, dto: { id: i.id, number: i.number, type: i.type, isCorrection: i.isCorrection, issueDate: i.issueDate, saleDate: i.saleDate, dueDate: i.dueDate, currency: i.currency, contractor: contact ? { name: contact.name, nip: contact.nip } : null, totals, paidAmount: paid, paymentStatus: i.paymentStatus, ksefStatus: i.ksefStatus, ksefNumber: i.ksefNumber } };
    });
    await recordAuditLog({ companyId: companyId as string | undefined, userId: user.id, userName: user.name, userEmail: user.email, action: "invoices_exported", entityType: "invoice_batch", entityId: dateFrom + "_" + dateTo, details: { count: data.length, format, typeFilter } });
    if (format === "json") return json({ count: data.length, dateFrom, dateTo, invoices: data.map(d => d.dto) });
    const rows = [headers, ...data.map(d => d.row)], filename = "eksport-faktur-" + (dateFrom || "start") + "-" + (dateTo || "teraz");
    return new Response(format === "xlsx" ? new Uint8Array(spreadsheet(rows)) : "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n"), { headers: { "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.${format}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return handleApiError(e); }
}
