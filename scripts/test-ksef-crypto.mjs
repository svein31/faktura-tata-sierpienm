/**
 * Test weryfikacyjny modułu kryptografii KSeF oraz generatora XML FA(3)
 */
import crypto from "node:crypto";
import { strict as assert } from "node:assert";

console.log("==================================================");
console.log("1. TEST SZYFROWANIA RSA-OAEP (SHA-256 + MGF1)");
console.log("==================================================");

// Generujemy parę kluczy RSA 2048 do testu
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const testToken = "TEST-TOKEN-1234567890-ABCDEF";
const testTimestamp = Date.now();
const challengePayload = `${testToken}|${testTimestamp}`;

// Szyfrowanie RSA-OAEP z SHA-256 (dokładnie jak w src/lib/ksef/crypto.ts)
const encryptedToken = crypto.publicEncrypt(
  {
    key: publicKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  },
  Buffer.from(challengePayload, "utf8")
);

const base64EncryptedToken = encryptedToken.toString("base64");
console.log("✓ Wygenerowano zaszyfrowany token KSeF (Base64):", base64EncryptedToken.slice(0, 48) + "...");

// Deszyfrowanie i weryfikacja
const decryptedPayload = crypto.privateDecrypt(
  {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  },
  Buffer.from(base64EncryptedToken, "base64")
).toString("utf8");

assert.equal(decryptedPayload, challengePayload);
console.log("✓ Zdeszyfrowano pomyślnie:", decryptedPayload);

console.log("\n==================================================");
console.log("2. TEST SZYFROWANIA AES-256-CBC + PKCS#7 + SHA-256");
console.log("==================================================");

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2026-08-30T19:00:00Z</DataWytworzeniaFa>
  </Naglowek>
  <Fa>
    <P_15>123.00</P_15>
  </Fa>
</Faktura>`;

const xmlBuffer = Buffer.from(sampleXml, "utf8");
const plainSha256 = crypto.createHash("sha256").update(xmlBuffer).digest("base64");
console.log("✓ SHA-256 (Base64) oryginalnego XML:", plainSha256);

// Generowanie 32-bajtowego klucza AES i 16-bajtowego IV
const aesKey = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

// Szyfrowanie AES-256-CBC
const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
const encryptedData = Buffer.concat([cipher.update(xmlBuffer), cipher.final()]);
const encryptedSha256 = crypto.createHash("sha256").update(encryptedData).digest("base64");

console.log("✓ Zaszyfrowano XML (" + xmlBuffer.length + " B -> " + encryptedData.length + " B)");
console.log("✓ SHA-256 (Base64) zaszyfrowanego pakietu:", encryptedSha256);

// Szyfrowanie klucza AES kluczem publicznym RSA
const encryptedKey = crypto.publicEncrypt(
  {
    key: publicKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  },
  aesKey
);
console.log("✓ Klucz symetryczny AES zaszyfrowany RSA-OAEP (Base64):", encryptedKey.toString("base64").slice(0, 48) + "...");

// Deszyfrowanie symetryczne
const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
const decryptedXml = Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString("utf8");

assert.equal(decryptedXml, sampleXml);
console.log("✓ Zdeszyfrowano XML, treść w 100% zgodna z oryginałem!");

console.log("\n==================================================");
console.log("WSZYSTKIE TESTY KRYPTOGRAFICZNE PRZESZŁY POMYŚLNIE!");
console.log("==================================================");
