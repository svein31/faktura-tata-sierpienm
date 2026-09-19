import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { invoiceToDto, expenseToDto } from "@/lib/dto";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { isAccountingInvoice, monthlySummary } from "@/lib/accountant-summary";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const url = new URL(req.url);
    const period = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new ApiError(400, "Nieprawidłowy miesiąc.");
    const companyId = url.searchParams.get("companyId");
    if (!objectId(companyId)) throw new ApiError(400, "Wybierz firmę do zestawienia.");
    const access = await requireCompanyAccess(user.id, companyId, "canExport");
    if (!access.ok) throw new ApiError(access.status, access.error);
    const currency = url.searchParams.get("currency") || "PLN";
    if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "Nieprawidłowa waluta.");
    const [records, costs] = await Promise.all([
      prisma.invoice.findMany({ where: { sellerCompanyId: companyId, issueDate: { startsWith: period }, currency }, orderBy: { issueDate: "asc" } }),
      prisma.expense.findMany({ where: { companyId, issueDate: { startsWith: period }, currency }, orderBy: { issueDate: "asc" } }),
    ]);
    const posted = records.filter(isAccountingInvoice);
    const invoices = posted.filter(i => i.type === "sale");
    const purchases = posted.filter(i => i.type === "purchase");
    // Avoid counting a KSeF invoice twice when it has an expense-register counterpart.
    const refs = new Set(purchases.map(i => i.ksefNumber).filter(Boolean));
    const expenses = costs.filter(e => !e.ksefRefNumber || !refs.has(e.ksefRefNumber));
    return json({ period, companyId, currency, summary: monthlySummary(invoices, [...purchases, ...expenses], currency), invoices: invoices.map(invoiceToDto), purchases: purchases.map(invoiceToDto), expenses: expenses.map(expenseToDto), notice: "Zestawienie w walucie dokumentów. Nie stanowi wyliczenia zobowiązania podatkowego. Dokumenty bez przypisanej firmy nie są uwzględniane." });
  } catch (e) { return handleApiError(e); }
}
