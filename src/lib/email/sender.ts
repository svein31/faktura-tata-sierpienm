import nodemailer from "nodemailer";

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  provider: "resend" | "smtp" | "simulated";
  message: string;
}

/**
 * Walidacja adresu e-mail za pomocą wyrażenia regularnego zgodnego ze standardem RFC 5322.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email.trim());
}

/**
 * Uniwersalny serwis wysyłki e-maili z obsługą Resend, SMTP (Nodemailer) oraz trybu symulacji (dev).
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, subject, text, html, attachments = [] } = options;
  const from = options.from || process.env.EMAIL_FROM || "Fakturo <faktury@fakturo.app>";

  if (!isValidEmail(to)) {
    throw new Error(`Nieprawidłowy adres e-mail odbiorcy: ${to}`);
  }

  // 1. Sprawdzenie Resend API (HTTP REST API)
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const resendAttachments = attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content) ? att.content.toString("base64") : Buffer.from(att.content).toString("base64"),
      }));

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to.trim()],
          subject,
          text: text || undefined,
          html: html || undefined,
          attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData?.message || `Błąd Resend API HTTP ${res.status}`);
      }

      return {
        success: true,
        messageId: resData?.id,
        provider: "resend",
        message: `Wiadomość została wysłana przez Resend do ${to}`,
      };
    } catch (err: any) {
      console.error("[Email] Błąd wysyłki przez Resend API:", err);
      throw new Error(`Wysyłka e-mail (Resend) nie powiodła się: ${err.message || err}`);
    }
  }

  // 2. Sprawdzenie konfiguracji SMTP (Nodemailer)
  const smtpHost = process.env.SMTP_HOST?.trim();
  if (smtpHost) {
    try {
      const port = parseInt(process.env.SMTP_PORT || "587", 10);
      const secure = process.env.SMTP_SECURE === "true" || port === 465;

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure,
        auth: process.env.SMTP_USER
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS || "",
            }
          : undefined,
      });

      const mailAttachments = attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      }));

      const info = await transporter.sendMail({
        from,
        to: to.trim(),
        subject,
        text,
        html,
        attachments: mailAttachments,
      });

      return {
        success: true,
        messageId: info.messageId,
        provider: "smtp",
        message: `Wiadomość została wysłana przez serwer SMTP do ${to}`,
      };
    } catch (err: any) {
      console.error("[Email] Błąd wysyłki przez SMTP:", err);
      throw new Error(`Wysyłka e-mail (SMTP) nie powiodła się: ${err.message || err}`);
    }
  }

  // 3. Fallback: Tryb deweloperski / demo (gdy brak kluczy w środowisku lokalnym)
  console.log(`[Email Mock] Symulacja wysyłki wiadomości e-mail:`);
  console.log(`  DO: ${to}`);
  console.log(`  OD: ${from}`);
  console.log(`  TEMAT: ${subject}`);
  console.log(`  ZAŁĄCZNIKI (${attachments.length}): ${attachments.map((a) => a.filename).join(", ")}`);

  return {
    success: true,
    messageId: `sim_${Date.now()}`,
    provider: "simulated",
    message: `[Tryb Demo/Dev] Faktura została pomyślnie przetworzona i skierowana do wysyłki na adres ${to}. Aby wysyłać prawdziwe e-maile, skonfiguruj RESEND_API_KEY lub SMTP_HOST w pliku .env.`,
  };
}
