/**
 * Mapowanie rekordów Prisma → DTO używane przez frontend.
 * JSON-owe pola (address, lines, ksef) są rzutowane na typy aplikacji.
 */

import type {
  CompanyProfile as DbCompanyProfile,
  CompanySettings,
  Contractor as DbContractor,
  Invoice as DbInvoice,
  KsefSettings as DbKsef,
  Notification as DbNotification,
  NotificationPreference,
  Product as DbProduct,
} from "@prisma/client";
import type {
  Address,
  AppNotification,
  CompanyProfile,
  Contractor,
  Invoice,
  KsefInfo,
  KsefSettings,
  NotificationPrefs,
  Product,
} from "./types";

export function addressFrom(v: unknown): Address {
  const a = (v ?? {}) as Partial<Address>;
  return {
    street: typeof a.street === "string" ? a.street : "",
    city: typeof a.city === "string" ? a.city : "",
    postal: typeof a.postal === "string" ? a.postal : "",
    country: typeof a.country === "string" ? a.country : "PL",
  };
}

export function companyProfileToDto(cp: DbCompanyProfile): CompanyProfile {
  return {
    id: cp.id,
    userId: cp.userId,
    nip: cp.nip,
    companyName: cp.companyName,
    street: cp.street ?? "",
    buildingNumber: cp.buildingNumber ?? "",
    flatNumber: cp.flatNumber ?? "",
    city: cp.city ?? "",
    postalCode: cp.postalCode ?? "",
    bankAccount: cp.bankAccount ?? "",
    ksefToken: cp.ksefToken ?? null,
    isDefault: cp.isDefault,
    createdAt: cp.createdAt.toISOString(),
    updatedAt: cp.updatedAt.toISOString(),

    // Aliasy / wsteczna kompatybilność
    name: cp.companyName,
    postal: cp.postalCode ?? "",
    country: "PL",
    iban: cp.bankAccount ?? "",
    bankName: "",
    email: "",
    phone: "",
    regon: "",
  };
}

export function companyToDto(c: CompanySettings): CompanyProfile {
  return {
    id: c.id,
    userId: c.userId,
    nip: c.nip,
    companyName: c.name,
    street: c.street,
    buildingNumber: "",
    flatNumber: "",
    city: c.city,
    postalCode: c.postal,
    bankAccount: c.iban,
    ksefToken: null,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: c.updatedAt.toISOString(),

    name: c.name,
    regon: c.regon,
    postal: c.postal,
    country: c.country,
    iban: c.iban,
    bankName: c.bankName,
    email: c.email,
    phone: c.phone,
  };
}

export function ksefToDto(k: DbKsef): KsefSettings {
  return {
    environment: (["demo", "test", "production"].includes(k.environment) ? k.environment : "demo") as KsefSettings["environment"],
    tokenSet: k.tokenSet,
    tokenMask: k.tokenMask,
    certName: k.certName,
    autoValidate: k.autoValidate,
  };
}

export function contractorToDto(c: DbContractor): Contractor {
  return {
    id: c.id,
    name: c.name,
    nip: c.nip,
    regon: c.regon ?? undefined,
    address: addressFrom(c.address),
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
    iban: c.iban ?? undefined,
    bankName: c.bankName ?? undefined,
    isVatPayer: c.isVatPayer,
    notes: c.notes ?? undefined,
    createdAt: c.createdAt.toISOString(),
  };
}

export function productToDto(p: DbProduct): Product {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku ?? undefined,
    unit: p.unit,
    netPrice: p.netPrice,
    vatRate: p.vatRate as Product["vatRate"],
    description: p.description ?? undefined,
  };
}

export function ksefInfoFrom(v: unknown): KsefInfo | undefined {
  if (!v || typeof v !== "object") return undefined;
  const k = v as Partial<KsefInfo>;
  if (!k.number) return undefined;
  return {
    number: k.number,
    status: k.status ?? "SENT",
    sentAt: k.sentAt ?? new Date().toISOString(),
    environment: k.environment ?? "demo",
  };
}

export function invoiceToDto(i: DbInvoice & { sellerCompany?: DbCompanyProfile | null }): Invoice {
  return {
    id: i.id,
    number: i.number,
    type: (i.type === "purchase" ? "purchase" : "sale") as Invoice["type"],
    status: i.status as Invoice["status"],
    contractorId: i.contractorId,
    sellerCompanyId: i.sellerCompanyId ?? undefined,
    sellerCompany: i.sellerCompany ? companyProfileToDto(i.sellerCompany) : undefined,
    issueDate: i.issueDate,
    saleDate: i.saleDate,
    dueDate: i.dueDate,
    currency: i.currency as Invoice["currency"],
    language: (i.language === "EN" ? "EN" : "PL") as Invoice["language"],
    paymentMethod: i.paymentMethod as Invoice["paymentMethod"],
    paymentTermDays: i.paymentTermDays,
    notes: i.notes ?? undefined,
    lines: (Array.isArray(i.lines) ? i.lines : []) as unknown as Invoice["lines"],
    totalNet: i.totalNet ?? undefined,
    totalVat: i.totalVat ?? undefined,
    totalGross: i.totalGross ?? undefined,
    ksef: ksefInfoFrom(i.ksef),
    sentAt: i.sentAt ? i.sentAt.toISOString() : null,
    sentToEmail: i.sentToEmail ?? null,
    emailStatus: i.emailStatus ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

export function notificationToDto(n: DbNotification): AppNotification {
  return {
    id: n.id,
    kind: n.kind as AppNotification["kind"],
    title: n.title,
    body: n.body ?? undefined,
    link: n.link ?? undefined,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

export function prefsToDto(p: NotificationPreference | null): NotificationPrefs {
  return {
    browserEnabled: p?.browserEnabled ?? false,
    soundEnabled: p?.soundEnabled ?? true,
  };
}
