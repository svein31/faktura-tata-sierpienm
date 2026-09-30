import { createHash } from "node:crypto";
import type { Invoice as DbInvoice, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { invoiceToDto, companyProfileToDto, contractorToDto } from "@/lib/dto";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";
import { generateInvoicePdfBuffer } from "@/lib/pdf/generate-invoice-pdf";
import { DEFAULT_PRINT_CONFIG, type PrintConfig } from "@/lib/pdf/print-config";
import { buildKsefVerificationUrl } from "@/lib/ksef";
import { ksefAcceptanceDateFromUpo } from "@/lib/pdf/ksef-acceptance-date";

type ContextData = { company?: CompanyProfile; contractor?: Contractor; config: PrintConfig; templateId?: string; templateVersion: number };
const PDF_LAYOUT_VERSION = 3;
const fields = ["id", "number", "documentKind", "isProforma", "type", "currency", "language", "issueDate", "saleDate", "dueDate", "lines", "paymentMethod", "bankAccountSnapshot", "buyerCountry", "buyerTaxIdType", "isCorrection", "correctionReason", "originalInvoiceNumber", "originalIssueDate", "originalKsefNumber", "exchangeRate", "exchangeRateDate", "exchangeRateTable", "exchangeRateUnit", "totalVatPln", "notes", "isOffline", "offlineDeadline", "ksefNumber", "ksefAcceptedAt", "qrCodeI", "qrCodeII", "advanceReceivedDate", "settlementMetadata"] as const;
export function printInvoiceData(invoice: Invoice) {
  const data: Record<string, unknown> = Object.fromEntries(fields.filter(key => invoice[key] !== undefined).map(key => [key, invoice[key]]));
  if (invoice.ksefNumber && invoice.upoXml) data.ksefAcceptedAt = ksefAcceptanceDateFromUpo(invoice.upoXml, invoice.ksefNumber);
  // Never archive XML, tokens, UPO, operational history or credentials in print data.
  if (invoice.ksef) data.ksef = { number: invoice.ksef.number, environment: invoice.ksef.environment };
  return JSON.parse(JSON.stringify(data)) as Invoice;
}
export async function currentPrintContext(tx: Prisma.TransactionClient, invoice: DbInvoice): Promise<ContextData> {
  const company = invoice.sellerCompanyId
    ? await tx.companyProfile.findUnique({ where: { id: invoice.sellerCompanyId } })
    : await tx.companyProfile.findFirst({ where: { userId: invoice.userId, isDefault: true } });
  const contractor = invoice.contractorId ? await tx.contractor.findUnique({ where: { id: invoice.contractorId } }) : null;
  const setting = company ? await tx.pdfTemplateSetting.findUnique({ where: { id: company.id } }) : null;
  const template = setting?.templateId ? await tx.pdfTemplateVersion.findFirst({ where: { id: setting.templateId, companyId: company!.id } }) : null;
  const companyDto = company ? companyProfileToDto(company) : undefined;
  if (companyDto) { delete companyDto.ksefToken; delete companyDto.ksefTokenSet; }
  return JSON.parse(JSON.stringify({ company: companyDto, contractor: contractor ? contractorToDto(contractor) : undefined, config: template?.config || DEFAULT_PRINT_CONFIG, templateId: template?.id, templateVersion: template?.version || 0 }));
}

/** Capture in the same transaction as issuing/editing. Old versions and party/template context are append-only. */
export async function captureInvoicePrint(tx: Prisma.TransactionClient, invoice: DbInvoice, captureReason = "issued") {
  if ((invoice.documentStatus || invoice.status) === "draft") return null;
  let context = await tx.invoicePrintContext.findUnique({ where: { id: invoice.id } });
  if (!context) context = await tx.invoicePrintContext.create({ data: { id: invoice.id, companyId: invoice.sellerCompanyId, captureReason, data: await currentPrintContext(tx, invoice) as unknown as Prisma.InputJsonValue } });
  const invoiceData = printInvoiceData(invoiceToDto(invoice));
  if (invoice.ksefNumber && !invoiceData.qrCodeI && invoice.ksefXml) {
    const seller = invoice.sellerCompanyId ? await tx.companyProfile.findUnique({ where: { id: invoice.sellerCompanyId }, select: { nip: true } }) : null;
    const environment = (invoice.ksef as { environment?: "test" | "demo" | "production" } | null)?.environment || "test";
    if (seller?.nip) invoiceData.qrCodeI = buildKsefVerificationUrl({ sellerNip: seller.nip, issueDate: invoice.issueDate, xmlContent: invoice.ksefXml, environment });
  }
  const sourceHash = createHash("sha256").update(JSON.stringify({ layout: PDF_LAYOUT_VERSION, context: context.data, invoice: invoiceData })).digest("hex");
  const id = createHash("sha256").update(`${invoice.id}:${sourceHash}`).digest("hex").slice(0, 24);
  const existing = await tx.invoicePrintVersion.findUnique({ where: { id } });
  if (existing) {
    if (existing.sourceHash !== sourceHash) throw new ApiError(409, "Konflikt wersji wydruku.");
    return existing;
  }
  return tx.invoicePrintVersion.create({ data: { id, invoiceId: invoice.id, sourceHash, invoiceData: invoiceData as unknown as Prisma.InputJsonValue, sourceVersion: invoice.version || 1 } });
}

/** Callers must authenticate access to the current invoice before calling this helper. */
export async function invoicePdf(invoiceId: string, versionId?: string) {
  const prepared = await prisma.$transaction(async tx => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new ApiError(404, "Nie znaleziono faktury.");
    if (invoice.isOffline && !invoice.ksefNumber && (!invoice.qrCodeI || !invoice.qrCodeII)) throw new ApiError(409, "Najpierw wystaw fakturę offline z podpisanym Kodem II.");
    if (versionId) {
      const version = await tx.invoicePrintVersion.findFirst({ where: { id: versionId, invoiceId } });
      const context = await tx.invoicePrintContext.findUnique({ where: { id: invoiceId } });
      if (!version || !context) throw new ApiError(404, "Nie znaleziono wersji wydruku.");
      return { version, context: context.data as unknown as ContextData, invoice: version.invoiceData as unknown as Invoice };
    }
    const version = await captureInvoicePrint(tx, invoice, "legacy-first-render");
    const context = version ? (await tx.invoicePrintContext.findUniqueOrThrow({ where: { id: invoiceId } })).data as unknown as ContextData : await currentPrintContext(tx, invoice);
    return { version, context, invoice: version ? version.invoiceData as unknown as Invoice : printInvoiceData(invoiceToDto(invoice)) };
  });
  if (prepared.version?.pdfBase64) return { buffer: Buffer.from(prepared.version.pdfBase64, "base64"), versionId: prepared.version.id, sha256: prepared.version.pdfSha256, number: prepared.invoice.number };
  if (prepared.invoice.ksefNumber && !prepared.invoice.qrCodeI) throw new ApiError(409, "Brakuje danych kodu weryfikacji KSeF. Odśwież fakturę i ponów pobranie PDF.");
  const buffer = await generateInvoicePdfBuffer(prepared.invoice, prepared.context.contractor, prepared.context.company, prepared.context.config);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (!prepared.version) return { buffer, versionId: null, sha256, number: prepared.invoice.number };
  if (buffer.length > 6 * 1024 * 1024) throw new ApiError(413, "PDF przekracza limit archiwum 6 MB.");
  await prisma.invoicePrintVersion.updateMany({ where: { id: prepared.version.id, OR: [{ pdfBase64: null }, { pdfBase64: { isSet: false } }] }, data: { pdfBase64: buffer.toString("base64"), pdfSha256: sha256 } });
  // Concurrent rendering returns the single persisted winner, byte-for-byte.
  const saved = await prisma.invoicePrintVersion.findUniqueOrThrow({ where: { id: prepared.version.id } });
  return { buffer: Buffer.from(saved.pdfBase64!, "base64"), versionId: saved.id, sha256: saved.pdfSha256, number: prepared.invoice.number };
}
