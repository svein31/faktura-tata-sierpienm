export type VatRate = "23" | "8" | "5" | "0" | "zw" | "np" | "oo";
export type Currency = "PLN" | "EUR" | "USD" | "GBP" | string;
export type InvoiceLanguage = "PL" | "EN" | "PL/EN";
export type InvoiceType = "sale" | "purchase";
export type PaymentMethod = "transfer" | "cash" | "card" | "blik" | "compensation";
export type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "ksef_sent" | "ksef_active";
export type DocumentStatus = "draft" | "ready" | "issued" | "cancelled";
export type KsefStatus = "none" | "draft" | "ready" | "queued" | "sending" | "accepted" | "rejected" | "verify_needed";
export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "overdue";
export type UserRole = "owner" | "accountant" | "employee" | "viewer";
export type CompanyRole = "owner" | "accountant" | "employee" | "viewer";
export type TaxIdType = "nip" | "vat_eu" | "tin" | "other" | "none";
export type ExchangeRateRule = "art_31a_sale_date" | "art_31a_issue_date" | "art_31a_tax_point" | "manual";
export type KsefEnv = "demo" | "test" | "production";

export interface CompanyPermissions {
  canIssueInvoices: boolean;
  canCreateCorrections: boolean;
  canRecordPayments: boolean;
  canExport: boolean;
  canSendKsef: boolean;
  canManageBankAccounts: boolean;
  canManageTeam: boolean;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  role: CompanyRole;
  canIssueInvoices: boolean;
  canCreateCorrections: boolean;
  canRecordPayments: boolean;
  canExport: boolean;
  canSendKsef: boolean;
  canManageBankAccounts: boolean;
  canManageTeam: boolean;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    name?: string | null;
  };
  company?: CompanyProfile;
}

export interface CompanyBankAccount {
  id: string;
  companyId: string;
  accountName: string;
  beneficiaryName: string;
  currency: string;
  isMultiCurrency: boolean;
  accountNumber: string;
  swiftBic?: string | null;
  bankName: string;
  bankAddress?: string | null;
  transferInstructions?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamInvitation {
  id: string;
  companyId?: string | null;
  userId: string;
  email: string;
  role: CompanyRole;
  permissions?: Partial<CompanyPermissions> | null;
  token: string;
  expiresAt: string;
  acceptedAt?: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  companyName?: string;
  invitedByName?: string;
}

export interface AuditLogEntry {
  id: string;
  companyId?: string | null;
  documentId?: string | null;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  description?: string | null;
  diff?: Record<string, { old: any; new: any; label?: string }> | null;
  details?: any;
  createdAt: string;
}

export interface PaymentItem {
  id: string;
  amount: number;
  paidAt: string;
  method: PaymentMethod;
  note?: string;
}

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
  ksefTokenSet?: boolean;
  isDefault: boolean;
  logoUrl?: string | null;
  createdAt: string;
  updatedAt: string;

  // Uprawnienia bieżącego użytkownika w tej firmie (jeśli zapytanie zwraca kontekst)
  currentUserRole?: CompanyRole;
  currentUserPermissions?: CompanyPermissions;
  bankAccounts?: CompanyBankAccount[];

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

export interface ContractorContact {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
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
  tags?: string[];
  defaultCurrency?: Currency;
  defaultPaymentTermDays?: number;
  defaultDiscountPercent?: number;
  contacts?: ContractorContact[];
  vatStatus?: "czynny" | "zwolniony" | "nieznany" | string;
  vatCheckedAt?: string;
  vatCheckSource?: string;
  // Kontrahenci zagraniczni
  taxIdType?: TaxIdType;
  taxId?: string;
  country?: string;
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
  approvalStatus?: "pending" | "approved" | string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  // Rozszerzony cykl życia
  documentStatus?: DocumentStatus;
  ksefStatus?: KsefStatus;
  paymentStatus?: PaymentStatus;
  paidAmount?: number;
  payments?: PaymentItem[];
  version?: number;
  // Korekty (KOR)
  isCorrection?: boolean;
  correctionReason?: string;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  originalKsefNumber?: string;
  originalIssueDate?: string;
  originalLines?: InvoiceLine[];
  // Tryby offline i kody QR
  isOffline?: boolean;
  offlineReason?: string;
  offlineDeadline?: string;
  qrCodeI?: string;
  qrCodeII?: string;
  // Faktury cykliczne
  isRecurring?: boolean;
  recurringInterval?: string;
  recurringNextDate?: string;
  recurringPaused?: boolean;
  recurringAutoSend?: boolean;
  // Przypomnienia
  lastPaymentReminderSentAt?: string;
  paymentReminderCount?: number;
  // Portal Kontrahenta & Proforma
  shareToken?: string;
  isProforma?: boolean;
  declaredPaymentDate?: string;
  autoSendEmailOnKsef?: boolean;
  emailLogs?: InvoiceEmailLog[];
  // Pola walutowe i NBP
  exchangeRate?: number | null;
  exchangeRateUnit?: number | null;
  exchangeRateDate?: string | null;
  exchangeRateTable?: string | null;
  exchangeRateSource?: string | null;
  exchangeRateRule?: ExchangeRateRule | null;
  exchangeRateJustification?: string | null;
  taxPointDate?: string | null;
  totalNetPln?: number | null;
  totalVatPln?: number | null;
  totalGrossPln?: number | null;
  bankAccountId?: string | null;
  bankAccountSnapshot?: Partial<CompanyBankAccount> | null;
  buyerTaxIdType?: TaxIdType | null;
  buyerCountry?: string | null;
  createdAt: string;
}

export interface InvoiceEmailLog {
  id: string;
  invoiceId: string;
  userId: string;
  to: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  messageBody?: string | null;
  attachments?: Array<{ filename: string; size?: number; contentType?: string }>;
  status: "queued" | "accepted" | "sent" | "delivered" | "failed";
  provider: "smtp" | "resend" | "simulated";
  messageId?: string | null;
  error?: string | null;
  sentAt: string;
  userName?: string | null;
}

export interface OfferLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  netPrice: number;
  vatRate: VatRate;
  description?: string;
}

export interface Offer {
  id: string;
  number: string;
  contractorId?: string | null;
  contractorName: string;
  contractorNip?: string | null;
  title: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";
  issueDate: string;
  validUntil: string;
  currency: Currency;
  lines: OfferLine[];
  totalNet: number;
  totalVat: number;
  totalGross: number;
  notes?: string | null;
  publicToken: string;
  version: number;
  acceptedAt?: string | null;
  rejectionReason?: string | null;
  convertedOrderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStage {
  id: string;
  name: string;
  amount: number;
  status: "pending" | "in_progress" | "completed" | "billed";
  dueDate?: string;
  billedInvoiceId?: string;
}

export interface Order {
  id: string;
  number: string;
  offerId?: string | null;
  contractorId?: string | null;
  contractorName: string;
  title: string;
  status: "in_progress" | "completed" | "billed" | "cancelled";
  stages?: OrderStage[];
  hourlyRate?: number;
  trackedMinutes?: number;
  totalNet: number;
  totalGross: number;
  currency: Currency;
  notes?: string | null;
  billedInvoiceId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  number: string;
  contractorName: string;
  nip?: string | null;
  issueDate: string;
  dueDate?: string | null;
  category: "biuro" | "sprzęt" | "paliwo" | "oprogramowanie" | "marketing" | "usługi" | "podatki" | "inne" | string;
  description?: string | null;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  currency: Currency;
  paymentStatus: "unpaid" | "paid";
  paidAt?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  workflowStatus: "to_verify" | "verified" | "sent_to_accountant";
  isKsefSource: boolean;
  ksefRefNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankStatementTransaction {
  id: string;
  date: string;
  amount: number;
  title: string;
  senderName: string;
  senderAccount?: string;
  matchedInvoiceId?: string;
  matchedInvoiceNumber?: string;
  matchedContractorName?: string;
  confidence: "exact" | "high" | "low" | "none";
}

export interface DocumentCommentItem {
  id: string;
  authorName: string;
  authorRole: "owner" | "accountant" | "employee" | "client";
  docType: "invoice" | "offer" | "expense";
  docId: string;
  message: string;
  createdAt: string;
}

export interface TeamMemberInvitation {
  id: string;
  email: string;
  role: "accountant" | "employee" | "viewer";
  token: string;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
}

export interface KsefSettings {
  environment: KsefEnv;
  /** Pełny token NIGDY nie jest zwracany przez API — tylko flaga i maska. */
  tokenSet: boolean;
  tokenMask: string;
  certName: string;
  autoValidate: boolean;
  autoSyncEnabled?: boolean;
  autoSyncIntervalHours?: number;
  autoSyncNotifyEmail?: string;
  lastAutoSyncAt?: string | null;
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
  role?: "owner" | "accountant" | "viewer" | string;
  nip?: string | null;
  companyName?: string | null;
  termsAcceptedAt?: string | null;
  termsAcceptedVersion?: string | null;
  company?: {
    name: string;
    nip: string;
    regon: string;
    street: string;
    city: string;
    postal: string;
    country: string;
    iban: string;
    bankName: string;
    email: string;
    phone: string;
  } | null;
  ksef?: {
    environment: string;
    tokenSet: boolean;
    tokenMask: string;
    certName: string;
    autoValidate: boolean;
  } | null;
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
