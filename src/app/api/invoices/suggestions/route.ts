import { getSessionUser } from "@/lib/auth";
import { ApiError, assertObjectId, handleApiError, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { companyAccess } from "@/lib/company-write";
import { isAccountingInvoice } from "@/lib/accountant-summary";
import { summarizeInvoiceSuggestions } from "@/lib/invoice-suggestions";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const query = new URL(req.url).searchParams;
    const { company } = await companyAccess(prisma, user.id, query.get("companyId"), "canIssueInvoices");
    const contractorId = query.get("contractorId"), currency = query.get("currency") || "PLN";
    if (contractorId) assertObjectId(contractorId);
    if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "Nieprawidłowa waluta.");
    // Bounded projection: no XML, attachments, snapshots or customer-wide cache.
    const recent = await prisma.invoice.findMany({
      where: { sellerCompanyId: company.id, type: "sale", isCorrection: { not: true }, isProforma: { not: true }, status: { notIn: ["draft", "cancelled"] }, ...(contractorId ? { contractorId } : {}) },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }], take: 80,
      select: { number: true, contractorId: true, currency: true, lines: true, paymentMethod: true, paymentTermDays: true, status: true, documentStatus: true, issuedAt: true, type: true, isProforma: true },
    });
    const summary = summarizeInvoiceSuggestions(recent.filter(isAccountingInvoice), currency, contractorId);
    const contacts = await prisma.contractor.findMany({ where: { id: { in: [...summary.uses.keys()] }, OR: [{ companyId: company.id }, { companyId: null }, { companyId: { isSet: false } }] }, select: { id: true, name: true, nip: true } });
    return json({ contractors: contacts.map(contact => ({ ...contact, nip: contact.nip || "", uses: summary.uses.get(contact.id) || 0 })).sort((a, b) => b.uses - a.uses).slice(0, 5), lines: summary.lines, terms: summary.terms });
  } catch (error) { return handleApiError(error); }
}
