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

export interface KsefOfflineSigningParams extends KsefQrParams {
  certificatePem: string;
  privateKeyPem: string;
  contextType: "Nip";
  contextValue: string;
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
  const hash = crypto.createHash("sha256").update(Buffer.from(xmlContent, "utf8")).digest();
  return toBase64Url(hash);
}

/**
 * Buduje oficjalny adres URL KOD I weryfikacji KSeF (CIRFMF)
 */
export function buildKsefVerificationUrl(params: KsefQrParams): string {
  const { sellerNip, issueDate, xmlContent, xmlHashBase64Url, environment = "test" } = params;
  const nipClean = sellerNip.replace(/[^0-9]/g, "");
  const formattedDate = formatKsefDate(issueDate);

  if (!xmlHashBase64Url && !xmlContent) throw new Error("Kod I wymaga dokładnej treści XML lub jej skrótu SHA-256.");
  const digest = xmlHashBase64Url || calculateXmlDigestBase64Url(xmlContent!);

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
export function buildKsefOfflineCertUrl(params: KsefQrParams | KsefOfflineSigningParams): string {
  if (!("certificatePem" in params && "privateKeyPem" in params && "contextType" in params && "contextValue" in params))
    throw new Error("Kod II wymaga podpisu certyfikatem KSeF typu Offline.");
  const signing = params as KsefOfflineSigningParams;
  const nip = signing.sellerNip.replace(/\D/g, "");
  const context = signing.contextValue.replace(/\D/g, "");
  if (!/^\d{10}$/.test(nip) || signing.contextType !== "Nip" || !/^\d{10}$/.test(context))
    throw new Error("Kod II wymaga poprawnego kontekstu NIP.");
  if (!signing.xmlContent && !signing.xmlHashBase64Url) throw new Error("Brak skrótu XML.");
  const hash = signing.xmlHashBase64Url || calculateXmlDigestBase64Url(signing.xmlContent!);
  if (!/^[a-zA-Z0-9_-]{43}$/.test(hash)) throw new Error("Nieprawidłowy skrót XML.");
  const cert = new crypto.X509Certificate(signing.certificatePem);
  const now = Date.now();
  if (now < new Date(cert.validFrom).getTime() || now > new Date(cert.validTo).getTime())
    throw new Error("Certyfikat KSeF nie jest obecnie ważny.");
  const key = crypto.createPrivateKey(signing.privateKeyPem);
  if (key.asymmetricKeyType !== cert.publicKey.asymmetricKeyType) throw new Error("Klucz nie odpowiada certyfikatowi.");
  const domain = signing.environment === "production" ? "qr.ksef.mf.gov.pl" : signing.environment === "demo" ? "qr-demo.ksef.mf.gov.pl" : "qr-test.ksef.mf.gov.pl";
  const path = `${domain}/certificate/Nip/${context}/${nip}/${cert.serialNumber}/${hash}`;
  const message = Buffer.from(path, "utf8");
  const options = key.asymmetricKeyType === "rsa"
    ? { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }
    : { key, dsaEncoding: "ieee-p1363" as const };
  if (key.asymmetricKeyType === "rsa" && (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error("Klucz RSA jest za krótki.");
  if (key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("Wymagany klucz ECDSA P-256.");
  if (!["rsa", "ec"].includes(key.asymmetricKeyType || "")) throw new Error("Nieobsługiwany algorytm certyfikatu.");
  const sig = crypto.sign("sha256", message, options);
  if (!crypto.verify("sha256", message, { key: cert.publicKey, ...(key.asymmetricKeyType === "rsa" ? { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 } : { dsaEncoding: "ieee-p1363" as const }) }, sig))
    throw new Error("Klucz nie odpowiada certyfikatowi.");
  return `https://${path}/${sig.toString("base64url")}`;
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
export function getKsefQrLabel(ksefNumber?: string | null, _isOffline?: boolean): string {
  if (ksefNumber && ksefNumber.trim()) {
    return `KSeF: ${ksefNumber.trim()}`;
  }
  return "OFFLINE";
}
