import * as crypto from "crypto";
import { KSEF_STATIC_KEYS, type KsefEnvironment, type KsefKeyInfo } from "./constants";

export interface EncryptedInvoicePackage {
  /** Skrót SHA-256 oryginalnego dokumentu XML w Base64 */
  plainDigestBase64: string;
  /** Rozmiar oryginalnego dokumentu XML w bajtach */
  plainFileSize: number;
  /** Skrót SHA-256 zaszyfrowanego dokumentu w Base64 */
  encryptedDigestBase64: string;
  /** Rozmiar zaszyfrowanego dokumentu w bajtach */
  encryptedFileSize: number;
  /** Zaszyfrowana zawartość faktury zakodowana w Base64 */
  encryptedDataBase64: string;
  /** Zaszyfrowane bajty */
  encryptedData: Buffer;
  /** Klucz symetryczny AES-256 (32 bajty) */
  symmetricKey: Buffer;
  /** Wektor IV (16 bajtów) */
  iv: Buffer;
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
 * Normalizuje klucz publiczny RSA / certyfikat X.509 do formatu PEM (SPKI).
 */
export function normalizePublicKeyPem(keyOrCert: string): string {
  const trimmed = keyOrCert.trim();

  if (trimmed.includes("-----BEGIN CERTIFICATE-----")) {
    try {
      const x509 = new crypto.X509Certificate(trimmed);
      return x509.publicKey.export({ type: "spki", format: "pem" }).toString();
    } catch {
      // kontynuuj do sprawdzenia kolejnych wariantów
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
 * Pobiera statyczny certyfikat / klucz publiczny MF dla danego środowiska i przeznaczenia.
 */
export function getStaticKsefKey(
  env: KsefEnvironment = "test",
  usage: "tokenEncryption" | "symmetricKeyEncryption" = "tokenEncryption"
): KsefKeyInfo {
  const targetEnv = env === "production" ? "production" : "test";
  return KSEF_STATIC_KEYS[targetEnv][usage];
}

/**
 * Szyfruje dane asymetrycznym algorytmem RSA-OAEP z funkcją skrótu SHA-256 (standard KSeF API 2.0).
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
 * @param challengeTimestampMs - Timestamp (w ms) uzyskany z /auth/challenge
 * @param publicKeyPem - Klucz publiczny RSA MF (KsefTokenEncryption)
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
 * Szyfruje treść XML faktury zgodnie z oficjalnym standardem KSeF API 2.0 (AES-256-CBC z PKCS#7).
 */
export function encryptInvoicePayload(
  xmlContent: string,
  symmetricKey: Buffer,
  iv: Buffer
): EncryptedInvoicePackage {
  const xmlBuffer = Buffer.from(xmlContent.trim(), "utf8");
  const plainDigestBase64 = sha256Base64(xmlBuffer);
  const plainFileSize = xmlBuffer.length;

  const cipher = crypto.createCipheriv("aes-256-cbc", symmetricKey, iv);
  const encryptedChunks = [cipher.update(xmlBuffer), cipher.final()];
  const encryptedData = Buffer.concat(encryptedChunks);

  const encryptedDataBase64 = encryptedData.toString("base64");
  const encryptedDigestBase64 = sha256Base64(encryptedData);
  const encryptedFileSize = encryptedData.length;

  return {
    plainDigestBase64,
    plainFileSize,
    encryptedDigestBase64,
    encryptedFileSize,
    encryptedDataBase64,
    encryptedData,
    symmetricKey,
    iv,
  };
}

/**
 * Deszyfruje zaszyfrowaną fakturę pobraną z KSeF (AES-256-CBC z PKCS#7).
 */
export function decryptInvoicePayload(encryptedBuffer: Buffer, symmetricKey: Buffer, iv: Buffer): string {
  const decipher = crypto.createDecipheriv("aes-256-cbc", symmetricKey, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  return decrypted.toString("utf8");
}
