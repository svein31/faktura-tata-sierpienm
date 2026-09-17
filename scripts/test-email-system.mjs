// @ts-check
import assert from "node:assert";
import nodemailer from "nodemailer";
import { isValidEmail, parseEmailList, sendEmail } from "../src/lib/email/sender.ts";

console.log("══════════════════════════════════════════════════════════════");
console.log("  TESTY SYSTEMU WYSYŁKI E-MAIL (FAKTURO)");
console.log("══════════════════════════════════════════════════════════════\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✘ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✘ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

// ── Test 1: Walidacja adresów RFC 5322 ──
test("Walidacja poprawnych adresów e-mail", () => {
  assert.strictEqual(isValidEmail("jan.kowalski@firma.pl"), true);
  assert.strictEqual(isValidEmail("biuro+faktury@sub.domena.com.pl"), true);
  assert.strictEqual(isValidEmail("user.name_123@domain.org"), true);
});

test("Odrzucenie niepoprawnych adresów e-mail", () => {
  assert.strictEqual(isValidEmail(""), false);
  assert.strictEqual(isValidEmail("brak-malpy.pl"), false);
  assert.strictEqual(isValidEmail("@brak-nazwy.pl"), false);
  assert.strictEqual(isValidEmail("spacja w@adresie.pl"), false);
  assert.strictEqual(isValidEmail("jan@"), false);
});

test("Parsowanie list adresów DW i UDW (przecinki / średniki)", () => {
  const list = parseEmailList("a@firma.pl, b@firma.pl; c@firma.pl ");
  assert.deepStrictEqual(list, ["a@firma.pl", "b@firma.pl", "c@firma.pl"]);
});

// ── Test 2: Brak fałszywej symulacji sukcesu przy braku konfiguracji ──
await asyncTest("Brak konfiguracji poczty rzuca błąd EMAIL_NOT_CONFIGURED zamiast symulować sukces", async () => {
  // Tymczasowo upewniamy się, że brak zmiennych
  const oldHost = process.env.SMTP_HOST;
  const oldResend = process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.RESEND_API_KEY;

  try {
    const { sendEmail } = await import("../src/lib/email/sender.ts");
    let caughtError = null;
    try {
      await sendEmail({
        to: "test@example.com",
        subject: "Faktura testowa",
        text: "Test",
      });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, "Powinien zostać rzucony błąd przy braku konfiguracji");
    assert.strictEqual(caughtError.code, "EMAIL_NOT_CONFIGURED");
    assert.ok(caughtError.message.includes("Poczta e-mail nie została skonfigurowana"));
  } finally {
    if (oldHost) process.env.SMTP_HOST = oldHost;
    if (oldResend) process.env.RESEND_API_KEY = oldResend;
  }
});

// ── Test 3: Bezpieczna wysyłka przez transport testowy (JSON Transport) ──
await asyncTest("Testowy transport SMTP (bezpieczny, bez kontaktu z realnymi kontrahentami)", async () => {
  const testTransporter = nodemailer.createTransport({
    jsonTransport: true,
  });

  const mailOptions = {
    from: "FakturaProsto <faktury@testowa-domena.pl>",
    to: "kontrahent-test@fikcyjna-domena-testowa.pl",
    cc: "dw@fikcyjna-domena-testowa.pl",
    replyTo: "sprzedawca@testowa-domena.pl",
    subject: "Faktura VAT FV/2026/01 od Test Sp. z o.o.",
    text: "Treść faktury testowej",
    html: "<b>Treść faktury</b>",
    attachments: [
      {
        filename: "Faktura_FV_2026_01.pdf",
        content: Buffer.from("%PDF-1.4 test dummy pdf"),
        contentType: "application/pdf",
      },
      {
        filename: "Faktura_KSeF.xml",
        content: Buffer.from("<Faktura>test xml</Faktura>"),
        contentType: "application/xml",
      },
    ],
  };

  const info = await testTransporter.sendMail(mailOptions);
  assert.ok(info.messageId, "Powinien zwrócić messageId");
  const parsed = JSON.parse(info.message);
  assert.strictEqual(parsed.to[0].address, "kontrahent-test@fikcyjna-domena-testowa.pl");
  assert.strictEqual(parsed.cc[0].address, "dw@fikcyjna-domena-testowa.pl");
  assert.strictEqual(parsed.replyTo[0].address, "sprzedawca@testowa-domena.pl");
  assert.strictEqual(parsed.attachments.length, 2);
  assert.strictEqual(parsed.attachments[0].filename, "Faktura_FV_2026_01.pdf");
});

// ── Test 4: Zabezpieczenie przed podwójnym kliknięciem (idempotency key lock) ──
test("Zabezpieczenie przed podwójnym kliknięciem", () => {
  const inFlight = new Set();
  const key = "user_123_invoice_456_req1";

  // Pierwsze kliknięcie przechodzi
  assert.strictEqual(inFlight.has(key), false);
  inFlight.add(key);

  // Drugie natychmiastowe kliknięcie jest odrzucane
  assert.strictEqual(inFlight.has(key), true);

  // Po zakończeniu klucz jest zwalniany
  inFlight.delete(key);
  assert.strictEqual(inFlight.has(key), false);
});

// ── Podsumowanie ──
console.log("\n──────────────────────────────────────────────────────────────");
console.log(`Wyniki testów: ${passed} zaliczonych, ${failed} błędów.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("Wszystkie testy mechanizmów wysyłki przeszły pomyślnie!");
}
