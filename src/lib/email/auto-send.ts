import { prisma } from "@/lib/db";
import { companyProfileToDto, companyToDto, contractorToDto, invoiceToDto } from "@/lib/dto";
import { invoicePdf } from "@/lib/pdf/invoice-print";
import { getEmailConfigStatus, sendEmail, type EmailAttachment } from "@/lib/email/sender";
import { buildFa3Xml } from "@/lib/ksef/index";
import { formatMoney, invoiceTotals, vatRateLabel } from "@/lib/format";
import type { CompanyProfile, Contractor, Invoice, VatRate } from "@/lib/types";

/**
 * Automatyczna wysyłka e-mail po potwierdzonym przyjęciu faktury przez KSeF (i pobraniu UPO).
 * Wywoływana świadomie, jeśli na fakturze zaznaczono opcję `autoSendEmailOnKsef`.
 * Nigdy nie rzuca krytycznych wyjątków blokujących przetwarzanie KSeF.
 */
export async function triggerAutoEmailOnKsef(invoiceId: string): Promise<boolean> {
  try {
    const invoiceRecord = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { sellerCompany: true },
    });

    if (!invoiceRecord || !invoiceRecord.autoSendEmailOnKsef) {
      return false;
    }

    // Sprawdzenie konfiguracji poczty
    const mailConfig = getEmailConfigStatus();
    if (!mailConfig.configured) {
      console.warn(`[AutoEmail] Poczta nie jest skonfigurowana. Pomijanie auto-wysyłki dla ${invoiceRecord.number}.`);
      return false;
    }

    // Pobranie kontrahenta
    const contractorRecord = await prisma.contractor.findUnique({
      where: { id: invoiceRecord.contractorId },
    });

    const recipientEmail = contractorRecord?.email?.trim() || invoiceRecord.sentToEmail?.trim();
    if (!recipientEmail) {
      console.warn(`[AutoEmail] Brak adresu e-mail kontrahenta dla faktury ${invoiceRecord.number}.`);
      return false;
    }

    const invoiceData = invoiceToDto(invoiceRecord);
    const contractor = contractorRecord ? contractorToDto(contractorRecord) : undefined;

    let sellerProfile: CompanyProfile | null = null;
    if (invoiceRecord.sellerCompany) {
      sellerProfile = companyProfileToDto(invoiceRecord.sellerCompany);
    } else {
      const comp = await prisma.companyProfile.findFirst({
        where: { userId: invoiceRecord.userId, isDefault: true },
      });
      sellerProfile = comp ? companyProfileToDto(comp) : null;
    }

    const effectiveSeller: CompanyProfile = sellerProfile || {
      id: "default",
      userId: invoiceRecord.userId,
      nip: "",
      companyName: "Moja Firma",
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const companyName = effectiveSeller.companyName || effectiveSeller.name || "Moja Firma";
    const totals = invoiceTotals(invoiceData);
    const formattedGross = formatMoney(totals.gross, invoiceData.currency);

    const subject = `Faktura VAT nr ${invoiceData.number} (KSeF) od ${companyName}`;
    const messageBody =
      `Dzień dobry,\n\n` +
      `Przesyłamy fakturę VAT nr ${invoiceData.number} z dnia ${invoiceData.issueDate}, ` +
      `która została oficjalnie zarejestrowana w Krajowym Systemie e-Faktur (KSeF).\n\n` +
      `• Numer KSeF: ${invoiceData.ksefNumber || invoiceData.ksef?.number || "Zarejestrowana"}\n` +
      `• Kwota do zapłaty: ${formattedGross}\n` +
      `• Termin płatności: ${invoiceData.dueDate}\n` +
      (effectiveSeller.bankAccount ? `• Rachunek bankowy: ${effectiveSeller.bankAccount}\n` : "") +
      `\nW załącznikach przesyłamy plik PDF z kodem weryfikacyjnym QR, plik XML FA(3) oraz Urzędowe Poświadczenie Odbioru (UPO).\n\n` +
      `Z poważaniem,\n${companyName}`;

    // Załączniki
    const attachments: EmailAttachment[] = [];
    const loggedMeta: Array<{ filename: string; size: number; contentType: string }> = [];
    const safeDocNumber = invoiceData.number.replace(/[/\\?%*:|"<>]/g, "_");

    // 1. PDF z kodem QR KSeF
    try {
      const pdfBuffer = (await invoicePdf(invoiceRecord.id)).buffer;
      const filename = `Faktura_${safeDocNumber}.pdf`;
      attachments.push({ filename, content: pdfBuffer, contentType: "application/pdf" });
      loggedMeta.push({ filename, size: pdfBuffer.length, contentType: "application/pdf" });
    } catch (e) {
      console.error("[AutoEmail] Błąd generowania PDF:", e);
    }

    // 2. XML FA(3)
    try {
      let xmlString = invoiceRecord.ksefXml || "";
      if (!xmlString) {
        xmlString = buildFa3Xml({ invoice: invoiceData, seller: effectiveSeller, buyer: contractor });
      }
      const xmlBuffer = Buffer.from(xmlString, "utf-8");
      const filename = `Faktura_KSeF_${safeDocNumber}.xml`;
      attachments.push({ filename, content: xmlBuffer, contentType: "application/xml" });
      loggedMeta.push({ filename, size: xmlBuffer.length, contentType: "application/xml" });
    } catch (e) {
      console.error("[AutoEmail] Błąd generowania XML:", e);
    }

    // 3. UPO XML
    if (invoiceRecord.upoXml) {
      const upoBuffer = Buffer.from(invoiceRecord.upoXml, "utf-8");
      const filename = `UPO_KSeF_${safeDocNumber}.xml`;
      attachments.push({ filename, content: upoBuffer, contentType: "application/xml" });
      loggedMeta.push({ filename, size: upoBuffer.length, contentType: "application/xml" });
    }

    // Wysyłka
    const emailResult = await sendEmail({
      to: recipientEmail,
      subject,
      text: messageBody,
      replyTo: effectiveSeller.email || undefined,
      attachments,
    });

    const now = new Date();

    // Rejestracja w historii
    await prisma.invoiceEmailLog.create({
      data: {
        invoiceId: invoiceRecord.id,
        userId: invoiceRecord.userId,
        to: recipientEmail,
        subject,
        messageBody,
        attachments: loggedMeta,
        status: "accepted",
        provider: emailResult.provider,
        messageId: emailResult.messageId || null,
        sentAt: now,
      },
    });

    await prisma.invoice.update({
      where: { id: invoiceRecord.id },
      data: {
        sentAt: now,
        sentToEmail: recipientEmail,
        emailStatus: "SENT",
      },
    });

    await prisma.notification.create({
      data: {
        userId: invoiceRecord.userId,
        kind: "system",
        title: `Faktura ${invoiceData.number} automatycznie wysłana do kontrahenta`,
        body: `Wysłano na adres: ${recipientEmail} po przyjęciu przez KSeF (${attachments.length} zał.)`,
        link: `/invoices/${invoiceRecord.id}`,
        read: false,
      },
    });

    console.log(`[AutoEmail] Faktura ${invoiceData.number} pomyślnie wysłana na ${recipientEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[AutoEmail] Błąd automatycznej wysyłki faktury ${invoiceId}:`, err);
    return false;
  }
}
