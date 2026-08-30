"use client";

import { create } from "zustand";
import type {
  AppNotification,
  CompanyProfile,
  Contractor,
  Invoice,
  KsefInfo,
  KsefSettings,
  NotificationPrefs,
  Product,
} from "./types";
import { todayISO } from "./utils";

/**
 * Store = cache UI. Backend (Prisma/SQLite przez API) jest JEDYNYM źródłem
 * prawdy — brak persist/localStorage i brak seedu. Bootstrap odbywa się raz,
 * po zalogowaniu (GET /api/data) w komponencie <DataBootstrap />.
 */

export interface AppState {
  /** true po udanym bootstrapie z backendu. */
  hydrated: boolean;
  authError: boolean;

  company: CompanyProfile | null;
  companies: CompanyProfile[];
  selectedCompanyId: string | null;
  contractors: Contractor[];
  products: Product[];
  invoices: Invoice[];
  ksef: KsefSettings | null;

  notifications: AppNotification[];
  notificationPrefs: NotificationPrefs;

  /** Faktura w edycji (ustawiana z listy faktur przed przejściem do kreatora). */
  draftInvoice: Invoice | null;
  draftInvoiceIsNew: boolean;

  bootstrap: () => Promise<void>;
  resetData: () => void;

  fetchCompanies: () => Promise<CompanyProfile[]>;
  addCompany: (c: Partial<CompanyProfile>) => Promise<CompanyProfile>;
  updateCompanyProfile: (id: string, c: Partial<CompanyProfile>) => Promise<CompanyProfile>;
  deleteCompanyProfile: (id: string) => Promise<void>;
  setDefaultCompanyProfile: (id: string) => Promise<CompanyProfile>;
  setSelectedCompanyId: (id: string | null) => void;

  updateCompany: (patch: Partial<CompanyProfile>) => Promise<CompanyProfile>;
  updateKsef: (patch: Partial<KsefSettings>) => Promise<KsefSettings>;

  addContractor: (c: Omit<Contractor, "id" | "createdAt">) => Promise<Contractor>;
  updateContractor: (id: string, c: Partial<Contractor>) => Promise<Contractor>;
  deleteContractor: (id: string) => Promise<void>;

  addProduct: (p: Omit<Product, "id">) => Promise<Product>;
  updateProduct: (id: string, p: Partial<Product>) => Promise<Product>;
  deleteProduct: (id: string) => Promise<void>;

  addInvoice: (inv: Omit<Invoice, "id" | "createdAt">) => Promise<Invoice>;
  updateInvoice: (id: string, inv: Partial<Invoice>) => Promise<Invoice>;
  deleteInvoice: (id: string) => Promise<void>;
  setInvoiceKsef: (id: string, ksef: KsefInfo) => void;
  applyInvoice: (inv: Invoice) => void;

  setDraft: (invoice: Invoice | null, isNew: boolean) => void;

  fetchNotifications: () => Promise<{ unread: number }>;
  markNotificationRead: (id: string, read: boolean) => Promise<void>;
  updateNotificationPrefs: (patch: Partial<NotificationPrefs>) => Promise<NotificationPrefs>;
}

/** Rzuca błąd z komunikatem z odpowiedzi API (lub ogólnym). */
export async function apiError(res: Response, fallback: string): Promise<Error> {
  let message = fallback;
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    if (typeof data.error === "string" && data.error) message = data.error;
    else if (typeof data.message === "string" && data.message) message = data.message;
  } catch {
    /* ignore */
  }
  return new Error(message);
}

const EMPTY_PREFS: NotificationPrefs = { browserEnabled: false, soundEnabled: true };

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  authError: false,

  company: null,
  companies: [],
  selectedCompanyId: null,
  contractors: [],
  products: [],
  invoices: [],
  ksef: null,

  notifications: [],
  notificationPrefs: EMPTY_PREFS,

  draftInvoice: null,
  draftInvoiceIsNew: true,

  /* ── Bootstrap ──────────────────────────────────────────────────────── */

  bootstrap: async () => {
    const res = await fetch("/api/data", { cache: "no-store" });
    if (res.status === 401) {
      set({ hydrated: true, authError: true });
      return;
    }
    if (!res.ok) throw await apiError(res, "Nie udało się pobrać danych.");
    const data = (await res.json()) as {
      company: CompanyProfile | null;
      companies?: CompanyProfile[];
      ksef: KsefSettings | null;
      contractors: Contractor[];
      products: Product[];
      invoices: Invoice[];
      notifications: AppNotification[];
      notificationPrefs: NotificationPrefs;
    };
    const companies = data.companies ?? (data.company ? [data.company] : []);
    const defaultComp = companies.find((c) => c.isDefault) ?? companies[0] ?? data.company ?? null;

    set({
      company: defaultComp,
      companies,
      selectedCompanyId: defaultComp?.id ?? null,
      ksef: data.ksef,
      contractors: data.contractors,
      products: data.products,
      invoices: data.invoices,
      notifications: data.notifications,
      notificationPrefs: data.notificationPrefs ?? EMPTY_PREFS,
      hydrated: true,
      authError: false,
    });
  },

  resetData: () =>
    set({
      hydrated: false,
      authError: false,
      company: null,
      companies: [],
      selectedCompanyId: null,
      contractors: [],
      products: [],
      invoices: [],
      ksef: null,
      notifications: [],
      notificationPrefs: EMPTY_PREFS,
      draftInvoice: null,
      draftInvoiceIsNew: true,
    }),

  /* ── Zarządzanie spółkami (Multi-Company) ────────────────────────────── */

  fetchCompanies: async () => {
    const res = await fetch("/api/companies", { cache: "no-store" });
    if (!res.ok) throw await apiError(res, "Nie udało się pobrać listy firm.");
    const data = (await res.json()) as { companies: CompanyProfile[] };
    const defaultComp = data.companies.find((c) => c.isDefault) ?? data.companies[0] ?? null;
    set({
      companies: data.companies,
      company: defaultComp,
      selectedCompanyId: get().selectedCompanyId || defaultComp?.id || null,
    });
    return data.companies;
  },

  addCompany: async (c) => {
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się dodać firmy.");
    const data = (await res.json()) as { company: CompanyProfile };
    const updatedList = data.company.isDefault
      ? [data.company, ...get().companies.map((x) => ({ ...x, isDefault: false }))]
      : [...get().companies, data.company];

    const defaultComp = updatedList.find((x) => x.isDefault) ?? updatedList[0] ?? data.company;
    set({
      companies: updatedList,
      company: defaultComp,
      selectedCompanyId: data.company.id,
    });
    return data.company;
  },

  updateCompanyProfile: async (id, patch) => {
    const res = await fetch(`/api/companies/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować firmy.");
    const data = (await res.json()) as { company: CompanyProfile };
    const updatedList = get().companies.map((x) => {
      if (x.id === id) return data.company;
      if (data.company.isDefault) return { ...x, isDefault: false };
      return x;
    });
    const defaultComp = updatedList.find((x) => x.isDefault) ?? updatedList[0] ?? data.company;
    set({
      companies: updatedList,
      company: defaultComp,
    });
    return data.company;
  },

  deleteCompanyProfile: async (id) => {
    const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
    if (!res.ok) throw await apiError(res, "Nie udało się usunąć firmy.");
    const updatedList = get().companies.filter((x) => x.id !== id);
    const defaultComp = updatedList.find((x) => x.isDefault) ?? updatedList[0] ?? null;
    set({
      companies: updatedList,
      company: defaultComp,
      selectedCompanyId: get().selectedCompanyId === id ? defaultComp?.id ?? null : get().selectedCompanyId,
    });
  },

  setDefaultCompanyProfile: async (id) => {
    const res = await fetch(`/api/companies/${id}/set-default`, { method: "PATCH" });
    if (!res.ok) throw await apiError(res, "Nie udało się ustawić firmy jako domyślnej.");
    const data = (await res.json()) as { company: CompanyProfile };
    const updatedList = get().companies.map((x) => ({
      ...x,
      isDefault: x.id === id,
    }));
    set({
      companies: updatedList,
      company: data.company,
      selectedCompanyId: id,
    });
    return data.company;
  },

  setSelectedCompanyId: (id) => set({ selectedCompanyId: id }),

  /* ── Ustawienia ─────────────────────────────────────────────────────── */

  updateCompany: async (patch) => {
    const current = get().company ?? {
      name: "",
      nip: "",
      regon: "",
      street: "",
      city: "",
      postal: "",
      country: "PL",
      iban: "",
      bankName: "",
      email: "",
      phone: "",
    };
    const res = await fetch("/api/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, ...patch }),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się zapisać profilu firmy.");
    const data = (await res.json()) as { company: CompanyProfile };
    set({ company: data.company });
    return data.company;
  },

  updateKsef: async (patch) => {
    const current = get().ksef ?? {
      environment: "demo",
      tokenSet: false,
      tokenMask: "",
      certName: "",
      autoValidate: true,
    };
    const res = await fetch("/api/ksef", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, ...patch }),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się zapisać ustawień KSeF.");
    const data = (await res.json()) as { ksef: KsefSettings };
    set({ ksef: data.ksef });
    return data.ksef;
  },

  /* ── Kontrahenci ────────────────────────────────────────────────────── */

  addContractor: async (c) => {
    const res = await fetch("/api/contractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się dodać kontrahenta.");
    const data = (await res.json()) as { contractor: Contractor };
    set({ contractors: [data.contractor, ...get().contractors] });
    return data.contractor;
  },

  updateContractor: async (id, patch) => {
    const res = await fetch(`/api/contractors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować kontrahenta.");
    const data = (await res.json()) as { contractor: Contractor };
    set({ contractors: get().contractors.map((c) => (c.id === id ? data.contractor : c)) });
    return data.contractor;
  },

  deleteContractor: async (id) => {
    const res = await fetch(`/api/contractors/${id}`, { method: "DELETE" });
    if (!res.ok) throw await apiError(res, "Nie udało się usunąć kontrahenta.");
    set({ contractors: get().contractors.filter((c) => c.id !== id) });
  },

  /* ── Produkty ───────────────────────────────────────────────────────── */

  addProduct: async (p) => {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się dodać pozycji.");
    const data = (await res.json()) as { product: Product };
    set({ products: [data.product, ...get().products] });
    return data.product;
  },

  updateProduct: async (id, patch) => {
    const res = await fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować pozycji.");
    const data = (await res.json()) as { product: Product };
    set({ products: get().products.map((p) => (p.id === id ? data.product : p)) });
    return data.product;
  },

  deleteProduct: async (id) => {
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (!res.ok) throw await apiError(res, "Nie udało się usunąć pozycji.");
    set({ products: get().products.filter((p) => p.id !== id) });
  },

  /* ── Faktury ────────────────────────────────────────────────────────── */

  addInvoice: async (inv) => {
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inv),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się zapisać faktury.");
    const data = (await res.json()) as { invoice: Invoice };
    set({ invoices: [data.invoice, ...get().invoices] });
    return data.invoice;
  },

  updateInvoice: async (id, patch) => {
    const existing = get().invoices.find((i) => i.id === id);
    if (!existing) throw new Error("Nie znaleziono faktury.");
    const res = await fetch(`/api/invoices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...existing, ...patch }),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować faktury.");
    const data = (await res.json()) as { invoice: Invoice };
    set({ invoices: get().invoices.map((i) => (i.id === id ? data.invoice : i)) });
    return data.invoice;
  },

  deleteInvoice: async (id) => {
    const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    if (!res.ok) throw await apiError(res, "Nie udało się usunąć faktury.");
    set({ invoices: get().invoices.filter((i) => i.id !== id) });
  },

  /** Lokalne odświeżenie po wysyłce do KSeF (backend już zapisał status). */
  setInvoiceKsef: (id, ksef) => {
    set({
      invoices: get().invoices.map((i) =>
        i.id === id ? { ...i, ksef, status: i.status === "draft" ? i.status : "ksef_sent" } : i
      ),
    });
  },

  applyInvoice: (inv) => {
    set({
      invoices: get().invoices.some((i) => i.id === inv.id)
        ? get().invoices.map((i) => (i.id === inv.id ? inv : i))
        : [inv, ...get().invoices],
    });
  },

  setDraft: (invoice, isNew) => set({ draftInvoice: invoice, draftInvoiceIsNew: isNew }),

  /* ── Powiadomienia ──────────────────────────────────────────────────── */

  fetchNotifications: async () => {
    const res = await fetch("/api/notifications?limit=50", { cache: "no-store" });
    if (res.status === 401) {
      set({ hydrated: true, authError: true });
      return { unread: 0 };
    }
    if (!res.ok) throw await apiError(res, "Nie udało się pobrać powiadomień.");
    const data = (await res.json()) as { notifications: AppNotification[]; unread: number };
    set({ notifications: data.notifications });
    return { unread: data.unread };
  },

  markNotificationRead: async (id, read) => {
    const res = await fetch(`/api/notifications/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować powiadomienia.");
    set({
      notifications: get().notifications.map((n) => (n.id === id ? { ...n, read } : n)),
    });
  },

  updateNotificationPrefs: async (patch) => {
    const next = { ...get().notificationPrefs, ...patch };
    const res = await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw await apiError(res, "Nie udało się zapisać preferencji.");
    const data = (await res.json()) as { notificationPrefs: NotificationPrefs };
    set({ notificationPrefs: data.notificationPrefs });
    return data.notificationPrefs;
  },
}));

/* ── Helpers (czysto funkcyjne, bez stanu) ─────────────────────────────── */

export type EffectiveStatus =
  | "draft"
  | "issued"
  | "overdue"
  | "paid"
  | "ksef_queued"
  | "ksef_sent"
  | "ksef_active"
  | "ksef_rejected";

export function effectiveStatus(inv: Invoice): EffectiveStatus {
  if (inv.status === "paid") return "paid";
  if (inv.status === "draft") return "draft";
  const overdue = !!inv.dueDate && inv.dueDate < todayISO();
  if (inv.ksef) {
    switch (inv.ksef.status) {
      case "QUEUED":
        return "ksef_queued";
      case "SENT":
        return overdue ? "overdue" : "ksef_sent";
      case "ACTIVE":
        return overdue ? "overdue" : "ksef_active";
      case "REJECTED":
        return "ksef_rejected";
    }
  }
  return overdue ? "overdue" : "issued";
}

export function getContractor(contractors: Contractor[], id: string): Contractor | undefined {
  return contractors.find((c) => c.id === id);
}

export function nextInvoiceNumber(invoices: Invoice[], type: "sale" | "purchase"): string {
  const prefix = type === "sale" ? "FV" : "FZ";
  const year = new Date().getFullYear();
  const re = new RegExp(`^${prefix}/${year}/(\\d{4})$`);
  let max = 0;
  for (const inv of invoices) {
    const m = inv.number.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}/${year}/${String(max + 1).padStart(4, "0")}`;
}

export const STATUS_META: Record<EffectiveStatus, { label: string; color: string; dot: string }> = {
  draft: { label: "Szkic", color: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  issued: { label: "Wystawiona", color: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", dot: "bg-sky-500" },
  overdue: { label: "Przeterminowana", color: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300", dot: "bg-red-500" },
  paid: { label: "Opłacona", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500" },
  ksef_queued: { label: "KSeF: w kolejce", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", dot: "bg-amber-500" },
  ksef_sent: { label: "Wysłana do KSeF", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", dot: "bg-indigo-500" },
  ksef_active: { label: "KSeF: aktywna", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500" },
  ksef_rejected: { label: "KSeF: odrzucona", color: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300", dot: "bg-red-500" },
};
