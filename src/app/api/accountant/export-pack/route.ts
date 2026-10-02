import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { invoiceToDto, expenseToDto } from "@/lib/dto";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { isAccountingInvoice, monthlySummary, financialAmounts, csvCell } from "@/lib/accountant-summary";

import {workbook,zipFiles,DOCUMENT_HEADERS,documentRow} from "@/lib/export/files";
import {recordAuditLog} from "@/lib/audit";

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
      prisma.invoice.findMany({ where: { sellerCompanyId: companyId, issueDate: { startsWith: period }, currency }, orderBy: { issueDate: "asc" }, take: 10001 }),
      prisma.expense.findMany({ where: { companyId, issueDate: { startsWith: period }, currency }, orderBy: { issueDate: "asc" }, take: 10001 }),
    ]);
    if(records.length>10000||costs.length>10000)throw new ApiError(413,"Zawęź eksport do 10 000 dokumentów.");
    const posted = records.filter(isAccountingInvoice);
    const invoices = posted.filter(i => i.type === "sale");
    const purchases = posted.filter(i => i.type === "purchase");
    // Avoid counting a KSeF invoice twice when it has an expense-register counterpart.
    const refs = new Set(purchases.map(i => i.ksefNumber).filter(Boolean));
    const expenses = costs.filter(e => !e.ksefRefNumber || !refs.has(e.ksefRefNumber));
    const format=url.searchParams.get("format")||"json";if(!["json","zip"].includes(format))throw new ApiError(400,"Obsługiwane formaty: JSON i ZIP.");
    if(format==="zip"){
      const documents=[...posted.map(d=>({...d,...financialAmounts(d),kind:d.type})),...expenses.map(d=>({...d,...financialAmounts(d),kind:"expense"}))];if(documents.length>10000)throw new ApiError(413,"Paczka przekracza 10 000 dokumentów.");
      const rows=documents.map(d=>documentRow(d,d.kind)),csv="\uFEFF"+[DOCUMENT_HEADERS,...rows].map(r=>r.map(csvCell).join(";")).join("\r\n");
      const pack=zipFiles({"dokumenty.csv":csv,"dokumenty.xlsx":workbook(DOCUMENT_HEADERS,rows),"zestawienie.json":JSON.stringify({period,companyId,currency,summary:monthlySummary(invoices,[...purchases,...expenses],currency),documents:documents.map(d=>({id:d.id,number:d.number,kind:d.kind,issueDate:d.issueDate,currency:d.currency,...financialAmounts(d)}))},null,2),"README.txt":"Paczka zestawień FakturaProsto: CSV, XLSX, JSON. Kwoty w walucie dokumentów. Nie zawiera oryginałów PDF/XML. Nie jest natywnym importem Optima, Rachmistrz, Symfonia ani Enova. Mapowanie pól i poprawność księgowania musi sprawdzić księgowa."});
      await recordAuditLog({companyId,userId:user.id,userName:user.name,userEmail:user.email,action:"accountant.package_exported",entityType:"accounting_pack",entityId:period,details:{currency,count:documents.length}});
      return new Response(pack as BodyInit,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="ksiegowosc-${period}-${currency}.zip"`,"Cache-Control":"no-store"}});
    }
    return json({ period, companyId, currency, summary: monthlySummary(invoices, [...purchases, ...expenses], currency), invoices: invoices.map(invoiceToDto), purchases: purchases.map(invoiceToDto), expenses: expenses.map(expenseToDto), notice: "Zestawienie w walucie dokumentów. Nie stanowi wyliczenia zobowiązania podatkowego. Dokumenty bez przypisanej firmy nie są uwzględniane." });
  } catch (e) { return handleApiError(e); }
}
