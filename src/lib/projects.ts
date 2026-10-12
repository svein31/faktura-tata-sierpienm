import { createHash, randomBytes } from "node:crypto";
import type { Prisma, ProjectEntry } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, cleanStr } from "@/lib/api";
import { companyWriteAccess } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { isIsoCalendarDate } from "@/lib/nbp";
import { isAccountingInvoice } from "@/lib/accountant-summary";
import { round2 } from "@/lib/format";
import { recordAuditLog } from "@/lib/audit";
import { projectSummary, type ProjectAmount } from "@/lib/project-summary";

type Db = Prisma.TransactionClient;
const invoiceSelect = { id: true, number: true, type: true, status: true, documentStatus: true, isProforma: true, approvalStatus: true, currency: true, totalNet: true, ksefNumber: true } as const;
const expenseSelect = { id: true, number: true, workflowStatus: true, currency: true, totalNet: true, ksefRefNumber: true } as const;
const materialSelect = { id: true, number: true, type: true, status: true, totalValueNet: true, warehouse: { select: { currency: true } } } as const;
type Sources = {
  invoices: Map<string, Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>>;
  expenses: Map<string, Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>>;
  materials: Map<string, Prisma.StockDocumentGetPayload<{ select: typeof materialSelect }>>;
};
export function projectEntryId(companyId: string, kind: string, sourceId: string) {
  return createHash("sha256").update(`project-source:${companyId}:${kind}:${sourceId}`).digest("hex").slice(0, 24);
}
export function timeFields(body: Record<string, unknown>) {
  const workDate = cleanStr(body.workDate, 10, "data"), description = cleanStr(body.description, 500, "opis"), currency = cleanStr(body.currency, 3, "waluta").toUpperCase();
  if (!isIsoCalendarDate(workDate) || !description || !/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "Uzupełnij datę, opis pracy i walutę.");
  if (typeof body.minutes !== "number" || !Number.isInteger(body.minutes) || body.minutes < 1 || body.minutes > 1440) throw new ApiError(400, "Czas pojedynczego wpisu musi wynosić 1–1440 minut.");
  if (typeof body.hourlyCost !== "number" || !Number.isFinite(body.hourlyCost) || body.hourlyCost < 0 || body.hourlyCost > 1e6) throw new ApiError(400, "Wpisz poprawny godzinowy koszt pracy.");
  return { workDate, description, currency, minutes: body.minutes, hourlyCost: round2(body.hourlyCost) };
}

// Source reads remain company-scoped even when a stored link has been corrupted or the source moved.
export async function projectSource(tx: Db, companyId: string, kind: string, sourceId: string, sources?: Sources): Promise<{ number: string; amount: ProjectAmount | null; reason?: string; identity?: string }> {
  if (kind === "invoice") {
    const invoice = sources ? sources.invoices.get(sourceId) : await tx.invoice.findFirst({ where: { id: sourceId, sellerCompanyId: companyId }, select: invoiceSelect });
    if (!invoice) return { number: "Niedostępny dokument", amount: null, reason: "Dokument usunięty lub poza firmą." };
    if (!isAccountingInvoice(invoice)) return { number: invoice.number, amount: null, reason: "Szkic, proforma lub anulowany dokument." };
    if (invoice.type === "purchase" && invoice.approvalStatus !== "approved") return { number: invoice.number, amount: null, reason: "Koszt oczekuje na zatwierdzenie." };
    if (invoice.totalNet === null || !Number.isFinite(invoice.totalNet)) return { number: invoice.number, amount: null, reason: "Brak prawidłowej wartości netto dokumentu." };
    return { number: invoice.number, amount: { category: invoice.type === "purchase" ? "cost" : "revenue", currency: invoice.currency, amount: invoice.totalNet }, identity: invoice.type === "purchase" && invoice.ksefNumber ? `ksef:${invoice.ksefNumber}` : undefined };
  }
  if (kind === "expense") {
    const expense = sources ? sources.expenses.get(sourceId) : await tx.expense.findFirst({ where: { id: sourceId, companyId }, select: expenseSelect });
    if (!expense) return { number: "Niedostępny koszt", amount: null, reason: "Koszt usunięty lub poza firmą." };
    if (!["verified", "sent_to_accountant"].includes(expense.workflowStatus)) return { number: expense.number, amount: null, reason: "Koszt oczekuje na weryfikację." };
    return { number: expense.number, amount: { category: "cost", currency: expense.currency, amount: expense.totalNet }, identity: expense.ksefRefNumber ? `ksef:${expense.ksefRefNumber}` : undefined };
  }
  if (kind === "material") {
    const doc = sources ? sources.materials.get(sourceId) : await tx.stockDocument.findFirst({ where: { id: sourceId, warehouse: { companyId } }, select: materialSelect });
    if (!doc) return { number: "Niedostępny rozchód", amount: null, reason: "Rozchód usunięty lub poza firmą." };
    if (doc.status !== "issued" || !["RW", "WZ"].includes(doc.type)) return { number: doc.number, amount: null, reason: "Dokument nie jest aktywnym rozchodem RW/WZ." };
    if (!doc.warehouse.currency) return { number: doc.number, amount: null, reason: "Magazyn nie ma określonej waluty wyceny." };
    return { number: doc.number, amount: { category: "materials", currency: doc.warehouse.currency, amount: doc.totalValueNet } };
  }
  throw new ApiError(400, "Nieprawidłowy typ źródła.");
}

export async function projectDetails(tx: Db, companyId: string, id: string) {
  const project = await tx.project.findFirst({ where: { id, companyId } });
  if (!project) throw new ApiError(404, "Nie znaleziono projektu.");
  const entries = await tx.projectEntry.findMany({ where: { projectId: id, companyId }, orderBy: { id: "desc" } });
  const ids = (kind: string) => entries.filter(entry => entry.kind === kind && entry.sourceId).map(entry => entry.sourceId!);
  const [invoices, expenses, materials] = await Promise.all([
    tx.invoice.findMany({ where: { id: { in: ids("invoice") }, sellerCompanyId: companyId }, select: invoiceSelect }),
    tx.expense.findMany({ where: { id: { in: ids("expense") }, companyId }, select: expenseSelect }),
    tx.stockDocument.findMany({ where: { id: { in: ids("material") }, warehouse: { companyId } }, select: materialSelect }),
  ]);
  const sources: Sources = { invoices: new Map(invoices.map(row => [row.id, row])), expenses: new Map(expenses.map(row => [row.id, row])), materials: new Map(materials.map(row => [row.id, row])) };
  const amounts: ProjectAmount[] = [], identities = new Set<string>();
  const rows = [];
  for (const entry of entries) {
    if (entry.kind === "time") {
      const amount: ProjectAmount = { category: "time", currency: entry.currency!, minutes: entry.minutes!, amount: round2(entry.minutes! / 60 * entry.hourlyCost!) };
      amounts.push(amount); rows.push({ ...entry, number: entry.description, amount, reason: null }); continue;
    }
    const source = await projectSource(tx, companyId, entry.kind, entry.sourceId!, sources);
    if (source.identity && identities.has(source.identity)) { rows.push({ ...entry, number: source.number, amount: null, reason: "Duplikat tego samego dokumentu KSeF — pominięty w wyniku." }); continue; }
    if (source.identity) identities.add(source.identity);
    if (source.amount) amounts.push({ ...source.amount, materialPurchase: entry.materialPurchase });
    rows.push({ ...entry, number: source.number, amount: source.amount, reason: source.reason || null });
  }
  return { project, entries: rows, summary: projectSummary(amounts, project.materialBasis === "consumption" ? "consumption" : "documents") };
}

export async function projectCommand(userId: string, body: Record<string, unknown>) {
  return prisma.$transaction(async tx => {
    const { company } = await companyWriteAccess(tx, userId, body.companyId, "canExport");
    const action = String(body.action);
    if (action === "create") {
      const name = cleanStr(body.name, 150, "nazwa"), description = cleanStr(body.description, 2000, "opis");
      if (!name || !["documents", "consumption"].includes(String(body.materialBasis))) throw new ApiError(400, "Podaj nazwę i podstawę wyceny materiałów.");
      const project = await tx.project.create({ data: { companyId: company.id, name, description, materialBasis: String(body.materialBasis) } });
      await recordAuditLog({ client: tx, companyId: company.id, userId, action: "project.create", entityType: "project", entityId: project.id, details: { name, materialBasis: project.materialBasis } });
      return { id: project.id };
    }
    if (!objectId(body.projectId) || !Number.isInteger(body.version)) throw new ApiError(400, "Wybierz projekt i jego wersję.");
    const project = await tx.project.findFirst({ where: { id: body.projectId, companyId: company.id } });
    if (!project) throw new ApiError(404, "Nie znaleziono projektu.");
    if (project.version !== body.version) throw new ApiError(409, "Projekt zmienił się. Odśwież dane.");
    if (project.status !== "active" && action !== "reopen") throw new ApiError(409, "Projekt jest zamknięty.");
    const reason = cleanStr(body.reason, 500, "powód");
    let entry: ProjectEntry | null = null;
    if (action === "link") {
      const kind = String(body.kind);
      if (!["invoice", "expense", "material"].includes(kind) || !objectId(body.sourceId)) throw new ApiError(400, "Wybierz dokument źródłowy.");
      const source = await projectSource(tx, company.id, kind, body.sourceId);
      if (!source.amount) throw new ApiError(409, source.reason || "Dokument nie może być przypisany.");
      // Also detect links made before a source received its KSeF identity.
      if (source.identity) {
        const reference = source.identity.slice(5);
        const [invoices, expenses] = await Promise.all([
          tx.invoice.findMany({ where: { sellerCompanyId: company.id, type: "purchase", ksefNumber: reference }, select: { id: true } }),
          tx.expense.findMany({ where: { companyId: company.id, ksefRefNumber: reference }, select: { id: true } }),
        ]);
        if (await tx.projectEntry.findFirst({ where: { companyId: company.id, OR: [{ kind: "invoice", sourceId: { in: invoices.map(row => row.id) } }, { kind: "expense", sourceId: { in: expenses.map(row => row.id) } }] } })) throw new ApiError(409, "Ten dokument KSeF jest już powiązany z projektem.");
      }
      const count = await tx.projectEntry.count({ where: { projectId: project.id } });
      if (count >= 1000) throw new ApiError(400, "Projekt osiągnął limit 1000 wpisów. Podziel rozliczenie na etapy.");
      const id = projectEntryId(company.id, kind, body.sourceId);
      if (source.identity) await tx.projectSourceClaim.create({ data: { id: projectEntryId(company.id, "identity", source.identity), entryId: id } });
      entry = await tx.projectEntry.create({ data: { id, companyId: company.id, projectId: project.id, kind, sourceId: body.sourceId, materialPurchase: source.amount.category === "cost" && body.materialPurchase === true, createdBy: userId } });
    } else if (action === "time") {
      if (await tx.projectEntry.count({ where: { projectId: project.id } }) >= 1000) throw new ApiError(400, "Projekt osiągnął limit 1000 wpisów.");
      entry = await tx.projectEntry.create({ data: { id: randomBytes(12).toString("hex"), companyId: company.id, projectId: project.id, kind: "time", ...timeFields(body), createdBy: userId } });
    } else if (action === "unlink") {
      if (!objectId(body.entryId) || !reason) throw new ApiError(400, "Wybierz wpis i podaj powód usunięcia powiązania.");
      entry = await tx.projectEntry.findFirst({ where: { id: body.entryId, projectId: project.id, companyId: company.id } });
      if (!entry) throw new ApiError(404, "Nie znaleziono wpisu.");
      await tx.projectEntry.delete({ where: { id: entry.id } });
      await tx.projectSourceClaim.deleteMany({ where: { entryId: entry.id } });
    } else if (!["close", "reopen"].includes(action)) throw new ApiError(400, "Nieprawidłowa operacja.");
    if (["close", "reopen"].includes(action) && !reason) throw new ApiError(400, "Podaj powód zmiany statusu.");
    if (action === "reopen" && project.status !== "closed") throw new ApiError(409, "Projekt jest już otwarty.");
    await tx.project.update({ where: { id: project.id, version: project.version }, data: { version: { increment: 1 }, ...(action === "close" ? { status: "closed" } : action === "reopen" ? { status: "active" } : {}) } });
    await recordAuditLog({ client: tx, companyId: company.id, userId, action: `project.${action}`, entityType: "project", entityId: project.id, details: { entry, reason, previousVersion: project.version } });
    return { id: project.id, version: project.version + 1 };
  }, { timeout: 30000 });
}
