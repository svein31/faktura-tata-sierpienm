"use client";

import { create } from "zustand";
import { EMPTY_COMPANY } from "./types";
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
  /** SWR-style silent revalidation — refreshes data without resetting hydrated. */
  revalidate: () => Promise<void>;
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
  approveInvoices: (ids: string[], status?: "approved" | "pending") => Promise<void>;

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

  revalidate: async () => {
    if (!get().hydrated) return; // bootstrap not done yet
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (!res.ok) return; // silently ignore errors during revalidation
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
        selectedCompanyId: get().selectedCompanyId || defaultComp?.id || null,
        ksef: data.ksef,
        contractors: data.contractors,
        products: data.products,
        invoices: data.invoices,
        notifications: data.notifications,
        notificationPrefs: data.notificationPrefs ?? EMPTY_PREFS,
      });
    } catch {
      // Silently ignore — stale data is better than broken UI
    }
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

  /* ── Zarządzanie spółkami (Multi-Company) — Optimistic UI ────────────────── */

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
    // 0ms Optimistic update
    const previousCompanies = get().companies;
    const previousCompany = get().company;
    const previousSelectedId = get().selectedCompanyId;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();
    const optimisticCompany: CompanyProfile = {
      id: tempId,
      userId: "",
      nip: c.nip || "",
      companyName: c.companyName || c.name || "",
      street: c.street || null,
      buildingNumber: c.buildingNumber || null,
      flatNumber: c.flatNumber || null,
      city: c.city || null,
      postalCode: c.postalCode || c.postal || null,
      bankAccount: c.bankAccount || c.iban || null,
      ksefToken: c.ksefToken || null,
      isDefault: c.isDefault ?? (previousCompanies.length === 0),
      createdAt: nowIso,
      updatedAt: nowIso,
      ...c,
    };

    const optimisticList = optimisticCompany.isDefault
      ? [optimisticCompany, ...previousCompanies.map((x) => ({ ...x, isDefault: false }))]
      : [...previousCompanies, optimisticCompany];

    const optDefaultComp = optimisticList.find((x) => x.isDefault) ?? optimisticList[0] ?? optimisticCompany;

    set({
      companies: optimisticList,
      company: optDefaultComp,
      selectedCompanyId: tempId,
    });

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się dodać firmy.");
      const data = (await res.json()) as { company: CompanyProfile };

      const finalList = get().companies.map((x) => (x.id === tempId ? data.company : x));
      const finalDefault = finalList.find((x) => x.isDefault) ?? finalList[0] ?? data.company;

      set({
        companies: finalList,
        company: finalDefault,
        selectedCompanyId: get().selectedCompanyId === tempId ? data.company.id : get().selectedCompanyId,
      });
      return data.company;
    } catch (err) {
      // Rollback on error
      set({
        companies: previousCompanies,
        company: previousCompany,
        selectedCompanyId: previousSelectedId,
      });
      throw err;
    }
  },

  updateCompanyProfile: async (id, patch) => {
    // 0ms Optimistic update
    const previousCompanies = get().companies;
    const previousCompany = get().company;

    const optimisticList = previousCompanies.map((x) => {
      if (x.id === id) {
        const updated = { ...x, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      }
      if (patch.isDefault) return { ...x, isDefault: false };
      return x;
    });
    const optDefaultComp = optimisticList.find((x) => x.isDefault) ?? optimisticList[0] ?? previousCompany;

    set({
      companies: optimisticList,
      company: optDefaultComp,
    });

    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować firmy.");
      const data = (await res.json()) as { company: CompanyProfile };

      const finalList = get().companies.map((x) => (x.id === id ? data.company : x));
      const finalDefault = finalList.find((x) => x.isDefault) ?? finalList[0] ?? data.company;

      set({
        companies: finalList,
        company: finalDefault,
      });
      return data.company;
    } catch (err) {
      // Rollback on error
      set({
        companies: previousCompanies,
        company: previousCompany,
      });
      throw err;
    }
  },

  deleteCompanyProfile: async (id) => {
    // 0ms Optimistic update
    const previousCompanies = get().companies;
    const previousCompany = get().company;
    const previousSelectedId = get().selectedCompanyId;

    const optimisticList = previousCompanies.filter((x) => x.id !== id);
    const optDefaultComp = optimisticList.find((x) => x.isDefault) ?? optimisticList[0] ?? null;

    set({
      companies: optimisticList,
      company: optDefaultComp,
      selectedCompanyId: previousSelectedId === id ? optDefaultComp?.id ?? null : previousSelectedId,
    });

    try {
      const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
      if (!res.ok) throw await apiError(res, "Nie udało się usunąć firmy.");
    } catch (err) {
      // Rollback on error
      set({
        companies: previousCompanies,
        company: previousCompany,
        selectedCompanyId: previousSelectedId,
      });
      throw err;
    }
  },

  setDefaultCompanyProfile: async (id) => {
    // 0ms Optimistic update
    const previousCompanies = get().companies;
    const previousCompany = get().company;

    const optimisticList = previousCompanies.map((x) => ({
      ...x,
      isDefault: x.id === id,
    }));
    const optDefaultComp = optimisticList.find((x) => x.id === id) ?? previousCompany;

    set({
      companies: optimisticList,
      company: optDefaultComp,
      selectedCompanyId: id,
    });

    try {
      const res = await fetch(`/api/companies/${id}/set-default`, { method: "PATCH" });
      if (!res.ok) throw await apiError(res, "Nie udało się ustawić firmy jako domyślnej.");
      const data = (await res.json()) as { company: CompanyProfile };

      set({
        company: data.company,
      });
      return data.company;
    } catch (err) {
      // Rollback on error
      set({
        companies: previousCompanies,
        company: previousCompany,
      });
      throw err;
    }
  },

  setSelectedCompanyId: (id) => set({ selectedCompanyId: id }),

  /* ── Ustawienia ─────────────────────────────────────────────────────── */

  updateCompany: async (patch) => {
    const current = get().company ?? EMPTY_COMPANY;
    const optimistic: CompanyProfile = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    set({ company: optimistic });

    try {
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optimistic),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się zapisać profilu firmy.");
      const data = (await res.json()) as { company: CompanyProfile };
      set({ company: data.company });
      return data.company;
    } catch (err) {
      set({ company: current });
      throw err;
    }
  },

  updateKsef: async (patch) => {
    const current = get().ksef ?? {
      environment: "demo",
      tokenSet: false,
      tokenMask: "",
      certName: "",
      autoValidate: true,
    };
    const optimistic = { ...current, ...patch };
    set({ ksef: optimistic });

    try {
      const res = await fetch("/api/ksef", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optimistic),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się zapisać ustawień KSeF.");
      const data = (await res.json()) as { ksef: KsefSettings };
      set({ ksef: data.ksef });
      return data.ksef;
    } catch (err) {
      set({ ksef: current });
      throw err;
    }
  },

  /* ── Kontrahenci — Optimistic UI ─────────────────────────────────────── */

  addContractor: async (c) => {
    const previousContractors = get().contractors;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticContractor: Contractor = {
      id: tempId,
      createdAt: new Date().toISOString(),
      ...c,
    };
    set({ contractors: [optimisticContractor, ...previousContractors] });

    try {
      const res = await fetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się dodać kontrahenta.");
      const data = (await res.json()) as { contractor: Contractor };
      set({
        contractors: get().contractors.map((x) => (x.id === tempId ? data.contractor : x)),
      });
      return data.contractor;
    } catch (err) {
      set({ contractors: previousContractors });
      throw err;
    }
  },

  updateContractor: async (id, patch) => {
    const previousContractors = get().contractors;
    set({
      contractors: previousContractors.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });

    try {
      const res = await fetch(`/api/contractors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować kontrahenta.");
      const data = (await res.json()) as { contractor: Contractor };
      set({ contractors: get().contractors.map((c) => (c.id === id ? data.contractor : c)) });
      return data.contractor;
    } catch (err) {
      set({ contractors: previousContractors });
      throw err;
    }
  },

  deleteContractor: async (id) => {
    const previousContractors = get().contractors;
    set({ contractors: previousContractors.filter((c) => c.id !== id) });

    try {
      const res = await fetch(`/api/contractors/${id}`, { method: "DELETE" });
      if (!res.ok) throw await apiError(res, "Nie udało się usunąć kontrahenta.");
    } catch (err) {
      set({ contractors: previousContractors });
      throw err;
    }
  },

  /* ── Produkty — Optimistic UI ───────────────────────────────────────── */

  addProduct: async (p) => {
    const previousProducts = get().products;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticProduct: Product = {
      id: tempId,
      ...p,
    };
    set({ products: [optimisticProduct, ...previousProducts] });

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się dodać pozycji.");
      const data = (await res.json()) as { product: Product };
      set({ products: get().products.map((x) => (x.id === tempId ? data.product : x)) });
      return data.product;
    } catch (err) {
      set({ products: previousProducts });
      throw err;
    }
  },

  updateProduct: async (id, patch) => {
    const previousProducts = get().products;
    set({
      products: previousProducts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować pozycji.");
      const data = (await res.json()) as { product: Product };
      set({ products: get().products.map((p) => (p.id === id ? data.product : p)) });
      return data.product;
    } catch (err) {
      set({ products: previousProducts });
      throw err;
    }
  },

  deleteProduct: async (id) => {
    const previousProducts = get().products;
    set({ products: previousProducts.filter((p) => p.id !== id) });

    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw await apiError(res, "Nie udało się usunąć pozycji.");
    } catch (err) {
      set({ products: previousProducts });
      throw err;
    }
  },

  /* ── Faktury — Optimistic UI ────────────────────────────────────────── */

  addInvoice: async (inv) => {
    const previousInvoices = get().invoices;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimisticInvoice: Invoice = {
      id: tempId,
      createdAt: new Date().toISOString(),
      ...inv,
    };
    set({ invoices: [optimisticInvoice, ...previousInvoices] });

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inv),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się zapisać faktury.");
      const data = (await res.json()) as { invoice: Invoice };
      set({ invoices: get().invoices.map((x) => (x.id === tempId ? data.invoice : x)) });
      return data.invoice;
    } catch (err) {
      set({ invoices: previousInvoices });
      throw err;
    }
  },

  updateInvoice: async (id, patch) => {
    const previousInvoices = get().invoices;
    const existing = previousInvoices.find((i) => i.id === id);
    if (!existing) throw new Error("Nie znaleziono faktury.");

    set({
      invoices: previousInvoices.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });

    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...existing, ...patch }),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować faktury.");
      const data = (await res.json()) as { invoice: Invoice };
      set({ invoices: get().invoices.map((i) => (i.id === id ? data.invoice : i)) });
      return data.invoice;
    } catch (err) {
      set({ invoices: previousInvoices });
      throw err;
    }
  },

  deleteInvoice: async (id) => {
    const previousInvoices = get().invoices;
    set({ invoices: previousInvoices.filter((i) => i.id !== id) });

    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (!res.ok) throw await apiError(res, "Nie udało się usunąć faktury.");
    } catch (err) {
      set({ invoices: previousInvoices });
      throw err;
    }
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

  approveInvoices: async (ids, status = "approved") => {
    const previousInvoices = get().invoices;
    set({
      invoices: previousInvoices.map((inv) =>
        ids.includes(inv.id)
          ? {
              ...inv,
              approvalStatus: status,
              approvedAt: status === "approved" ? new Date().toISOString() : null,
            }
          : inv
      ),
    });

    try {
      const res = await fetch("/api/invoices/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: ids, status }),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się zaktualizować statusu akceptacji faktur.");
      const data = await res.json();
      if (Array.isArray(data.invoices)) {
        const map = new Map(data.invoices.map((i: Invoice) => [i.id, i]));
        set({
          invoices: get().invoices.map((inv) => (map.has(inv.id) ? (map.get(inv.id) as Invoice) : inv)),
        });
      }
    } catch (err) {
      set({ invoices: previousInvoices });
      throw err;
    }
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

export function nextInvoiceNumber(invoices: Invoice[], type: "sale" | "purchase", isCorrection?: boolean): string {
  const prefix = isCorrection ? "KOR" : (type === "sale" ? "FV" : "FZ");
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
  draft: { label: "Szkic", color: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20", dot: "bg-zinc-400" },
  issued: { label: "Wystawiona", color: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20", dot: "bg-sky-500" },
  overdue: { label: "Przeterminowana", color: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20", dot: "bg-rose-500" },
  paid: { label: "Opłacona", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20", dot: "bg-emerald-500" },
  ksef_queued: { label: "KSeF: w kolejce", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20", dot: "bg-amber-500" },
  ksef_sent: { label: "Wysłana do KSeF", color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20", dot: "bg-indigo-500" },
  ksef_active: { label: "KSeF: aktywna", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20", dot: "bg-emerald-500" },
  ksef_rejected: { label: "KSeF: odrzucona", color: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20", dot: "bg-rose-500" },
};
