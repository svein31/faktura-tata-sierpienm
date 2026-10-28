/**
 * Generowanie XML w oficjalnym formacie KSeF FA(3) oraz eksport JSON faktury.
 */

import { formatDate } from "./format";
import { invoiceLabels } from "./i18n";
import type { CompanyProfile, Invoice } from "./types";
import { invoiceTotals, lineGross, lineNet, lineVat } from "./format";
import { buildFa3Xml } from "./ksef/xmlBuilder";

export function buildFaVatXml(invoice: Invoice, company: CompanyProfile): string {
  return buildFa3Xml({
    invoice,
    seller: company,
  });
}

export function invoiceToJson(invoice: Invoice, company: CompanyProfile): string {
  const t = invoiceTotals(invoice);
  const payload = {
    meta: {
      app: "FakturaProsto",
      version: "2.0.0",
      schema: "FA(3)",
      exportDate: new Date().toISOString(),
    },
    invoice: {
      number: invoice.number,
      type: invoice.type,
      status: invoice.status,
      currency: invoice.currency,
      language: invoice.language,
      issueDate: invoice.issueDate,
      saleDate: invoice.saleDate,
      dueDate: invoice.dueDate,
      paymentMethod: invoice.paymentMethod,
      paymentTermDays: invoice.paymentTermDays,
      notes: invoice.notes ?? null,
      ksef: invoice.ksef ?? null,
      totals: { net: t.net, vat: t.vat, gross: t.gross },
      seller: {
        name: company.companyName || company.name,
        nip: company.nip,
        regon: company.regon || "",
        address: {
          street: company.street || "",
          buildingNumber: company.buildingNumber || "",
          flatNumber: company.flatNumber || "",
          city: company.city || "",
          postal: company.postalCode || company.postal || "",
          country: company.country || "PL",
        },
        iban: invoice.bankAccountSnapshot?.accountNumber ?? company.bankAccount ?? company.iban ?? "",
        bankName: invoice.bankAccountSnapshot?.bankName ?? company.bankName ?? "",
      },
      contractorId: invoice.contractorId,
      recipient: invoice.recipient ?? null,
      lines: invoice.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        netPrice: l.netPrice,
        vatRate: l.vatRate,
        net: lineNet(l),
        vat: lineVat(l),
        gross: lineGross(l),
      })),
      labels: invoiceLabels[invoice.language],
    },
  };
  return JSON.stringify(payload, null, 2);
}

export { formatDate };
