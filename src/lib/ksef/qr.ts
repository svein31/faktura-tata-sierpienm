/**
 * KSeF 2.0 / CIRFMF QR Code Generator
 * Zgodny ze specyfikacją techniczną kodów QR Ministerstwa Finansów dla e-Faktur KSeF:
 * - KOD I: Kod weryfikacyjny e-Faktury (weryfikacja statusu i integralności dokumentu)
 * - KOD II: Certyfikat weryfikacji dla trybu offline / awaryjnego
 * - Etykieta pod kodem QR: "KSeF: {NumerKSeF}" lub "OFFLINE" w przypadku braku rejestracji
 */

import * as crypto from "crypto";
import * as QRCodeLib from "qrcode";
const QRCode = (QRCodeLib as any).default || QRCodeLib;
import type { KsefEnvironment } from "./constants";

export interface KsefQrParams {
  sellerNip: string;
  issueDate: string; // YYYY-MM-DD lub DD-MM-YYYY
  xmlContent?: string;
  xmlHashBase64Url?: string;
  environment?: KsefEnvironment;
  ksefNumber?: string | null;
}

/**
 * Przekształca ciąg bajtów lub Base64 na format Base64URL bez dopełnienia '='
 */
export function toBase64Url(bufOrBase64: Buffer | string): string {
  const base64 = typeof bufOrBase64 === "string" 
    ? (bufOrBase64.includes("+") || bufOrBase64.includes("/") || bufOrBase64.endsWith("=")
        ? bufOrBase64
        : Buffer.from(bufOrBase64, "utf8").toString("base64"))
    : bufOrBase64.toString("base64");

  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Formatuje datę do formatu DD-MM-YYYY wymaganego przez specyfikację CIRFMF
 */
export function formatKsefDate(dateStr: string): string {
  const cleaned = (dateStr || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split("-");
    return `${d}-${m}-${y}`;
  }
  return cleaned;
}

/**
 * Oblicza skrót SHA-256 w formacie Base64URL dla treści XML faktury
 */
export function calculateXmlDigestBase64Url(xmlContent: string): string {
  const hash = crypto.createHash("sha256").update(Buffer.from(xmlContent.trim(), "utf8")).digest();
  return toBase64Url(hash);
}

/**
 * Buduje oficjalny adres URL KOD I weryfikacji KSeF (CIRFMF)
 */
export function buildKsefVerificationUrl(params: KsefQrParams): string {
  const { sellerNip, issueDate, xmlContent, xmlHashBase64Url, environment = "test" } = params;
  const nipClean = sellerNip.replace(/[^0-9]/g, "");
  const formattedDate = formatKsefDate(issueDate);

  const digest = xmlHashBase64Url || (xmlContent ? calculateXmlDigestBase64Url(xmlContent) : toBase64Url(crypto.randomBytes(32)));

  const domain = environment === "production"
    ? "qr.ksef.mf.gov.pl"
    : environment === "demo"
      ? "qr-demo.ksef.mf.gov.pl"
      : "qr-test.ksef.mf.gov.pl";

  return `https://${domain}/invoice/${nipClean}/${formattedDate}/${digest}`;
}

/**
 * Buduje oficjalny adres URL KOD II dla trybu awaryjnego / offline
 */
export function buildKsefOfflineCertUrl(params: KsefQrParams): string {
  const { sellerNip, xmlContent, xmlHashBase64Url, environment = "test" } = params;
  const nipClean = sellerNip.replace(/[^0-9]/g, "");
  const digest = xmlHashBase64Url || (xmlContent ? calculateXmlDigestBase64Url(xmlContent) : toBase64Url(crypto.randomBytes(32)));

  const domain = environment === "production"
    ? "qr.ksef.mf.gov.pl"
    : environment === "demo"
      ? "qr-demo.ksef.mf.gov.pl"
      : "qr-test.ksef.mf.gov.pl";

  return `https://${domain}/certificate/${nipClean}/${digest}`;
}

/**
 * Generuje bufor obrazu PNG dla podanego URL kodu QR
 */
export async function generateQrPngBuffer(url: string, width = 200): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    width,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

/**
 * Zwraca etykietę tekstową pod kod QR zgodnie ze standardem CIRFMF:
 * Jeśli faktura zarejestrowana w KSeF -> numer KSeF
 * Jeśli brak potwierdzenia lub tryb awaryjny -> "OFFLINE"
 */
export function getKsefQrLabel(ksefNumber?: string | null, isOffline?: boolean): string {
  if (ksefNumber && ksefNumber.trim() && !isOffline) {
    return `KSeF: ${ksefNumber.trim()}`;
  }
  return "OFFLINE";
}
