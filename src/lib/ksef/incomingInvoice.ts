import type { InvoiceLine, PaymentMethod, VatRate } from "@/lib/types";

const PAYMENT_METHODS: Record<string, PaymentMethod> = {
  "1": "cash",
  "2": "card",
  "6": "transfer",
  "7": "blik",
  "8": "compensation",
};

export interface ParsedIncomingInvoice {
  number: string;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentTermDays: number;
  seller: {
    nip: string;
    name: string;
    address: {
      street: string;
      city: string;
      postal: string;
      country: string;
    };
  };
  lines: InvoiceLine[];
  totalNet: number;
  totalVat: number;
  totalGross: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tagPattern(tag: string, global = false): RegExp {
  const name = escapeRegex(tag);
  return new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${name}\\s*>`,
    global ? "gi" : "i"
  );
}

function value(xml: string, tag: string): string {
  const match = tagPattern(tag).exec(xml);
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "")) : "";
}

function section(xml: string, tag: string): string {
  return tagPattern(tag).exec(xml)?.[1] ?? "";
}

function valuesMatching(xml: string, tagName: RegExp): number[] {
  const result: number[] = [];
  const tags = xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([^<]*)<\/(?:[A-Za-z_][\w.-]*:)?\1\s*>/gi);
  for (const match of tags) {
    if (!tagName.test(match[1])) continue;
    const parsed = amount(decodeXml(match[2]));
    if (Number.isFinite(parsed)) result.push(parsed);
  }
  return result;
}

function amount(raw: string): number {
  const parsed = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(number: number): number {
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function isoDate(raw: string): string {
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? "";
}

function vatRate(raw: string): VatRate {
  const normalized = raw.trim().toLowerCase().replace("%", "");
  if (["23", "8", "5", "0", "zw", "np", "oo"].includes(normalized)) {
    return normalized as VatRate;
  }
  return "0";
}

function parseAddress(podmiot: string) {
  const address = section(podmiot, "Adres");
  const line1 = value(address, "AdresL1");
  const line2 = value(address, "AdresL2");
  const postalMatch = line2.match(/\b\d{2}-\d{3}\b/);
  const postal = postalMatch?.[0] ?? "";
  const city = postalMatch ? line2.slice((postalMatch.index ?? 0) + postal.length).replace(/^\s+/, "") : line2;

  return {
    street: line1,
    city,
    postal,
    country: value(address, "KodKraju") || "PL",
  };
}

function parseLines(fa: string, reference: string): InvoiceLine[] {
  return Array.from(fa.matchAll(tagPattern("FaWiersz", true))).map((match, index) => {
    const row = match[1];
    const quantity = amount(value(row, "P_8B")) || 1;
    const explicitUnitPrice = amount(value(row, "P_9A"));
    const rowNet = amount(value(row, "P_11"));

    return {
      id: `ksef_${reference}_${value(row, "NrWierszaFa") || index + 1}`,
      name: value(row, "P_7"),
      quantity,
      unit: value(row, "P_8A") || "szt.",
      netPrice: explicitUnitPrice || round2(rowNet / quantity),
      vatRate: vatRate(value(row, "P_12")),
    };
  });
}

export function parseFa3IncomingInvoice(xml: string, ksefReferenceNumber: string): ParsedIncomingInvoice {
  if (!/<(?:[A-Za-z_][\w.-]*:)?Faktura(?:\s|>)/i.test(xml)) {
    throw new Error("Pobrany dokument nie jest fakturą XML FA(3).");
  }

  const seller = section(xml, "Podmiot1");
  const sellerIdentity = section(seller, "DaneIdentyfikacyjne");
  const fa = section(xml, "Fa");
  const number = value(fa, "P_2");
  const issueDate = isoDate(value(fa, "P_1"));
  const sellerNip = value(sellerIdentity, "NIP").replace(/\D/g, "");
  const sellerName = value(sellerIdentity, "Nazwa");

  if (!number || !issueDate || !sellerNip || !sellerName) {
    throw new Error(`Faktura ${ksefReferenceNumber} nie zawiera wymaganych danych FA(3).`);
  }

  const payment = section(fa, "Platnosc");
  const dueDate = isoDate(value(payment, "Termin")) || issueDate;
  const saleDate = isoDate(value(fa, "P_6")) || issueDate;
  const totalNet = round2(valuesMatching(fa, /^P_13(?:_\d+)?$/i).reduce((sum, item) => sum + item, 0));
  const totalVat = round2(valuesMatching(fa, /^P_14(?:_\d+)?$/i).reduce((sum, item) => sum + item, 0));
  const declaredGross = amount(value(fa, "P_15"));
  const lines = parseLines(fa, ksefReferenceNumber);
  const paymentTermDays = Math.max(
    0,
    Math.round((new Date(`${dueDate}T00:00:00Z`).getTime() - new Date(`${issueDate}T00:00:00Z`).getTime()) / 86_400_000)
  );

  return {
    number,
    issueDate,
    saleDate,
    dueDate,
    currency: value(fa, "KodWaluty") || "PLN",
    paymentMethod: PAYMENT_METHODS[value(payment, "FormaPlatnosci")] || "transfer",
    paymentTermDays,
    seller: {
      nip: sellerNip,
      name: sellerName,
      address: parseAddress(seller),
    },
    lines,
    totalNet,
    totalVat,
    totalGross: declaredGross || round2(totalNet + totalVat),
  };
}
