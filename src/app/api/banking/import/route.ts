import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { parseBankStatementCsv, matchTransactionsToInvoices } from "@/lib/banking/csv-parser";
import { requireCompanyAccess } from "@/lib/permissions";
import { recordInvoicePayment } from "@/lib/payments";
import { invoiceTotals } from "@/lib/format";
import type { InvoiceLine } from "@/lib/types";
import { createHash } from "crypto";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({error:"Nieautoryzowany."},{status:401});
    const body = await readJson(req);
    const csvContent = str(body.csvContent).trim();
    if (!csvContent || csvContent.length > 2_000_000) throw new ApiError(400, "Prześlij wyciąg CSV do 2 MB.");
    const companyId = str(body.companyId);
    if (companyId) {
      const access = await requireCompanyAccess(user.id, companyId, "canRecordPayments");
      if (!access.ok) throw new ApiError(access.status, access.error);
    }
    const raw = parseBankStatementCsv(csvContent);
    if (!raw.length) throw new ApiError(400, "Nie wykryto poprawnych wpłat.");
    const invoices = await prisma.invoice.findMany({
      where: { type: "sale", ...(companyId ? {sellerCompanyId: companyId} : { userId: user.id, OR: [{sellerCompanyId:null},{sellerCompanyId:{isSet:false}}] }), paymentStatus: { in: ["unpaid","partially_paid","overdue"] } },
    });
    const contractors = await prisma.contractor.findMany({ where: { id: { in: invoices.map(i=>i.contractorId) } } });
    const candidates = invoices.map(inv => ({
      id:inv.id, number:inv.number, currency:inv.currency,
      contractorName:contractors.find(c=>c.id===inv.contractorId)?.name,
      contractorNip:contractors.find(c=>c.id===inv.contractorId)?.nip,
      totalGross:invoiceTotals({lines:inv.lines as unknown as InvoiceLine[]}).gross,
      paidAmount:inv.paidAmount || 0,
    }));
    const transactions = matchTransactionsToInvoices(raw,candidates);
    const matchedCount = transactions.filter(t=>t.matchedInvoiceId).length;
    const totalAmount = Math.round(raw.reduce((sum,t)=>sum+t.amount,0)*100)/100;
    const fileHash = createHash("sha256").update(JSON.stringify([companyId || user.id,csvContent])).digest("hex");
    let appliedCount = 0;
    if (body.applyPayments === true) {
      appliedCount = await prisma.$transaction(async tx => {
        if (await tx.bankStatementImport.findUnique({where:{fileHash}})) throw new ApiError(409,"Ten wyciąg został już zaksięgowany.");
        await tx.bankStatementImport.create({ data: {userId:user.id,filename:str(body.filename)||"wyciag.csv",bankFormat:str(body.bankFormat)||"generic",rowCount:raw.length,matchedCount,totalAmount,fileHash} });
        let count=0;
        for (const payment of transactions) {
          if (payment.matchedInvoiceId && ["exact","high"].includes(payment.confidence)) {
            await recordInvoicePayment(tx,payment.matchedInvoiceId,{userId:user.id,amount:payment.amount,paidAt:new Date(payment.date),method:"transfer",note:"Wyciąg bankowy: "+payment.title.slice(0,200)});
            count++;
          }
        }
        return count;
      }, { timeout: 20000 });
    }
    return json({transactions,rowCount:raw.length,matchedCount,totalAmount,appliedCount});
  } catch(e) { return handleApiError(e); }
}
