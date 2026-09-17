import nodemailer from "nodemailer";

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailOptions {
  singleAttempt?: boolean;
  signal?: AbortSignal;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  provider: "resend" | "smtp";
  message: string;
}

import { isValidEmail, parseEmailList } from "./validation";
export { isValidEmail, parseEmailList };

/**
 * Zwraca status konfiguracji serwera pocztowego.
 */
export function getEmailConfigStatus(): {
  configured: boolean;
  provider: "resend" | "smtp" | "none";
  from: string;
  host?: string;
} {
  const from = process.env.EMAIL_FROM || "FakturaProsto <faktury@fakturaprosto.pl>";
  if (process.env.RESEND_API_KEY?.trim()) {
    return { configured: true, provider: "resend", from };
  }
  if (process.env.SMTP_HOST?.trim()) {
    return {
      configured: true,
      provider: "smtp",
      from,
      host: process.env.SMTP_HOST.trim(),
    };
  }
  return { configured: false, provider: "none", from };
}

/**
 * Sprawdza czy błąd SMTP ma charakter przejściowy (nadaje się do ponowienia).
 */
function isTransientError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  const code = error.code || "";
  const responseCode = error.responseCode || 0;

  if (["econnreset", "etimedout", "esocket", "econnrefused", "ehostunreach", "epipe"].includes(code.toLowerCase())) {
    return true;
  }
  if (responseCode === 421 || responseCode === 451 || responseCode === 452) {
    return true;
  }
  if (msg.includes("timeout") || msg.includes("temporarily") || msg.includes("try again later")) {
    return true;
  }
  return false;
}

/**
 * Uniwersalny serwis wysyłki e-maili z obsługą Resend, SMTP (Nodemailer) oraz ponawianiem błędów przejściowych.
 * ZGODNIE Z WYMAGANIAMI: Nie symuluje sukcesu, jeśli brak konfiguracji.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { subject, text, html, attachments = [], replyTo } = options;
  const from = options.from || process.env.EMAIL_FROM || "FakturaProsto <faktury@fakturaprosto.pl>";

  // Parsowanie i walidacja adresów odbiorców
  const toList = parseEmailList(options.to);
  if (toList.length === 0) {
    throw new Error("Brak wymaganego adresu e-mail odbiorcy.");
  }
  for (const addr of toList) {
    if (!isValidEmail(addr)) {
      throw new Error(`Nieprawidłowy format adresu odbiorcy: ${addr}`);
    }
  }

  const ccList = parseEmailList(options.cc);
  for (const addr of ccList) {
    if (!isValidEmail(addr)) {
      throw new Error(`Nieprawidłowy format adresu DW (Cc): ${addr}`);
    }
  }

  const bccList = parseEmailList(options.bcc);
  for (const addr of bccList) {
    if (!isValidEmail(addr)) {
      throw new Error(`Nieprawidłowy format adresu UDW (Bcc): ${addr}`);
    }
  }

  if (replyTo && !isValidEmail(replyTo)) {
    throw new Error(`Nieprawidłowy format adresu Reply-To: ${replyTo}`);
  }

  // ── 1. Resend API (HTTP REST) ──
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const resendAttachments = attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content)
          ? att.content.toString("base64")
          : Buffer.from(att.content).toString("base64"),
      }));

      const payload: Record<string, any> = {
        from,
        to: toList,
        subject,
        text: text || undefined,
        html: html || undefined,
        attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
      };

      if (ccList.length > 0) payload.cc = ccList;
      if (bccList.length > 0) payload.bcc = bccList;
      if (replyTo) payload.reply_to = replyTo;

      const res = await fetch("https://api.resend.com/emails", {
        signal: options.signal,
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData?.message || `Błąd Resend API HTTP ${res.status}`);
      }

      return {
        success: true,
        messageId: resData?.id,
        provider: "resend",
        message: `Wiadomość została wysłana przez Resend do ${toList.join(", ")}`,
      };
    } catch (err: any) {
      console.error("[Email] Błąd wysyłki przez Resend API:", err);
      throw new Error(`Wysyłka e-mail (Resend) nie powiodła się: ${err.message || err}`);
    }
  }

  // ── 2. SMTP (Nodemailer) z ponawianiem błędów przejściowych ──
  const smtpHost = process.env.SMTP_HOST?.trim();
  if (smtpHost) {
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER.trim(),
            pass: process.env.SMTP_PASS || "",
          }
        : undefined,
      // Opcje połączenia zabezpieczające przed zawieszeniem
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    const mailAttachments = attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
    }));

    const mailOptions = {
      from,
      to: toList.join(", "),
      cc: ccList.length > 0 ? ccList.join(", ") : undefined,
      bcc: bccList.length > 0 ? bccList.join(", ") : undefined,
      replyTo: replyTo || undefined,
      subject,
      text,
      html,
      attachments: mailAttachments,
    };

    let lastErr: any = null;
    const maxAttempts = options.singleAttempt ? 1 : 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const info = await transporter.sendMail(mailOptions);
        return {
          success: true,
          messageId: info.messageId,
          provider: "smtp",
          message: `Wiadomość została przyjęta przez serwer SMTP (${smtpHost}) do doręczenia na adres ${toList.join(", ")}`,
        };
      } catch (err: any) {
        lastErr = err;
        console.warn(`[Email SMTP] Próba ${attempt}/${maxAttempts} nie powiodła się:`, err.message || err);
        if (attempt < maxAttempts && isTransientError(err)) {
          // Odczekanie z exponential backoff
          await new Promise((r) => setTimeout(r, attempt * 1000));
          continue;
        }
        break;
      }
    }

    console.error("[Email] Błąd wysyłki przez SMTP po próbach:", lastErr);
    throw new Error(`Wysyłka e-mail (SMTP) nie powiodła się: ${lastErr?.message || lastErr}`);
  }

  // ── 3. Brak konfiguracji — rzucamy czytelny błąd, NIE symulujemy sukcesu! ──
  const configErr: any = new Error(
    "Poczta e-mail nie została skonfigurowana. Skonfiguruj serwer SMTP (np. w hostingu CyberFolks) lub RESEND_API_KEY w zmiennych środowiskowych."
  );
  configErr.code = "EMAIL_NOT_CONFIGURED";
  throw configErr;
}


