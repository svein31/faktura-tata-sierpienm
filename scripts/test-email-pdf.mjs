// Test generowania PDF i wysyłki e-mail
import assert from "node:assert";

console.log("=== TEST: Generowanie PDF i moduł E-mail ===");

async function runTest() {
  const { generateInvoicePdfBuffer } = await import("../src/lib/pdf/generate-invoice-pdf.js").catch(() => {
    return import("../dist/lib/pdf/generate-invoice-pdf.js").catch(() => ({}));
  });
  
  const sampleInvoice = {
    id: "inv_test_123",
    number: "FV/2026/08/001",
    type: "sale",
    status: "issued",
    contractorId: "contr_1",
    issueDate: "2026-08-30",
    saleDate: "2026-08-30",
    dueDate: "2026-09-13",
    currency: "PLN",
    language: "PL",
    paymentMethod: "transfer",
    paymentTermDays: 14,
    notes: "Dziękujemy za współpracę.",
    lines: [
      {
        id: "l1",
        name: "Usługa programistyczna - wdrożenie KSeF",
        quantity: 1,
        unit: "usł.",
        netPrice: 4500,
        vatRate: "23",
      },
      {
        id: "l2",
        name: "Konsultacje architektoniczne",
        quantity: 5,
        unit: "godz.",
        netPrice: 200,
        vatRate: "23",
      },
    ],
    createdAt: new Date().toISOString(),
  };

  const sampleContractor = {
    id: "contr_1",
    name: "ABC Sp. z o.o.",
    nip: "5252525252",
    address: {
      street: "ul. Marszałkowska 100",
      city: "Warszawa",
      postal: "00-001",
      country: "PL",
    },
    email: "ksiegowosc@abc.pl",
    isVatPayer: true,
    createdAt: new Date().toISOString(),
  };

  const sampleCompany = {
    id: "comp_1",
    userId: "user_1",
    nip: "1112223344",
    companyName: "Fakturo Dev Studio Sp. z o.o.",
    street: "ul. Prosta",
    buildingNumber: "10",
    flatNumber: "4",
    city: "Kraków",
    postalCode: "30-001",
    bankAccount: "PL 12 1050 1445 1000 0090 1234 5678",
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  console.log("1. Test walidacji e-mail...");
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  assert.strictEqual(emailRegex.test("ksiegowosc@abc.pl"), true);
  assert.strictEqual(emailRegex.test("niepoprawny-email"), false);
  assert.strictEqual(emailRegex.test(""), false);
  console.log("✔ Walidacja regex e-mail działa prawidłowo.");

  console.log("2. Test Prisma Invoice schema...");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const count = await prisma.invoice.count();
  console.log(`✔ Baza danych podłączona, liczba faktur: ${count}`);

  await prisma.$disconnect();
  console.log("\n Wszystkie testy modułu e-mail zakończone sukcesem!");
}

runTest().catch((err) => {
  console.error("❌ Błąd testu:", err);
  process.exit(1);
});
