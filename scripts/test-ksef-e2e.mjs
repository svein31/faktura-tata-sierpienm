/**
 * Kompleksowy test integracyjny KSeF 2.0 (FA(3) XML + Crypto + KsefClient)
 */
import { buildFa3Xml, validateFa3Xml, calculateFa3Totals } from "../src/lib/ksef/xmlBuilder.ts";
import { encryptInvoicePayload, encryptKsefToken, decryptInvoicePayload, sha256Base64 } from "../src/lib/ksef/crypto.ts";
import { KsefClient, generateDemoUpoXml } from "../src/lib/ksef/client.ts";
import { KSEF_PUBLIC_KEYS, FA3_NAMESPACE } from "../src/lib/ksef/constants.ts";
import { strict as assert } from "node:assert";

console.log("=========================================================");
console.log("KROK 1: TEST BUILDERA I WALIDATORA XML FA(3)");
console.log("=========================================================");

const mockSeller = {
  name: "Fakturowa Sp. z o.o.",
  nip: "5260301706",
  regon: "012345678",
  street: "ul. Prosta 51",
  city: "Warszawa",
  postal: "00-838",
  country: "PL",
  iban: "PL61109010140000071219812874",
  bankName: "Santander Bank Polska",
  email: "biuro@fakturowa.pl",
  phone: "+48 22 123 45 67",
};

const mockBuyer = {
  id: "contractor-1",
  name: "Klient Testowy Sp. z o.o.",
  nip: "5270000024",
  isVatPayer: true,
  address: {
    street: "ul. Marszałkowska 10",
    city: "Warszawa",
    postal: "00-001",
    country: "PL",
  },
  email: "ksiegowosc@klient.pl",
  createdAt: new Date().toISOString(),
};

const mockInvoice = {
  id: "inv-test-1",
  number: "FV/2026/08/0001",
  type: "sale",
  status: "draft",
  contractorId: "contractor-1",
  issueDate: "2026-08-30",
  saleDate: "2026-08-30",
  dueDate: "2026-09-13",
  currency: "PLN",
  language: "PL",
  paymentMethod: "transfer",
  paymentTermDays: 14,
  createdAt: new Date().toISOString(),
  lines: [
    {
      id: "line-1",
      name: "Licencja oprogramowania SaaS",
      quantity: 1,
      unit: "szt.",
      netPrice: 200.0,
      vatRate: "23",
    },
    {
      id: "line-2",
      name: "Usługa wdrożeniowa",
      quantity: 5,
      unit: "godz.",
      netPrice: 100.0,
      vatRate: "8",
    },
    {
      id: "line-3",
      name: "Konsultacje edukacyjne",
      quantity: 1,
      unit: "usł.",
      netPrice: 150.0,
      vatRate: "zw",
    },
  ],
};

const totals = calculateFa3Totals(mockInvoice.lines);
console.log("✓ Podsumowanie stawek:");
console.log(`  - 23%: Netto ${totals.rate23.net.toFixed(2)} zł, VAT ${totals.rate23.vat.toFixed(2)} zł`);
console.log(`  - 8%:  Netto ${totals.rate8.net.toFixed(2)} zł, VAT ${totals.rate8.vat.toFixed(2)} zł`);
console.log(`  - zw:  Netto ${totals.rateZw.net.toFixed(2)} zł`);
console.log(`  - Suma ogółem brutto: ${totals.totalGross.toFixed(2)} zł`);

assert.equal(totals.totalNet, 850);
assert.equal(totals.totalVat, 86);
assert.equal(totals.totalGross, 936);

const xml = buildFa3Xml({
  invoice: mockInvoice,
  seller: mockSeller,
  buyer: mockBuyer,
});

assert.ok(xml.includes(FA3_NAMESPACE), "XML musi zawierać przestrzeń nazw FA(3)");
assert.ok(xml.includes('kodSystemowy="FA (3)"'), "XML musi zawierać kodSystemowy FA (3)");
assert.ok(xml.includes("<WariantFormularza>3</WariantFormularza>"), "XML musi mieć WariantFormularza 3");
assert.ok(xml.includes("<P_13_1>200.00</P_13_1>"), "XML musi zawierać podsumowanie 23% netto");
assert.ok(xml.includes("<P_14_1>46.00</P_14_1>"), "XML musi zawierać podsumowanie 23% vat");
assert.ok(xml.includes("<P_13_2>500.00</P_13_2>"), "XML musi zawierać podsumowanie 8% netto");
assert.ok(xml.includes("<P_14_2>40.00</P_14_2>"), "XML musi zawierać podsumowanie 8% vat");
assert.ok(xml.includes("<P_13_7>150.00</P_13_7>"), "XML musi zawierać podsumowanie zw netto");
assert.ok(xml.includes("<P_15>936.00</P_15>"), "XML musi zawierać sumę brutto 936.00");
assert.ok(xml.includes("<Adnotacje>"), "XML musi zawierać sekcję Adnotacje");
assert.ok(xml.includes("<Platnosc>"), "XML musi zawierać sekcję Platnosc");

const valRes = validateFa3Xml(xml);
assert.equal(valRes.ok, true, "Walidacja XML FA(3) powinna zakończyć się sukcesem");
console.log("✓ Wygenerowano poprawny XML FA(3) zgodny ze schematem CRD MF");

console.log("\n=========================================================");
console.log("KROK 2: TEST SZYFROWANIA I KRYPTOGRAFII");
console.log("=========================================================");

const testPubKey = KSEF_PUBLIC_KEYS.test;
const encryptedPkg = encryptInvoicePayload(xml, testPubKey);

console.log(`✓ Oryginalny rozmiar XML: ${encryptedPkg.plainFileSize} B`);
console.log(`✓ SHA-256 (Base64) oryginału: ${encryptedPkg.plainDigestBase64}`);
console.log(`✓ Rozmiar zaszyfrowany (AES-256-CBC): ${encryptedPkg.encryptedFileSize} B`);
console.log(`✓ SHA-256 (Base64) zaszyfrowanego: ${encryptedPkg.encryptedDigestBase64}`);
console.log(`✓ Zaszyfrowany klucz symetryczny AES (RSA-OAEP Base64): ${encryptedPkg.encryptedSymmetricKeyBase64.slice(0, 40)}...`);

// Test deszyfrowania
const decryptedXml = decryptInvoicePayload(encryptedPkg.encryptedData, encryptedPkg.symmetricKey, encryptedPkg.iv);
assert.equal(decryptedXml, xml.trim());
console.log("✓ Deszyfrowanie symetryczne AES-256-CBC przywróciło 100% oryginalnego XML");

console.log("\n=========================================================");
console.log("KROK 3: TEST KLIENTA KSEF (DEMO & TEST WORKFLOW)");
console.log("=========================================================");

const client = new KsefClient({ environment: "demo" });

// 1. Authorisation Challenge
const challenge = await client.getAuthorisationChallenge(mockSeller.nip);
console.log(`✓ Challenge pobrany: ${challenge.challenge} (timestamp: ${challenge.timestamp})`);
assert.ok(challenge.challenge.length > 0);

// 2. Login with token
const session = await client.loginWithKsefToken(mockSeller.nip, "TEST_TOKEN_123");
console.log(`✓ Zalogowano sesję KSeF: Ref=${session.referenceNumber}, Token=${session.accessToken.slice(0, 25)}...`);
assert.ok(session.accessToken.length > 0);

// 3. Send Invoice
const sendResult = await client.sendInvoiceEncrypted(session.accessToken, xml);
console.log(`✓ Faktura wysłana: ElementRef=${sendResult.elementReferenceNumber}, Status=${sendResult.status}`);
assert.ok(sendResult.elementReferenceNumber.length > 0);

// 4. Status & UPO
const statusResult = await client.getInvoiceStatus(session.accessToken, sendResult.elementReferenceNumber);
console.log(`✓ Status faktury: Kod ${statusResult.processingCode} (${statusResult.processingDescription})`);
console.log(`✓ Numer KSeF: ${statusResult.ksefReferenceNumber}`);
console.log(`✓ UPO pobrane: ${statusResult.upoXml ? "TAK (" + statusResult.upoXml.length + " B)" : "NIE"}`);
assert.equal(statusResult.status, "ACCEPTED");
assert.ok(statusResult.ksefReferenceNumber?.includes("5260301706"));

console.log("\n=========================================================");
console.log("🎉 WSZYSTKIE TESTY INTEGRACYJNE PRZESZŁY W 100% SUKCESEM!");
console.log("=========================================================");
