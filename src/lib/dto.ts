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
  Offer as DbOffer,
  Order as DbOrder,
  Expense as DbExpense,
  DocumentComment as DbDocumentComment,
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
  Offer,
  Order,
  Expense,
  DocumentCommentItem,
  InvoiceEmailLog,
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
    ksefToken: null,
    ksefTokenSet: Boolean(cp.ksefToken),
    isDefault: cp.isDefault,
    logoUrl: cp.logoUrl ?? "",
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
    logoUrl: c.logoUrl ?? "",
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
    autoSyncEnabled: k.autoSyncEnabled,
    autoSyncIntervalHours: k.autoSyncIntervalHours,
    autoSyncNotifyEmail: k.autoSyncNotifyEmail ?? "",
    lastAutoSyncAt: k.lastAutoSyncAt ? k.lastAutoSyncAt.toISOString() : null,
  };
}

export function contractorToDto(c: DbContractor): Contractor {
  return {
    companyId: c.companyId,
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
    tags: c.tags ?? [],
    defaultCurrency: (c.defaultCurrency as any) || "PLN",
    defaultPaymentTermDays: c.defaultPaymentTermDays ?? 14,
    defaultDiscountPercent: c.defaultDiscountPercent ?? 0,
    contacts: (Array.isArray(c.contacts) ? c.contacts : undefined) as any,
    vatStatus: c.vatStatus ?? undefined,
    vatCheckedAt: c.vatCheckedAt ? c.vatCheckedAt.toISOString() : undefined,
    vatCheckSource: c.vatCheckSource ?? undefined,
    taxIdType: (c.taxIdType as any) || "nip",
    taxId: c.taxId || c.nip,
    country: c.country || "PL",
    // CRM 360° — limit kupiecki, cennik i scoring terminowości
    creditLimit: c.creditLimit ?? 0,
    creditLimitCurrency: (c.creditLimitCurrency as any) || "PLN",
    creditLimitBlocking: c.creditLimitBlocking ?? false,
    priceListItems: (Array.isArray(c.priceListItems) ? c.priceListItems : undefined) as any,
    priceListValidFrom: c.priceListValidFrom ?? null,
    priceListValidTo: c.priceListValidTo ?? null,
    scoreAvgDelayDays: c.scoreAvgDelayDays ?? null,
    scoreMaxDelayDays: c.scoreMaxDelayDays ?? null,
    scoreOnTimeRatio: c.scoreOnTimeRatio ?? null,
    scorePaymentRating: (c.scorePaymentRating as any) ?? null,
    scorePoints: c.scorePoints ?? null,
    scoreUpdatedAt: c.scoreUpdatedAt ? c.scoreUpdatedAt.toISOString() : null,
    annualTurnoverNet: c.annualTurnoverNet ?? 0,
    annualMarginNet: c.annualMarginNet ?? 0,
    annualMarginPercent: c.annualMarginPercent ?? 0,
    openReceivables: c.openReceivables ?? 0,
    lifetimeTurnoverNet: c.lifetimeTurnoverNet ?? 0,
    lastInvoiceDate: c.lastInvoiceDate ?? null,
    statsUpdatedAt: c.statsUpdatedAt ? c.statsUpdatedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

export function productToDto(p: DbProduct & { stockQuantity?: number }): Product {
  return {
    companyId: p.companyId,
    id: p.id,
    name: p.name,
    sku: p.sku ?? undefined,
    unit: p.unit,
    netPrice: p.netPrice,
    vatRate: p.vatRate as Product["vatRate"],
    description: p.description ?? undefined,
    // Magazyn WMS
    isStockTracked: p.isStockTracked ?? false,
    minQuantity: p.minQuantity ?? 0,
    purchasePrice: p.purchasePrice ?? 0,
    gtuCode: (p.gtuCode as any) ?? null,
    pkwiu: p.pkwiu ?? null,
    cnCode: p.cnCode ?? null,
    isSplitPaymentGoods: p.isSplitPaymentGoods ?? false,
    stockQuantity: typeof p.stockQuantity === "number" ? p.stockQuantity : undefined,
  };
}

export function ksefInfoFrom(v: unknown): KsefInfo | undefined {
  if (!v || typeof v !== "object") return undefined;
  const k = v as Partial<KsefInfo>;
  if (!k.number && !k.referenceNumber) return undefined;
  return {
    number: k.number ?? "",
    status: k.status ?? "SENT",
    sentAt: k.sentAt ?? new Date().toISOString(),
    environment: k.environment ?? "demo",
    sessionReferenceNumber: k.sessionReferenceNumber,
    referenceNumber: k.referenceNumber,
    processingCode: k.processingCode,
    processingDescription: k.processingDescription,
  };
}

export function invoiceToDto(
  i: DbInvoice & {
    sellerCompany?: DbCompanyProfile | null;
    payments?: Array<{ id: string; amount: number; paidAt: Date; method: string; note?: string | null }>;
  }
): Invoice {
  const mappedPayments = Array.isArray(i.payments)
    ? i.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        paidAt: p.paidAt.toISOString(),
        method: p.method as any,
        note: p.note ?? undefined,
      }))
    : undefined;

  return {
    id: i.id,
    number: i.number,
    documentKind: (i.documentKind || "vat") as Invoice["documentKind"],
    advanceReceivedDate: i.advanceReceivedDate || undefined,
    settlementMetadata: (i.settlementMetadata || undefined) as unknown as Invoice["settlementMetadata"],
    type: (i.type === "purchase" ? "purchase" : "sale") as Invoice["type"],
    status: i.status as Invoice["status"],
    contractorId: i.contractorId,
    sellerCompanyId: i.sellerCompanyId ?? undefined,
    sellerCompany: i.sellerCompany ? companyProfileToDto(i.sellerCompany) : undefined,
    issueDate: i.issueDate,
    saleDate: i.saleDate,
    dueDate: i.dueDate,
    currency: i.currency as Invoice["currency"],
    language: (i.language as any) || "PL",
    paymentMethod: i.paymentMethod as Invoice["paymentMethod"],
    paymentTermDays: i.paymentTermDays,
    notes: i.notes ?? undefined,
    lines: (Array.isArray(i.lines) ? i.lines : []) as unknown as Invoice["lines"],
    totalNet: i.totalNet ?? undefined,
    totalVat: i.totalVat ?? undefined,
    totalGross: i.totalGross ?? undefined,
    ksef: ksefInfoFrom(i.ksef),
    ksefNumber: i.ksefNumber ?? null,
    referenceNumber: i.referenceNumber ?? null,
    upoXml: i.upoXml ?? null,
    ksefXml: i.ksefXml ?? null,
    sentAt: i.sentAt ? i.sentAt.toISOString() : null,
    sentToEmail: i.sentToEmail ?? null,
    emailStatus: i.emailStatus ?? null,
    approvalStatus: i.approvalStatus ?? "pending",
    approvedAt: i.approvedAt ? i.approvedAt.toISOString() : null,
    approvedBy: i.approvedBy ?? null,
    // Rozszerzone pola
    documentStatus: (i.documentStatus as any) ?? "draft",
    ksefStatus: (i.ksefStatus as any) ?? (i.ksefNumber ? "accepted" : "none"),
    paymentStatus: (i.paymentStatus as any) ?? (i.status === "paid" ? "paid" : "unpaid"),
    paidAmount: i.paidAmount ?? (i.status === "paid" ? (i.totalGross ?? 0) : 0),
    payments: mappedPayments,
    version: i.version ?? 1,
    isCorrection: i.isCorrection ?? false,
    correctionReason: i.correctionReason ?? undefined,
    originalInvoiceId: i.originalInvoiceId ?? undefined,
    originalInvoiceNumber: i.originalInvoiceNumber ?? undefined,
    originalKsefNumber: i.originalKsefNumber ?? undefined,
    originalIssueDate: i.originalIssueDate ?? undefined,
    originalLines: (Array.isArray(i.originalLines) ? i.originalLines : undefined) as any,
    isOffline: i.isOffline ?? false,
    offlineReason: i.offlineReason ?? undefined,
    offlineDeadline: i.offlineDeadline ? i.offlineDeadline.toISOString() : undefined,
    qrCodeI: i.qrCodeI ?? undefined,
    qrCodeII: i.qrCodeII ?? undefined,
    isRecurring: i.isRecurring ?? false,
    recurringInterval: i.recurringInterval ?? undefined,
    recurringAnchorDay: i.recurringAnchorDay,
    recurringLastError: i.recurringLastError,
    recurringNextDate: i.recurringNextDate ?? undefined,
    recurringPaused: i.recurringPaused ?? false,
    recurringAutoSend: i.recurringAutoSend ?? false,
    lastPaymentReminderSentAt: i.lastPaymentReminderSentAt ? i.lastPaymentReminderSentAt.toISOString() : undefined,
    paymentReminderCount: i.paymentReminderCount ?? 0,
    shareToken: i.shareToken ?? undefined,
    isProforma: i.isProforma ?? false,
    declaredPaymentDate: i.declaredPaymentDate ?? undefined,
    autoSendEmailOnKsef: (i as any).autoSendEmailOnKsef ?? false,
    emailLogs: Array.isArray((i as any).emailLogs) ? (i as any).emailLogs.map(emailLogToDto) : undefined,

    // Nowe pola walutowe, NBP i bankowe
    exchangeRate: i.exchangeRate ?? null,
    exchangeRateUnit: i.exchangeRateUnit ?? 1,
    exchangeRateDate: i.exchangeRateDate ?? null,
    exchangeRateTable: i.exchangeRateTable ?? null,
    exchangeRateSource: i.exchangeRateSource ?? null,
    exchangeRateRule: (i.exchangeRateRule as any) ?? null,
    exchangeRateJustification: i.exchangeRateJustification ?? null,
    taxPointDate: i.taxPointDate ?? null,
    totalNetPln: i.totalNetPln ?? null,
    totalVatPln: i.totalVatPln ?? null,
    totalGrossPln: i.totalGrossPln ?? null,
    bankAccountId: i.bankAccountId ?? null,
    bankAccountSnapshot: (i.bankAccountSnapshot as any) ?? null,
    buyerTaxIdType: (i.buyerTaxIdType as any) ?? null,
    buyerCountry: i.buyerCountry ?? null,

    // Ewidencja JPK_V7 (sekcja 3)
    gtuCodes: (i.gtuCodes ?? []) as any,
    jpkProcedures: (i.jpkProcedures ?? []) as any,
    jpkDocumentType: (i.jpkDocumentType as any) ?? null,
    isSplitPayment: i.isSplitPayment ?? false,
    isWstoEe: i.isWstoEe ?? false,
    vatRegisterPeriod: i.vatRegisterPeriod ?? null,
    // Magazyn (sekcja 4)
    stockDocumentId: i.stockDocumentId ?? null,
    stockDocumentNumber: i.stockDocumentNumber ?? null,
    // CRM / e-commerce (sekcje 5–6)
    sourceChannel: i.sourceChannel ?? "manual",
    appliedDiscountPercent: i.appliedDiscountPercent ?? 0,

    createdAt: i.createdAt.toISOString(),
  };
}

export function companyBankAccountToDto(ba: any): any {
  return {
    id: ba.id,
    companyId: ba.companyId,
    accountName: ba.accountName || "Rachunek bieżący",
    beneficiaryName: ba.beneficiaryName || "",
    currency: ba.currency || "PLN",
    isMultiCurrency: ba.isMultiCurrency ?? false,
    accountNumber: ba.accountNumber || "",
    swiftBic: ba.swiftBic ?? null,
    bankName: ba.bankName || "",
    bankAddress: ba.bankAddress ?? null,
    transferInstructions: ba.transferInstructions ?? null,
    isDefault: ba.isDefault ?? false,
    createdAt: ba.createdAt instanceof Date ? ba.createdAt.toISOString() : String(ba.createdAt),
    updatedAt: ba.updatedAt instanceof Date ? ba.updatedAt.toISOString() : String(ba.updatedAt),
  };
}

export function companyMemberToDto(cm: any): any {
  return {
    id: cm.id,
    companyId: cm.companyId,
    userId: cm.userId,
    role: cm.role,
    canIssueInvoices: cm.canIssueInvoices ?? false,
    canCreateCorrections: cm.canCreateCorrections ?? false,
    canRecordPayments: cm.canRecordPayments ?? false,
    canExport: cm.canExport ?? false,
    canSendKsef: cm.canSendKsef ?? false,
    canManageBankAccounts: cm.canManageBankAccounts ?? false,
    canManageTeam: cm.canManageTeam ?? false,
    createdAt: cm.createdAt instanceof Date ? cm.createdAt.toISOString() : String(cm.createdAt),
    updatedAt: cm.updatedAt instanceof Date ? cm.updatedAt.toISOString() : String(cm.updatedAt),
    user: cm.user
      ? {
          id: cm.user.id,
          email: cm.user.email,
          name: cm.user.name || cm.user.email,
        }
      : undefined,
  };
}

export function teamInvitationToDto(ti: any): any {
  return {
    id: ti.id,
    companyId: ti.companyId ?? null,
    userId: ti.userId,
    email: ti.email,
    role: ti.role,
    permissions: ti.permissions ?? null,
    token: ti.token,
    expiresAt: ti.expiresAt instanceof Date ? ti.expiresAt.toISOString() : String(ti.expiresAt),
    acceptedAt: ti.acceptedAt ? (ti.acceptedAt instanceof Date ? ti.acceptedAt.toISOString() : String(ti.acceptedAt)) : null,
    status: ti.status,
    createdAt: ti.createdAt instanceof Date ? ti.createdAt.toISOString() : String(ti.createdAt),
    companyName: ti.company?.companyName ?? undefined,
    invitedByName: ti.user?.name || ti.user?.email,
  };
}

export function auditLogToDto(a: any): any {
  return {
    id: a.id,
    companyId: a.companyId ?? null,
    documentId: a.documentId ?? null,
    userId: a.userId ?? null,
    userName: a.userName || a.user?.name || a.user?.email || "System",
    userEmail: a.userEmail || a.user?.email || null,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    description: a.description ?? null,
    diff: a.diff ?? null,
    details: a.details ?? null,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
  };
}

export function emailLogToDto(l: any): InvoiceEmailLog {
  return {
    id: l.id,
    invoiceId: l.invoiceId,
    userId: l.userId,
    to: l.to,
    cc: l.cc ?? null,
    bcc: l.bcc ?? null,
    subject: l.subject,
    messageBody: l.messageBody ?? null,
    attachments: Array.isArray(l.attachments) ? l.attachments : undefined,
    status: l.status ?? "sent",
    provider: l.provider ?? "smtp",
    messageId: l.messageId ?? null,
    error: l.error ?? null,
    sentAt: l.sentAt instanceof Date ? l.sentAt.toISOString() : String(l.sentAt),
    userName: l.user?.name ?? undefined,
  };
}

export function offerToDto(o: DbOffer): Offer {
  return {
    id: o.id,
    number: o.number,
    contractorId: o.contractorId,
    contractorName: o.contractorName,
    contractorNip: o.contractorNip,
    title: o.title,
    status: o.status as Offer["status"],
    issueDate: o.issueDate,
    validUntil: o.validUntil,
    currency: o.currency as Offer["currency"],
    lines: (Array.isArray(o.lines) ? o.lines : []) as any,
    totalNet: o.totalNet,
    totalVat: o.totalVat,
    totalGross: o.totalGross,
    notes: o.notes,
    publicToken: o.publicToken,
    version: o.version,
    acceptedAt: o.acceptedAt ? o.acceptedAt.toISOString() : null,
    rejectionReason: o.rejectionReason,
    convertedOrderId: o.convertedOrderId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function orderToDto(ord: DbOrder): Order {
  return {
    id: ord.id,
    number: ord.number,
    offerId: ord.offerId,
    contractorId: ord.contractorId,
    contractorName: ord.contractorName,
    title: ord.title,
    status: ord.status as Order["status"],
    stages: (Array.isArray(ord.stages) ? ord.stages : []) as any,
    hourlyRate: ord.hourlyRate ?? 0,
    trackedMinutes: ord.trackedMinutes ?? 0,
    totalNet: ord.totalNet,
    totalGross: ord.totalGross,
    currency: ord.currency as Order["currency"],
    notes: ord.notes,
    billedInvoiceId: ord.billedInvoiceId,
    createdAt: ord.createdAt.toISOString(),
    updatedAt: ord.updatedAt.toISOString(),
  };
}

export function expenseToDto(e: DbExpense): Expense {
  return {
    id: e.id,
    number: e.number,
    contractorName: e.contractorName,
    nip: e.nip,
    issueDate: e.issueDate,
    dueDate: e.dueDate,
    category: e.category as Expense["category"],
    description: e.description,
    totalNet: e.totalNet,
    totalVat: e.totalVat,
    totalGross: e.totalGross,
    currency: e.currency as Expense["currency"],
    paymentStatus: e.paymentStatus as Expense["paymentStatus"],
    paidAt: e.paidAt ? e.paidAt.toISOString() : null,
    attachmentUrl: e.attachmentUrl,
    attachmentName: e.attachmentName,
    workflowStatus: e.workflowStatus as Expense["workflowStatus"],
    isKsefSource: e.isKsefSource,
    ksefRefNumber: e.ksefRefNumber,
    // Ewidencja zakupu JPK_V7 (sekcja 3)
    contractorNip: e.contractorNip ?? e.nip ?? null,
    purchaseDocType: (e.purchaseDocType as any) ?? null,
    isImport: e.isImport ?? false,
    vatDeductible: e.vatDeductible ?? true,
    vatDeductiblePercent: e.vatDeductiblePercent ?? 100,
    isFixedAsset: e.isFixedAsset ?? false,
    vatRegisterPeriod: e.vatRegisterPeriod ?? null,
    receivedAt: e.receivedAt ?? null,
    // Magazyn (sekcja 4)
    stockDocumentId: e.stockDocumentId ?? null,
    stockDocumentNumber: e.stockDocumentNumber ?? null,
    // OCR (sekcja 7)
    scanId: e.scanId ?? null,
    ocrConfidence: e.ocrConfidence ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export function documentCommentToDto(c: DbDocumentComment): DocumentCommentItem {
  return {
    id: c.id,
    authorName: c.authorName,
    authorRole: c.authorRole as DocumentCommentItem["authorRole"],
    docType: c.docType as DocumentCommentItem["docType"],
    docId: c.docId,
    message: c.message,
    createdAt: c.createdAt.toISOString(),
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

