import { requireRecentAuth } from "@/lib/security-policy";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { isAccountingInvoice, csvCell } from "@/lib/accountant-summary";
import { invoicePdf } from "@/lib/pdf/invoice-print";
import { zipFiles } from "@/lib/zip";
import { recordAuditLog } from "@/lib/audit";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    await requireRecentAuth(user.id);
    const q = new URL(req.url).searchParams, companyId = q.get("companyId"), month = q.get("month"), target = q.get("target") || "generic";
    if (!objectId(companyId) || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !["generic", "optima", "rachmistrz", "symfonia", "enova"].includes(target)) throw new ApiError(400, "Wybierz firmę, miesiąc i program.");
    const access = await requireCompanyAccess(user.id, companyId, "canExport"); if (!access.ok) throw new ApiError(access.status, access.error);
    const [records, expenses] = await Promise.all([
      prisma.invoice.findMany({ where: { sellerCompanyId: companyId, issueDate: { startsWith: month }, status: { notIn: ["draft", "cancelled"] } }, orderBy: { id: "asc" }, take: 101 }),
      prisma.expense.findMany({ where: { companyId, issueDate: { startsWith: month } }, orderBy: { id: "asc" }, take: 501 }),
    ]);
    if (records.length > 100 || expenses.length > 500) throw new ApiError(413, "Miesiąc przekracza limit paczki: 100 faktur i 500 wydatków. Skorzystaj z eksportu JPK i zestawienia.");
    const invoices = records.filter(isAccountingInvoice), refs = new Set(invoices.filter(i => i.type === "purchase").map(i => i.ksefNumber).filter(Boolean));
    const costs = expenses.filter(e => !e.ksefRefNumber || !refs.has(e.ksefRefNumber));
    const contacts = await prisma.contractor.findMany({ where: { id: { in: invoices.map(i => i.contractorId) } } }), contactMap = new Map(contacts.map(c => [c.id, c]));
    const rows: unknown[][] = [["ID", "Rodzaj", "Numer", "Data", "Kontrahent", "NIP", "Waluta", "Netto", "VAT", "Brutto", "Zaksięgowano", "KSeF"]];
    invoices.forEach(i => rows.push([i.id, i.type === "sale" ? "sprzedaż" : "zakup", i.number, i.issueDate, contactMap.get(i.contractorId)?.name, contactMap.get(i.contractorId)?.nip, i.currency, i.totalNet, i.totalVat, i.totalGross, i.bookedAt?.toISOString(), i.ksefNumber]));
    costs.forEach(e => rows.push([e.id, "wydatek", e.number, e.issueDate, e.contractorName, e.nip, e.currency, e.totalNet, e.totalVat, e.totalGross, e.bookedAt?.toISOString(), e.ksefRefNumber]));
    const files: { name: string; data: Uint8Array | string }[] = [{ name: "zestawienie.csv", data: "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n") }, { name: "CZYTAJ.txt", data: `Firma: ${access.membership.company.companyName}\nOkres: ${month}\nProgram docelowy: ${target}\nCSV jest formatem wymiany do mapowania kolumn, a nie natywnym formatem producenta. Paczka nie składa deklaracji podatkowej.\nPDF zakupów jest wizualizacją danych; źródłem jest XML KSeF lub oryginalny dokument w Skrzynce.\nWydatki w zestawieniu nie zawierają ponownie tych samych faktur zakupowych KSeF.\n` }];
    for (const i of invoices) {
      const stem = i.id + "-" + i.number.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
      if (i.ksefXml) files.push({ name: "xml/" + stem + ".xml", data: i.ksefXml });
      if (i.upoXml) files.push({ name: "upo/" + stem + ".xml", data: i.upoXml });
      try { files.push({ name: "pdf/" + stem + ".pdf", data: (await invoicePdf(i.id)).buffer }); }
      catch (e) { if (e instanceof ApiError && e.status === 409) files.push({ name: "pdf/" + stem + "-uwaga.txt", data: e.message }); else throw e; }
    }
    const bytes = zipFiles(files);
    await recordAuditLog({ companyId, userId: user.id, userName: user.name, userEmail: user.email, entityType: "company", entityId: companyId, action: "accounting_package_exported", details: { month, target, invoices: invoices.length, expenses: costs.length } });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="ksiegowosc-${month}-${target}.zip"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return handleApiError(e); }
}
