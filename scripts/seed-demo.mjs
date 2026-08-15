#!/usr/bin/env node
/**
 * OPCJONALNY seed — wyłącznie jedno konto demo (demo@fakturo.app).
 *
 * NIE uruchamia się automatycznie przy starcie aplikacji. Wywołanie:
 *   npm run seed:demo
 *
 * Tworzy użytkownika demo z przykładowymi danymi (firma, KSeF, kontrahenci,
 * produkty, faktury). Nowi użytkownicy rejestrujący się przez /register
 * ZAWSZE dostają puste dane — ten skrypt nie ma z tym nic wspólnego.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "demo@fakturo.app";
const PASSWORD = "demo1234";
const NAME = "Demo Użytkownik";

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log(`Konto demo już istnieje (${EMAIL}). Pomijam (usuń użytkownika, aby odtworzyć).`);
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash,
      name: NAME,
      company: {
        create: {
          name: "Fakturowa Sp. z o.o.",
          nip: "5260301706",
          regon: "366173147",
          street: "ul. Testowa 10",
          postal: "00-950",
          city: "Warszawa",
          country: "PL",
          iban: "PL61 1090 1014 0000 0712 1981 2874",
          bankName: "Bank Demo SA",
          email: "biuro@fakturowa.example",
          phone: "+48 22 000 00 00",
        },
      },
      ksef: { create: { environment: "demo" } },
      preferences: { create: { browserEnabled: false, soundEnabled: true } },
    },
  });

  const contractor = await prisma.contractor.create({
    data: {
      userId: user.id,
      name: "DemoIT Solutions Sp. z o.o.",
      nip: "5270000024",
      regon: "146981234",
      address: { street: "ul. Przykładowa 1", city: "Warszawa", postal: "00-001", country: "PL" },
      email: "kontakt@demoit.example",
      iban: "PL61 1090 1014 0000 0712 1981 2875",
      bankName: "Bank Demo SA",
      isVatPayer: true,
    },
  });

  const product = await prisma.product.create({
    data: {
      userId: user.id,
      name: "Usługa programistyczna (osobodzień)",
      sku: "SVC-DEV",
      unit: "md",
      netPrice: 1200,
      vatRate: "23",
    },
  });

  const today = daysAgo(0);
  const invoice = await prisma.invoice.create({
    data: {
      userId: user.id,
      number: `FV/${new Date().getFullYear()}/0001`,
      type: "sale",
      status: "ksef_sent",
      contractorId: contractor.id,
      issueDate: today,
      saleDate: today,
      dueDate: daysAgo(-14),
      currency: "PLN",
      language: "PL",
      paymentMethod: "transfer",
      paymentTermDays: 14,
      lines: [
        { id: "ln_demo1", name: product.name, quantity: 2, unit: "md", netPrice: 1200, vatRate: "23" },
      ],
      ksef: {
        number: `eFA/DEMO/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}/0000-DEMO`,
        status: "ACTIVE",
        sentAt: new Date().toISOString(),
        environment: "demo",
      },
    },
  });

  await prisma.notification.create({
    data: {
      userId: user.id,
      kind: "ksef_status",
      title: `Faktura ${invoice.number} wysłana do KSeF (demo)`,
      body: `Numer KSeF: ${invoice.ksef.number}`,
      link: `/invoices/${invoice.id}`,
      read: false,
    },
  });

  console.log(`✔ Utworzono konto demo: ${EMAIL} / ${PASSWORD}`);
  console.log(`  Firma: Fakturowa Sp. z o.o. · kontrahent: ${contractor.name}`);
  console.log(`  Faktura: ${invoice.number} · powiadomienie: 1 nieprzeczytane`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
