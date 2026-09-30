import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { isAccountingInvoice } from "@/lib/accountant-summary";
import { paymentExport, type Transfer } from "@/lib/banking/payment-export";
import { recordAuditLog } from "@/lib/audit";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req);
    if (!objectId(body.companyId)) throw new ApiError(400, "Wybierz firmę.");
    const access = await requireCompanyAccess(user.id, body.companyId, "canRecordPayments");
    if (!access.ok) throw new ApiError(access.status, access.error);
    if (!["pain001", "csv", "elixir"].includes(String(body.format))) throw new ApiError(400, "Wybierz format paczki.");
    const items = body.items;
    if (!Array.isArray(items) || !items.length || items.length > 100) throw new ApiError(400, "Wybierz od 1 do 100 dokumentów.");
    const company = await prisma.companyProfile.findUniqueOrThrow({ where: { id: body.companyId } });
    if (!objectId(body.bankAccountId)) throw new ApiError(400, "Wybierz rachunek firmy.");
    const account = await prisma.companyBankAccount.findFirst({ where: { id: body.bankAccountId, companyId: company.id } });
    if (!account) throw new ApiError(400, "Rachunek nie należy do wybranej firmy.");
    const transfers: Transfer[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object" || !objectId(item.id) || !["invoice", "expense", "tax"].includes(item.kind)) throw new ApiError(400, "Nieprawidłowy dokument.");
      if (item.kind === "tax") throw new ApiError(400, "Przelewy podatkowe wymagają osobnego profilu bankowego z identyfikatorem podatnika i okresem.");
      const invoice = item.kind === "invoice" ? await prisma.invoice.findFirst({ where: { id: item.id, sellerCompanyId: company.id, type: "purchase" } }) : null;
      const expense = item.kind === "expense" ? await prisma.expense.findFirst({ where: { id: item.id, companyId: company.id } }) : null;
      if ((!invoice && !expense) || invoice && !isAccountingInvoice(invoice) || invoice?.isCorrection || invoice?.isSplitPayment) throw new ApiError(400, "Wybierz wystawiony koszt. MPP i korekty wymagają osobnego przelewu.");
      const doc = (invoice || expense)!;
      const amount = Math.round(((doc.totalGross || 0) - (invoice?.paidAmount || 0)) * 100) / 100;
      if (amount <= 0 || doc.paymentStatus === "paid") throw new ApiError(409, "Dokument jest już opłacony.");
      const contractor = invoice ? await prisma.contractor.findUnique({ where: { id: invoice.contractorId } }) : null;
      if (contractor?.companyId && contractor.companyId !== company.id) throw new ApiError(400, "Kontrahent należy do innej firmy.");
      const recipient = expense?.contractorName || contractor?.name || "";
      transfers.push({ id: item.kind + "-" + doc.id, recipient, iban: String(item.iban || ""), amount, currency: doc.currency, title: doc.number });
    }
    let exported;
    try { exported = paymentExport({ debtor: company.companyName, debtorIban: account.accountNumber, executionDate: String(body.executionDate || ""), transfers, format: body.format as "pain001" | "csv" | "elixir", messageId: randomUUID() }); }
    catch (e) { throw new ApiError(400, e instanceof Error ? e.message : "Nieprawidłowa paczka."); }
    await recordAuditLog({ companyId: company.id, userId: user.id, userName: user.name, userEmail: user.email, action: "bank_transfer_pack_exported", entityType: "company", entityId: company.id, details: { count: transfers.length, format: body.format, executionDate: body.executionDate } });
    return new Response(exported.content, { headers: { "Content-Type": exported.mime, "Content-Disposition": `attachment; filename="przelewy-${body.executionDate}.${exported.extension}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return handleApiError(error); }
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const companyId = new URL(req.url).searchParams.get("companyId");
    if (!objectId(companyId)) throw new ApiError(400, "Wybierz firmę.");
    const access = await requireCompanyAccess(user.id, companyId, "canRecordPayments"); if (!access.ok) throw new ApiError(access.status, access.error);
    const [invoices, expenses, accounts] = await Promise.all([
      prisma.invoice.findMany({ where: { sellerCompanyId: companyId, type: "purchase", paymentStatus: { in: ["unpaid", "partially_paid", "overdue"] }, status: { notIn: ["draft", "cancelled"] } }, take: 101, orderBy: { dueDate: "asc" } }),
      prisma.expense.findMany({ where: { companyId, paymentStatus: "unpaid" }, take: 101, orderBy: { dueDate: "asc" } }),
      prisma.companyBankAccount.findMany({ where: { companyId } }),
    ]);
    const contacts = await prisma.contractor.findMany({ where: { id: { in: invoices.map(i => i.contractorId) } } }), contactMap = new Map(contacts.map(c => [c.id, c]));
    const refs = new Set(invoices.map(i => i.ksefNumber).filter(Boolean));
    const rows = [...invoices.filter(i => isAccountingInvoice(i) && !i.isCorrection && !i.isSplitPayment).map(i => ({ kind: "invoice", id: i.id, number: i.number, currency: i.currency, amount: Math.max(0, (i.totalGross || 0) - (i.paidAmount || 0)), recipient: contactMap.get(i.contractorId)?.name || "", iban: contactMap.get(i.contractorId)?.iban || "" })), ...expenses.filter(e => !e.ksefRefNumber || !refs.has(e.ksefRefNumber)).map(e => ({ kind: "expense", id: e.id, number: e.number, currency: e.currency, amount: e.totalGross, recipient: e.contractorName, iban: "" }))];
    return json({ rows, accounts, truncated: invoices.length > 100 || expenses.length > 100 });
  } catch (e) { return handleApiError(e); }
}
