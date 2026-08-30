import crypto from "crypto";
import { KSEF_PUBLIC_KEYS, type KsefEnvironment } from "./constants";

export interface EncryptedInvoicePackage {
  /** Zaszyfrowana zawartość faktury w formacie binarnym */
  encryptedData: Buffer;
  /** Zaszyfrowana zawartość faktury zakodowana w Base64 */
  encryptedDataBase64: string;
  /** Wektor inicjalizacyjny IV (16 bajtów) w Base64 */
  ivBase64: string;
  /** Klucz symetryczny AES-256 (32 bajty) */
  symmetricKey: Buffer;
  /** Wektor IV (16 bajtów) */
  iv: Buffer;
  /** Klucz symetryczny AES zaszyfrowany kluczem publicznym RSA MF (Base64) */
  encryptedSymmetricKeyBase64: string;
  /** Skrót SHA-256 oryginalnego dokumentu XML w Base64 */
  plainDigestBase64: string;
  /** Rozmiar oryginalnego dokumentu XML w bajtach */
  plainFileSize: number;
  /** Skrót SHA-256 zaszyfrowanego dokumentu w Base64 */
  encryptedDigestBase64: string;
  /** Rozmiar zaszyfrowanego dokumentu w bajtach */
  encryptedFileSize: number;
}

/**
 * Oblicza skrót SHA-256 podanych danych i zwraca go w formacie Base64.
 */
export function sha256Base64(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return crypto.createHash("sha256").update(buf).digest("base64");
}

/**
 * Oblicza skrót SHA-256 podanych danych i zwraca go w formacie Hex.
 */
export function sha256Hex(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Normalizuje klucz publiczny RSA / certyfikat X.509 do formatu PEM.
 */
export function normalizePublicKeyPem(keyOrCert: string): string {
  const trimmed = keyOrCert.trim();

  if (trimmed.includes("-----BEGIN CERTIFICATE-----")) {
    try {
      const x509 = new crypto.X509Certificate(trimmed);
      return x509.publicKey.export({ type: "spki", format: "pem" }).toString();
    } catch {
      // Fallback do czystego tekstu jeśli parser X509 nie przetworzył certyfikatu
    }
  }

  if (trimmed.includes("-----BEGIN PUBLIC KEY-----") || trimmed.includes("-----BEGIN RSA PUBLIC KEY-----")) {
    return trimmed;
  }

  // Jeśli przekazano sam czysty Base64 bez nagłówków PEM
  const formatted = trimmed.match(/.{1,64}/g)?.join("\n") ?? trimmed;
  return `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
}

/**
 * Pobiera właściwy klucz publiczny dla danego środowiska KSeF.
 */
export function getKsefPublicKey(env: KsefEnvironment = "test"): string {
  const customKey = process.env.KSEF_PUBLIC_KEY_PEM;
  if (customKey && customKey.trim().length > 0) {
    return normalizePublicKeyPem(customKey);
  }
  const key = KSEF_PUBLIC_KEYS[env] || KSEF_PUBLIC_KEYS.test;
  return normalizePublicKeyPem(key);
}

/**
 * Szyfruje dane asymetrycznym algorytmem RSA-OAEP z funkcją skrótu SHA-256 i MGF1 (standard KSeF API 2.0).
 */
export function encryptRsaOaep(plaintext: Buffer | string, publicKeyPem: string): string {
  const buf = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const pem = normalizePublicKeyPem(publicKeyPem);

  const encrypted = crypto.publicEncrypt(
    {
      key: pem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    buf
  );

  return encrypted.toString("base64");
}

/**
 * Szyfruje token autoryzacyjny KSeF w połączeniu z timestampem wyzwania (Challenge).
 * Format wejściowy: `${token}|${timestampMs}`
 *
 * @param token - Token autoryzacyjny podatnika wygenerowany w KSeF
 * @param challengeTimestampMs - Timestamp (w ms) uzyskany z AuthorisationChallenge
 * @param publicKeyPem - Klucz publiczny RSA MF
 */
export function encryptKsefToken(
  token: string,
  challengeTimestampMs: number | string,
  publicKeyPem: string
): string {
  const ts = typeof challengeTimestampMs === "string" ? new Date(challengeTimestampMs).getTime() : challengeTimestampMs;
  if (isNaN(ts)) {
    throw new Error(`Nieprawidłowy timestamp wyzwania KSeF: ${challengeTimestampMs}`);
  }

  const payload = `${token.trim()}|${ts}`;
  return encryptRsaOaep(Buffer.from(payload, "utf8"), publicKeyPem);
}

/**
 * Generuje losowy 256-bitowy klucz symetryczny AES (32 bajty).
 */
export function generateAesKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Generuje losowy 128-bitowy wektor inicjalizacyjny IV (16 bajtów).
 */
export function generateIv(): Buffer {
  return crypto.randomBytes(16);
}

/**
 * Szyfruje treść XML faktury zgodnie z oficjalnym standardem KSeF:
 * 1. Wylicza hash SHA-256 oryginalnego XML.
 * 2. Generuje losowy 32-bajtowy klucz symetryczny AES-256 oraz 16-bajtowy wektor IV.
 * 3. Szyfruje XML algorytmem AES-256-CBC z dopełnieniem PKCS#7.
 * 4. Szyfruje klucz symetryczny kluczem publicznym RSA MF (RSA-OAEP SHA-256).
 * 5. Wylicza hash SHA-256 zaszyfrowanego pliku.
 *
 * @param xmlContent - Surowy XML faktury zgodny z FA(3)
 * @param publicKeyPem - Klucz publiczny RSA Ministerstwa Finansów
 */
export function encryptInvoicePayload(xmlContent: string, publicKeyPem: string): EncryptedInvoicePackage {
  const xmlBuffer = Buffer.from(xmlContent.trim(), "utf8");
  const plainDigestBase64 = sha256Base64(xmlBuffer);
  const plainFileSize = xmlBuffer.length;

  const symmetricKey = generateAesKey();
  const iv = generateIv();

  // Szyfrowanie symetryczne AES-256-CBC (Node.js automatycznie stosuje dopełnienie PKCS#7)
  const cipher = crypto.createCipheriv("aes-256-cbc", symmetricKey, iv);
  const encryptedChunks = [cipher.update(xmlBuffer), cipher.final()];
  const encryptedData = Buffer.concat(encryptedChunks);

  const encryptedDataBase64 = encryptedData.toString("base64");
  const encryptedDigestBase64 = sha256Base64(encryptedData);
  const encryptedFileSize = encryptedData.length;

  // Asymetryczne szyfrowanie klucza symetrycznego kluczem publicznym MF
  const encryptedSymmetricKeyBase64 = encryptRsaOaep(symmetricKey, publicKeyPem);

  return {
    encryptedData,
    encryptedDataBase64,
    iv,
    ivBase64: iv.toString("base64"),
    symmetricKey,
    encryptedSymmetricKeyBase64,
    plainDigestBase64,
    plainFileSize,
    encryptedDigestBase64,
    encryptedFileSize,
  };
}

/**
 * Deszyfruje zaszyfrowaną fakturę pobraną z KSeF (AES-256-CBC z PKCS#7).
 *
 * @param encryptedBuffer - Zaszyfrowane bajty dokumentu
 * @param symmetricKey - Klucz symetryczny AES-256 (32 bajty)
 * @param iv - Wektor inicjalizacyjny IV (16 bajtów)
 */
export function decryptInvoicePayload(encryptedBuffer: Buffer, symmetricKey: Buffer, iv: Buffer): string {
  const decipher = crypto.createDecipheriv("aes-256-cbc", symmetricKey, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  return decrypted.toString("utf8");
}
