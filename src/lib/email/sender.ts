import nodemailer from "nodemailer";

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailOptions {
  singleAttempt?: boolean;
  idempotencyKey?: string;
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

/** A timeout after provider submission can mean the message was already accepted. */
export class EmailDeliveryError extends Error {
  constructor(message: string, public readonly deliveryUncertain: boolean) {
    super(message);
    this.name = "EmailDeliveryError";
  }
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

function isDefinitelyRejected(error: any): boolean {
  return error?.responseCode >= 400
    || ["EAUTH", "ENOTFOUND", "EDNS", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "EENVELOPE", "ETLS"].includes(error?.code);
}

/**
 * Uniwersalny serwis wysyłki e-maili z obsługą Resend, SMTP (Nodemailer) oraz ponawianiem błędów przejściowych.
 * ZGODNIE Z WYMAGANIAMI: Nie symuluje sukcesu, jeśli brak konfiguracji.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (options.signal?.aborted) throw new EmailDeliveryError("Budżet czasu wysyłki e-maila został wykorzystany przed połączeniem z dostawcą.", false);
  const { subject, text, html, attachments = [], replyTo } = options;
  const from = options.from || process.env.EMAIL_FROM || "FakturaProsto <faktury@fakturaprosto.pl>";

  // Parsowanie i walidacja adresów odbiorców
  const toList = parseEmailList(options.to);
  if (toList.length === 0) {
    throw new EmailDeliveryError("Brak wymaganego adresu e-mail odbiorcy.", false);
  }
  for (const addr of toList) {
    if (!isValidEmail(addr)) {
      throw new EmailDeliveryError(`Nieprawidłowy format adresu odbiorcy: ${addr}`, false);
    }
  }

  const ccList = parseEmailList(options.cc);
  for (const addr of ccList) {
    if (!isValidEmail(addr)) {
      throw new EmailDeliveryError(`Nieprawidłowy format adresu DW (Cc): ${addr}`, false);
    }
  }

  const bccList = parseEmailList(options.bcc);
  for (const addr of bccList) {
    if (!isValidEmail(addr)) {
      throw new EmailDeliveryError(`Nieprawidłowy format adresu UDW (Bcc): ${addr}`, false);
    }
  }

  if (replyTo && !isValidEmail(replyTo)) {
    throw new EmailDeliveryError(`Nieprawidłowy format adresu Reply-To: ${replyTo}`, false);
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
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new EmailDeliveryError(resData?.message || `Błąd Resend API HTTP ${res.status}`, res.status >= 500);
      }

      return {
        success: true,
        messageId: resData?.id,
        provider: "resend",
        message: `Wiadomość została wysłana przez Resend do ${toList.join(", ")}`,
      };
    } catch (err: any) {
      console.error("[Email] Błąd wysyłki przez Resend API:", err);
      throw new EmailDeliveryError(`Wysyłka e-mail (Resend) nie powiodła się: ${err.message || err}`, err.deliveryUncertain !== false);
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
      let onAbort: (() => void) | undefined;
      try {
        if (options.signal?.aborted) throw new EmailDeliveryError("Przerwano wysyłkę przed połączeniem SMTP.", false);
        const delivery = transporter.sendMail(mailOptions);
        const info = options.signal ? await Promise.race([delivery, new Promise<never>((_resolve, reject) => {
          onAbort = () => {
            transporter.close?.();
            reject(new EmailDeliveryError("Budżet czasu SMTP został wykorzystany. Wynik doręczenia wymaga sprawdzenia u dostawcy.", true));
          };
          options.signal!.addEventListener("abort", onAbort, { once: true });
          if (options.signal!.aborted) onAbort();
        })]) : await delivery;
        return {
          success: true,
          messageId: info.messageId,
          provider: "smtp",
          message: `Wiadomość została przyjęta przez serwer SMTP (${smtpHost}) do doręczenia na adres ${toList.join(", ")}`,
        };
      } catch (err: any) {
        lastErr = err;
        console.warn(`[Email SMTP] Próba ${attempt}/${maxAttempts} nie powiodła się:`, err.message || err);
        if (attempt < maxAttempts && isTransientError(err) && isDefinitelyRejected(err)) {
          // Odczekanie z exponential backoff
          await new Promise((r) => setTimeout(r, attempt * 1000));
          continue;
        }
        break;
      } finally {
        if (onAbort) options.signal?.removeEventListener("abort", onAbort);
      }
    }

    console.error("[Email] Błąd wysyłki przez SMTP po próbach:", lastErr);
    throw new EmailDeliveryError(`Wysyłka e-mail (SMTP) nie powiodła się: ${lastErr?.message || lastErr}`, lastErr instanceof EmailDeliveryError ? lastErr.deliveryUncertain : !isDefinitelyRejected(lastErr));
  }

  // ── 3. Brak konfiguracji — rzucamy czytelny błąd, NIE symulujemy sukcesu! ──
  const configErr: any = new Error(
    "Poczta e-mail nie została skonfigurowana. Skonfiguruj serwer SMTP (np. w hostingu CyberFolks) lub RESEND_API_KEY w zmiennych środowiskowych."
  );
  configErr.code = "EMAIL_NOT_CONFIGURED";
  configErr.deliveryUncertain = false;
  throw configErr;
}


