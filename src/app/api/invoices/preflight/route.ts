import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { contractorForCompany, objectId } from "@/lib/company-scope";
import { assessInvoice, type PreflightInput } from "@/lib/invoice-preflight";
import { invoiceTotals } from "@/lib/format";
import type { InvoiceLine } from "@/lib/types";
import { normalizeInvoiceLineAmounts } from "@/lib/invoice-input";
import { resolveInvoiceCorrectionSource } from "@/lib/invoice-correction-source";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    let body = await readJson(req);
    let access;
    try { access = await companyAccess(prisma, user.id, body.companyId, body.isCorrection === true ? "canCreateCorrections" : "canIssueInvoices"); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 403 || !objectId(body.invoiceId)) throw error;
      access = await companyAccess(prisma, user.id, body.companyId, "canSendKsef");
      const stored = await prisma.invoice.findFirst({ where: { id: body.invoiceId, sellerCompanyId: access.company.id } });
      if (!stored) throw new ApiError(404, "Nie znaleziono dokumentu.");
      body = { ...stored, companyId: access.company.id, invoiceId: stored.id };
    }
    const { company } = access;
    body = await resolveInvoiceCorrectionSource(prisma, user.id, { ...body, sellerCompanyId: company.id }, objectId(body.invoiceId) ? body.invoiceId : undefined);
    const seller = await prisma.companyProfile.findUniqueOrThrow({ where: { id: company.id } });
    let buyer: PreflightInput["buyer"];
    if (body.useNewContractor === true) {
      const raw = body.buyer as Record<string, unknown>;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, "Uzupełnij dane nabywcy.");
      buyer = { name: str(raw.name), nip: str(raw.nip), country: str(raw.country), taxIdType: str(raw.taxIdType), street: str(raw.street), city: str(raw.city), postal: str(raw.postal) };
    } else {
      if (!objectId(body.contractorId) || !await contractorForCompany(user.id, body.contractorId, company.id)) throw new ApiError(403, "Wybierz kontrahenta tej firmy.");
      const contact = await prisma.contractor.findUniqueOrThrow({ where: { id: body.contractorId } }), address = (contact.address || {}) as Record<string, unknown>;
      buyer = { name: contact.name, nip: contact.nip, country: contact.country || str(address.country), taxIdType: contact.taxIdType || "nip", street: str(address.street), city: str(address.city), postal: str(address.postal) };
    }
    if (!Array.isArray(body.lines) || body.lines.length > 200 || body.lines.some(l => !l || typeof l !== "object" || Array.isArray(l))) throw new ApiError(400, "Sprawdź pozycje faktury.");
    const lines = body.lines.map((l, index) => ({ id: str(l.id) || String(index), unit: str(l.unit) || "szt.", name: str(l.name), quantity: l.quantity, netPrice: l.netPrice, vatRate: str(l.vatRate), discount: typeof l.discount === "number" ? l.discount : 0 }));
    const totals = invoiceTotals({ lines: lines.map(normalizeInvoiceLineAmounts) as InvoiceLine[] });
    const input: PreflightInput = { number: str(body.number), issueDate: str(body.issueDate), saleDate: str(body.saleDate), dueDate: str(body.dueDate), currency: str(body.currency), lines, buyer, seller, correction: body.isCorrection === true, correctionReason: str(body.correctionReason), originalInvoiceNumber: str(body.originalInvoiceNumber), originalIssueDate: str(body.originalIssueDate), exemptionBasis: str(body.exemptionBasis), isSplitPayment: body.isSplitPayment === true, gross: totals.gross };
    const issues = assessInvoice(input);
    const exclude = objectId(body.invoiceId) ? { id: { not: body.invoiceId } } : {};
    if (body.autoNumber !== true) {
      const duplicate = await prisma.invoice.findFirst({ where: { sellerCompanyId: company.id, number: input.number, ...exclude }, select: { id: true, number: true } });
      if (duplicate) issues.push({ code: "duplicate.number", severity: "error", message: "Ten numer ma już inny dokument: " + duplicate.number, href: "/invoices/" + duplicate.id });
    }
    if (objectId(body.contractorId) && Number.isFinite(totals.gross) && !input.correction) {
      const similar = await prisma.invoice.findMany({ where: { sellerCompanyId: company.id, contractorId: body.contractorId, issueDate: input.issueDate, currency: input.currency, totalGross: { gte: totals.gross - 0.005, lte: totals.gross + 0.005 }, status: { not: "cancelled" }, ...exclude }, select: { id: true, number: true }, take: 3 });
      for (const candidate of similar) issues.push({ code: "duplicate.possible:" + candidate.id, severity: "warning", message: "Możliwy duplikat: " + candidate.number + ". Ten sam nabywca, dzień, waluta i kwota. Sprawdź, czy to odrębna sprzedaż.", href: "/invoices/" + candidate.id });
    }
    return json({ issues, canProceed: !issues.some(i => i.severity === "error"), checkedAt: new Date().toISOString(), totals });
  } catch (e) { return handleApiError(e); }
}
