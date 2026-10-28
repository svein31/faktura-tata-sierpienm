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
  recipient: string;
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
    recipient: "Odbiorca",
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
    recipient: "Recipient",
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
  "PL/EN": {
    invoice: "Faktura / Invoice",
    invoiceNo: "Nr faktury / Invoice No.",
    saleDoc: "Faktura VAT / VAT Invoice",
    purchaseDoc: "Faktura zakupowa VAT / Purchase VAT Invoice",
    issueDate: "Data wystawienia / Date of issue",
    saleDate: "Data sprzedaży / Date of sale",
    dueDate: "Termin płatności / Payment due",
    seller: "Sprzedawca / Seller",
    buyer: "Nabywca / Buyer",
    recipient: "Odbiorca / Recipient",
    nip: "NIP / Tax ID",
    regon: "REGON",
    item: "Nazwa towaru lub usługi / Description of goods or services",
    qty: "Ilość / Qty",
    unit: "J.m. / Unit",
    net: "Cena netto / Net price",
    vatRate: "Stawka VAT / VAT rate",
    vatAmount: "Kwota VAT / VAT amount",
    gross: "Wartość brutto / Gross amount",
    totalNet: "Razem netto / Total net",
    totalVat: "Razem VAT / Total VAT",
    totalGross: "Razem brutto / Total gross",
    toPay: "Do zapłaty / Total due",
    paymentMethod: "Sposób płatności / Payment method",
    account: "Nr konta / Bank account",
    bank: "Bank / Bank",
    currency: "Waluta / Currency",
    notes: "Uwagi / Notes",
    signature: "Podpis / Authorised signature",
    payerVatPayer: "Płatnik VAT / VAT Payer",
    vatPayer: "podatnik VAT / VAT payer",
    vatNonPayer: "zwolniony z VAT / VAT exempt",
    originals: "ORYGINAŁ / ORIGINAL",
  },
};

export const paymentMethodLabels: Record<PaymentMethod, Record<InvoiceLanguage, string>> = {
  transfer: { PL: "Przelew", EN: "Bank transfer", "PL/EN": "Przelew / Bank transfer" },
  cash: { PL: "Gotówka", EN: "Cash", "PL/EN": "Gotówka / Cash" },
  card: { PL: "Karta płatnicza", EN: "Payment card", "PL/EN": "Karta / Payment card" },
  blik: { PL: "BLIK", EN: "BLIK", "PL/EN": "BLIK" },
  compensation: { PL: "Kompensata", EN: "Set-off", "PL/EN": "Kompensata / Set-off" },
};

export function paymentMethodLabel(method: PaymentMethod, lang: InvoiceLanguage = "PL"): string {
  const dict = paymentMethodLabels[method] || paymentMethodLabels.transfer;
  return dict[lang] || dict.PL;
}

export function vatLabel(rate: VatRate, lang: InvoiceLanguage = "PL"): string {
  switch (rate) {
    case "zw":
      if (lang === "PL/EN") return "zw. / exempt";
      return lang === "EN" ? "exempt" : "zw.";
    case "np":
      if (lang === "PL/EN") return "np. / out of scope";
      return lang === "EN" ? "out of scope" : "np.";
    case "oo":
      if (lang === "PL/EN") return "odwr. obciążenie / reverse charge";
      return lang === "EN" ? "reverse charge" : "odwrotne obciążenie";
    default:
      return `${rate}%`;
  }
}

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  PLN: "zł",
  EUR: "€",
  USD: "$",
  GBP: "£",
};

export function currencySymbol(c: Currency): string {
  return CURRENCY_SYMBOLS[c] ?? c;
}

export const currencyNames: Record<Currency, string> = {
  PLN: "polski złoty (PLN)",
  EUR: "euro (EUR)",
  USD: "dolar amerykański (USD)",
  GBP: "funt brytyjski (GBP)",
};
