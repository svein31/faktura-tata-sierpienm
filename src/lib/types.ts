export type VatRate = "23" | "8" | "5" | "0" | "zw" | "np" | "oo";
export type Currency = "PLN" | "EUR" | "USD";
export type InvoiceLanguage = "PL" | "EN";
export type InvoiceType = "sale" | "purchase";
export type PaymentMethod = "transfer" | "cash" | "card" | "blik" | "compensation";
export type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "ksef_sent" | "ksef_active";
export type KsefEnv = "demo" | "test" | "production";

export interface Address {
  street: string;
  city: string;
  postal: string;
  country: string;
}

export interface CompanyProfile {
  id: string;
  userId: string;
  nip: string;
  companyName: string;
  street?: string | null;
  buildingNumber?: string | null;
  flatNumber?: string | null;
  city?: string | null;
  postalCode?: string | null;
  bankAccount?: string | null;
  ksefToken?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;

  // Aliasy / kompatybilność
  name?: string;
  postal?: string;
  country?: string;
  iban?: string;
  bankName?: string;
  email?: string;
  phone?: string;
  regon?: string;
}

export interface Contractor {
  id: string;
  name: string;
  nip: string;
  regon?: string;
  address: Address;
  email?: string;
  phone?: string;
  iban?: string;
  bankName?: string;
  isVatPayer: boolean;
  notes?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  unit: string;
  netPrice: number;
  vatRate: VatRate;
  description?: string;
}

export interface InvoiceLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  netPrice: number;
  vatRate: VatRate;
}

export interface KsefInfo {
  number: string;
  referenceNumber?: string;
  sessionReferenceNumber?: string;
  status: "QUEUED" | "SENT" | "ACTIVE" | "REJECTED";
  sentAt: string;
  environment: KsefEnv;
  processingCode?: number;
  processingDescription?: string;
}

export interface Invoice {
  id: string;
  number: string;
  type: InvoiceType;
  status: InvoiceStatus;
  contractorId: string;
  sellerCompanyId?: string | null;
  sellerCompany?: CompanyProfile | null;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  currency: Currency;
  language: InvoiceLanguage;
  paymentMethod: PaymentMethod;
  paymentTermDays: number;
  notes?: string;
  lines: InvoiceLine[];
  totalNet?: number;
  totalVat?: number;
  totalGross?: number;
  ksef?: KsefInfo;
  ksefNumber?: string | null;
  referenceNumber?: string | null;
  upoXml?: string | null;
  ksefXml?: string | null;
  sentAt?: string | null;
  sentToEmail?: string | null;
  emailStatus?: string | null;
  createdAt: string;
}

export interface KsefSettings {
  environment: KsefEnv;
  /** Pełny token NIGDY nie jest zwracany przez API — tylko flaga i maska. */
  tokenSet: boolean;
  tokenMask: string;
  certName: string;
  autoValidate: boolean;
}

export interface NipLookupResult {
  source: "demo" | "gus";
  demo: boolean;
  company?: {
    name: string;
    nip: string;
    regon: string;
    address: Address;
    isVatPayer: boolean;
  };
  error?: "NOT_FOUND" | "INVALID_NIP" | "UNREACHABLE";
  message?: string;
}

export interface Fa2Issue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface Fa2ValidationResult {
  ok: boolean;
  issues: Fa2Issue[];
}

export interface KsefSendResult {
  success: boolean;
  demo: boolean;
  ksefNumber?: string;
  status?: "QUEUED" | "SENT" | "ACTIVE" | "REJECTED";
  timestamp?: string;
  message: string;
}

/* ── Powiadomienia ──────────────────────────────────────────────────────── */

export type NotificationKind = "invoice_purchase" | "ksef_status" | "test" | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPrefs {
  browserEnabled: boolean;
  soundEnabled: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

/** Fallback dla podglądów/eksportów, gdy nowy użytkownik nie uzupełnił jeszcze profilu firmy. */
export const EMPTY_COMPANY: CompanyProfile = {
  id: "",
  userId: "",
  nip: "",
  companyName: "",
  street: "",
  buildingNumber: "",
  flatNumber: "",
  city: "",
  postalCode: "",
  bankAccount: "",
  ksefToken: null,
  isDefault: false,
  createdAt: "",
  updatedAt: "",
  name: "",
  regon: "",
  postal: "",
  country: "PL",
  iban: "",
  bankName: "",
  email: "",
  phone: "",
};
