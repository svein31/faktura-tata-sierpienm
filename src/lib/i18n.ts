import type { Currency, InvoiceLanguage, PaymentMethod, VatRate } from "./types";

export interface InvoiceLabels {
  invoice: string;
  invoiceNo: string;
  saleDoc: string;
  purchaseDoc: string;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  seller: string;
  buyer: string;
  nip: string;
  regon: string;
  item: string;
  qty: string;
  unit: string;
  net: string;
  vatRate: string;
  vatAmount: string;
  gross: string;
  totalNet: string;
  totalVat: string;
  totalGross: string;
  toPay: string;
  paymentMethod: string;
  account: string;
  bank: string;
  currency: string;
  notes: string;
  signature: string;
  payerVatPayer: string;
  vatPayer: string;
  vatNonPayer: string;
  originals: string;
}

export const invoiceLabels: Record<InvoiceLanguage, InvoiceLabels> = {
  PL: {
    invoice: "Faktura",
    invoiceNo: "Nr faktury",
    saleDoc: "Faktura VAT",
    purchaseDoc: "Faktura zakupowa VAT",
    issueDate: "Data wystawienia",
    saleDate: "Data sprzedaży",
    dueDate: "Termin płatności",
    seller: "Sprzedawca",
    buyer: "Nabywca",
    nip: "NIP",
    regon: "REGON",
    item: "Nazwa towaru / usługi",
    qty: "Ilość",
    unit: "J.m.",
    net: "Netto",
    vatRate: "VAT",
    vatAmount: "Kwota VAT",
    gross: "Brutto",
    totalNet: "Razem netto",
    totalVat: "Razem VAT",
    totalGross: "Razem brutto",
    toPay: "Do zapłaty",
    paymentMethod: "Metoda płatności",
    account: "Nr konta",
    bank: "Bank",
    currency: "Waluta",
    notes: "Uwagi",
    signature: "Podpis osoby upoważnionej",
    payerVatPayer: "Płatnik VAT",
    vatPayer: "podatnik VAT",
    vatNonPayer: "zwolniony z VAT",
    originals: "ORYGINAŁ",
  },
  EN: {
    invoice: "Invoice",
    invoiceNo: "Invoice No.",
    saleDoc: "VAT invoice",
    purchaseDoc: "Purchase VAT invoice",
    issueDate: "Issue date",
    saleDate: "Sale date",
    dueDate: "Due date",
    seller: "Seller",
    buyer: "Buyer",
    nip: "Tax ID (NIP)",
    regon: "REGON",
    item: "Item / service",
    qty: "Qty",
    unit: "Unit",
    net: "Net",
    vatRate: "VAT",
    vatAmount: "VAT amount",
    gross: "Gross",
    totalNet: "Total net",
    totalVat: "Total VAT",
    totalGross: "Total gross",
    toPay: "To pay",
    paymentMethod: "Payment method",
    account: "Bank account",
    bank: "Bank",
    currency: "Currency",
    notes: "Notes",
    signature: "Authorised signature",
    payerVatPayer: "VAT payer",
    vatPayer: "VAT payer",
    vatNonPayer: "VAT exempt",
    originals: "ORIGINAL",
  },
};

export const paymentMethodLabels: Record<PaymentMethod, Record<InvoiceLanguage, string>> = {
  transfer: { PL: "Przelew", EN: "Bank transfer" },
  cash: { PL: "Gotówka", EN: "Cash" },
  card: { PL: "Karta płatnicza", EN: "Payment card" },
  blik: { PL: "BLIK", EN: "BLIK" },
  compensation: { PL: "Kompensata", EN: "Set-off" },
};

export function paymentMethodLabel(method: PaymentMethod, lang: InvoiceLanguage): string {
  return paymentMethodLabels[method][lang];
}

export function vatLabel(rate: VatRate, lang: InvoiceLanguage): string {
  switch (rate) {
    case "zw":
      return lang === "PL" ? "zw." : "exempt";
    case "np":
      return lang === "PL" ? "np." : "n/a";
    case "oo":
      return lang === "PL" ? "o.o." : "reverse charge";
    default:
      return `${rate}%`;
  }
}

export const currencySymbols: Record<Currency, string> = {
  PLN: "zł",
  EUR: "€",
  USD: "$",
};

export const currencyNames: Record<Currency, string> = {
  PLN: "Polski złoty (PLN)",
  EUR: "Euro (EUR)",
  USD: "Dolar amerykański (USD)",
};
