import { createHash, X509Certificate } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";
import { companyProfileToDto, contractorToDto, invoiceToDto } from "@/lib/dto";
import { buildFa3Xml, validateFa3Xml } from "@/lib/ksef/xmlBuilder";
import { buildKsefOfflineCertUrl, buildKsefVerificationUrl } from "@/lib/ksef/qr";
import { KSEF_V2_URLS, type KsefEnvironment } from "@/lib/ksef/constants";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { captureInvoicePrint } from "@/lib/pdf/invoice-print";
import { recordAuditLog } from "@/lib/audit";
import { claimInvoiceQuota } from "@/lib/invoice-quota";

export const runtime = "nodejs";

type Signer = { environment: "test" | "production"; certificateBase64: string; privateKeyPem: string };
function configuredSigner(companyId: string): Signer | null {
  try {
    const parsed = JSON.parse(process.env.KSEF_OFFLINE_SIGNERS_JSON || "{}") as Record<string, Signer>;
    const config = parsed[companyId];
    return config && ["test", "production"].includes(config.environment) && typeof config.certificateBase64 === "string" && typeof config.privateKeyPem === "string" ? config : null;
  } catch { return null; }
}

/** Fetches the certificate type and bytes directly from MF; an uploaded public X.509 alone is insufficient. */
async function verifyOfflineCertificate(signer: Signer, token: string, cert: X509Certificate) {
  const response = await fetch(`${KSEF_V2_URLS[signer.environment]}/certificates/retrieve`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ certificateSerialNumbers: [cert.serialNumber] }),
    signal: AbortSignal.timeout(12000), cache: "no-store",
  });
  if (!response.ok) throw new ApiError(409, "Nie można potwierdzić certyfikatu Offline w MF.");
  const body = await response.json() as { certificates?: { certificateSerialNumber: string; certificateType: string; certificate: string }[] };
  const entry = body.certificates?.find(item => item.certificateSerialNumber?.toUpperCase() === cert.serialNumber.toUpperCase());
  if (!entry || entry.certificateType !== "Offline" || !entry.certificate) throw new ApiError(409, "MF nie potwierdziło certyfikatu typu Offline.");
  const received = Buffer.from(entry.certificate, "base64");
  if (createHash("sha256").update(received).digest("hex") !== cert.fingerprint256.replace(/:/g, "").toLowerCase())
    throw new ApiError(409, "Certyfikat nie jest zgodny z certyfikatem pobranym z MF.");
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req);
    const invoiceId = body.invoiceId;
    if (!objectId(invoiceId)) throw new ApiError(400, "Nieprawidłowa faktura.");
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { sellerCompany: { include: { bankAccounts: true } }, payments: true } });
    if (!invoice?.sellerCompanyId || !invoice.sellerCompany) throw new ApiError(404, "Nie znaleziono faktury firmy.");
    for (const permission of ["canIssueInvoices", "canSendKsef"] as const) {
      const access = await requireCompanyAccess(user.id, invoice.sellerCompanyId, permission);
      if (!access.ok) throw new ApiError(access.status, access.error);
    }
    if (invoice.type !== "sale" || invoice.isProforma || !invoice.isOffline || invoice.status !== "draft" || invoice.ksefNumber || invoice.referenceNumber || invoice.qrCodeII)
      throw new ApiError(409, "Tylko szkic faktury offline bez wcześniejszej wysyłki można wystawić.");
    if (!invoice.offlineDeadline || !invoice.offlineReason) throw new ApiError(409, "Uzupełnij powód i termin przesłania.");
    const signer = configuredSigner(invoice.sellerCompanyId);
    if (!signer) throw new ApiError(409, "Brak skonfigurowanego certyfikatu KSeF Offline dla firmy.");
    const settings = await prisma.ksefSettings.findUnique({ where: { userId: invoice.sellerCompany.userId } });
    if (settings?.environment !== signer.environment) throw new ApiError(409, "Środowisko certyfikatu różni się od ustawień KSeF firmy.");
    const nip = invoice.sellerCompany.nip.replace(/\D/g, "");
    const auth = await prisma.ksefSession.findFirst({ where: { userId: invoice.sellerCompany.userId, nip, environment: signer.environment, status: "ACTIVE", validUntil: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
    if (!auth?.accessToken) throw new ApiError(409, "Wymagana aktywna sesja KSeF do potwierdzenia certyfikatu w MF.");
    const raw = Buffer.from(signer.certificateBase64, "base64");
    const cert = new X509Certificate(raw);
    await verifyOfflineCertificate(signer, auth.accessToken, cert);
    const buyer = await prisma.contractor.findUnique({ where: { id: invoice.contractorId } });
    if (!buyer) throw new ApiError(409, "Brak kontrahenta do wygenerowania XML.");
    const xml = buildFa3Xml({ invoice: invoiceToDto(invoice), seller: companyProfileToDto(invoice.sellerCompany), buyer: contractorToDto(buyer) });
    const validated = validateFa3Xml(xml);
    if (!validated.ok) throw new ApiError(409, "XML faktury nie przeszedł walidacji FA(3).");
    const certificatePem = cert.toString();
    const params = { sellerNip: nip, issueDate: invoice.issueDate, xmlContent: xml, environment: signer.environment as KsefEnvironment };
    const qrCodeI = buildKsefVerificationUrl(params);
    const qrCodeII = buildKsefOfflineCertUrl({ ...params, certificatePem, privateKeyPem: signer.privateKeyPem, contextType: "Nip", contextValue: nip });
    const updated = await prisma.$transaction(async tx => {
      await assertAccountingPeriodsOpen(tx, [{ companyId: invoice.sellerCompanyId, issueDate: invoice.issueDate }]);
      const issuedAt = await claimInvoiceQuota(tx, user.id, invoice.sellerCompanyId);
      const changed = await tx.invoice.updateMany({ where: { id: invoice.id, version: invoice.version, status: "draft", referenceNumber: null, qrCodeII: null }, data: {
        status: "issued", documentStatus: "issued", issuedAt, ksefStatus: "ready", ksefXml: xml, qrCodeI, qrCodeII, version: (invoice.version || 1) + 1,
      } });
      if (!changed.count) throw new ApiError(409, "Faktura zmieniła się przed wystawieniem. Odśwież dokument.");
      const record = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      await captureInvoicePrint(tx, record, "offline-issued");
      await recordAuditLog({ client: tx, companyId: invoice.sellerCompanyId, userId: user.id, userName: user.name, userEmail: user.email,
        action: "ksef.offline_issued", entityType: "invoice", entityId: invoice.id,
        details: { environment: signer.environment, certificateSerialNumber: cert.serialNumber, xmlHash: createHash("sha256").update(xml).digest("hex") } });
      return record;
    });
    return json({ invoice: invoiceToDto(updated) });
  } catch (error) { return handleApiError(error); }
}
