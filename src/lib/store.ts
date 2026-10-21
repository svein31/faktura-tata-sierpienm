"use client";

import { useContext } from "react";
import { createStore, useStore, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { AppStoreContext } from "./app-store-context";
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
import { companyKsefSettings, resolveSelectedCompany } from "./company-selection";
import { PURCHASE_INVOICE_READ_ONLY } from "./invoice-policy";
import { bootstrapUrl, createSingleFlight, type DataMode } from "./data-load-policy";

/**
 * Store = cache UI. Backend (Prisma/SQLite przez API) jest JEDYNYM źródłem
 * prawdy — brak persist/localStorage i brak seedu. Bootstrap odbywa się raz,
 * po zalogowaniu (GET /api/data) w komponencie <DataBootstrap />.
 */

export interface AppState {
  /** true po udanym bootstrapie z backendu. */
  hydrated: boolean;
  dataMode: DataMode;
  dataCompanyId: string | null;
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
  invoiceEditorSession: number;

  bootstrap: (mode?: DataMode, companyId?: string) => Promise<void>;
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

  setDraft: (invoice: Invoice | null, isNew: boolean, preserveSession?: boolean) => void;

  fetchNotifications: (signal?: AbortSignal) => Promise<{ unread: number }>;
  markNotificationRead: (id: string, read: boolean) => Promise<void>;
  updateNotificationPrefs: (patch: Partial<NotificationPrefs>) => Promise<NotificationPrefs>;
}

/** Rzuca błąd z komunikatem z odpowiedzi API (lub ogólnym). */
export async function apiError(res: Response, fallback: string): Promise<Error> {
  let message = fallback;
  try {
    const data = (await res.json()) as { error?: string; message?: string; fieldErrors?: Record<string,string> };
    if (typeof data.error === "string" && data.error) message = data.error;
    else if (typeof data.message === "string" && data.message) message = data.message;
    if (data.fieldErrors && typeof data.fieldErrors === "object") return Object.assign(new Error(message), { fieldErrors: data.fieldErrors });
  } catch {
    /* ignore */
  }
  return new Error(message);
}

const EMPTY_PREFS: NotificationPrefs = { browserEnabled: false, soundEnabled: true };

export type AppBootstrapData = {
  dataMode?: DataMode;
  dataCompanyId?: string;
  company: CompanyProfile | null;
  companies?: CompanyProfile[];
  ksef: KsefSettings | null;
  contractors: Contractor[];
  products: Product[];
  invoices: Invoice[];
  notifications: AppNotification[];
  notificationPrefs: NotificationPrefs;
};

/** Identical selection rules for an HTTP bootstrap and a request-local SSR seed. */
function bootstrapState(data: AppBootstrapData, selectedId: string | null) {
  const companies = data.companies ?? (data.company ? [data.company] : []);
  const company = resolveSelectedCompany(companies, selectedId, data.company);
  return {
    company, companies, selectedCompanyId: company?.id ?? null,
    ksef: companyKsefSettings(company, data.ksef),
    contractors: data.contractors, products: data.products, invoices: data.invoices,
    notifications: data.notifications, notificationPrefs: data.notificationPrefs ?? EMPTY_PREFS,
    hydrated: true, authError: false,
    dataCompanyId: data.dataCompanyId ?? null,
  };
}

const appStateCreator: StateCreator<AppState> = (set, get) => {
  // Each store owns its request fence, including isolated server renders.
  let dataRequestVersion = 0;
  const requests = createSingleFlight<{ response: Response; data: AppBootstrapData & { error?: string } }>();
  const read = (mode: DataMode, companyId?: string) => requests.run(bootstrapUrl(mode, companyId), async () => {
    const response = await fetch(bootstrapUrl(mode, companyId), { cache: "no-store", signal: AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  });
  return ({
  hydrated: false,
  dataMode: "full",
  dataCompanyId: null,
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
  invoiceEditorSession: 0,

  /* ── Bootstrap ──────────────────────────────────────────────────────── */

  bootstrap: async (mode = "full", companyId) => {
    const requestVersion = ++dataRequestVersion;
    const { response: res, data } = await read(mode, companyId);
    if (requestVersion !== dataRequestVersion) return;
    if (res.status === 401) {
      set({ hydrated: true, authError: true, contractors: [], products: [], invoices: [] });
      return;
    }
    if (!res.ok) {
      if (res.status === 403) set({ company: null, selectedCompanyId: null, contractors: [], products: [], invoices: [], hydrated: false });
      throw new Error(data.error || "Nie udało się pobrać danych.");
    }
    if (requestVersion !== dataRequestVersion) return;
    const companies = data.companies ?? (data.company ? [data.company] : []);
    const defaultComp = resolveSelectedCompany(companies, get().selectedCompanyId, data.company);

    set({
      company: defaultComp,
      companies,
      selectedCompanyId: defaultComp?.id ?? null,
      ksef: companyKsefSettings(defaultComp, data.ksef),
      contractors: data.contractors,
      products: data.products,
      invoices: data.invoices,
      notifications: data.notifications,
      notificationPrefs: data.notificationPrefs ?? EMPTY_PREFS,
      hydrated: true,
      dataMode: mode,
      dataCompanyId: companyId ?? null,
      authError: false,
    });
  },

  revalidate: async () => {
    if (!get().hydrated) return; // bootstrap not done yet
    const requestVersion = ++dataRequestVersion;
    try {
      const { response: res, data } = await read(get().dataMode, get().dataCompanyId ?? undefined);
      if (requestVersion !== dataRequestVersion) return;
      if (!res.ok) {
        if (res.status === 401) set({ authError: true, contractors: [], products: [], invoices: [] });
        if (res.status === 403) set({ company: null, selectedCompanyId: null, contractors: [], products: [], invoices: [], hydrated: false });
        return;
      }
      const companies = data.companies ?? (data.company ? [data.company] : []);
      const defaultComp = resolveSelectedCompany(companies, get().selectedCompanyId, data.company);

      set({
        company: defaultComp,
        companies,
        selectedCompanyId: defaultComp?.id ?? null,
        ksef: companyKsefSettings(defaultComp, data.ksef),
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

  resetData: () => {
    dataRequestVersion++;
    requests.clear();
    set({
      hydrated: false,
      dataMode: "full",
      dataCompanyId: null,
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
    });
  },

  /* ── Zarządzanie spółkami (Multi-Company) — Optimistic UI ────────────────── */

  fetchCompanies: async () => {
    const { response, data } = await read("shell");
    if (!response.ok) throw new Error(data.error || "Nie udało się pobrać listy firm.");
    const companies = data.companies ?? [];
    const defaultComp = resolveSelectedCompany(companies, get().selectedCompanyId);
    set({
      companies,
      company: defaultComp,
      selectedCompanyId: defaultComp?.id ?? null,
    });
    return companies;
  },

  addCompany: async (c) => {
    dataRequestVersion++; requests.clear();
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
      company: optimisticCompany,
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
      const finalDefault = resolveSelectedCompany(finalList, get().selectedCompanyId?.startsWith('temp_') ? data.company.id : get().selectedCompanyId);

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
    const optDefaultComp = resolveSelectedCompany(optimisticList, get().selectedCompanyId);

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

      const finalList = get().companies.map((x) => (x.id === id ? { ...x, ...data.company } : x));
      const finalDefault = resolveSelectedCompany(finalList, get().selectedCompanyId?.startsWith('temp_') ? data.company.id : get().selectedCompanyId);

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
    const optDefaultComp = resolveSelectedCompany(optimisticList, get().selectedCompanyId);

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
    dataRequestVersion++; requests.clear();
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

  setSelectedCompanyId: (id) => {
    const company = resolveSelectedCompany(get().companies, id);
    const changed = company?.id !== get().selectedCompanyId;
    if (changed) { dataRequestVersion++; requests.clear(); }
    set({ company, selectedCompanyId: company?.id ?? null, ksef: companyKsefSettings(company, get().ksef),
      ...(changed && get().dataCompanyId ? { contractors: [], products: [], invoices: [] } : {}) });
  },

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
    const companyId=get().company?.id;
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
        body: JSON.stringify({...optimistic,companyId}),
      });
      if (!res.ok) throw await apiError(res, "Nie udało się zapisać ustawień KSeF.");
      const data = (await res.json()) as { ksef: KsefSettings };
      if(get().company?.id===companyId) {
        const companies=get().companies.map(c=>c.id===companyId?{...c,ksefEnvironment:data.ksef.environment,ksefTokenSet:data.ksef.tokenSet}:c);
        set({companies,company:companies.find(c=>c.id===companyId)||get().company,ksef:data.ksef});
      }
      return data.ksef;
    } catch (err) {
      if(get().company?.id===companyId)set({ ksef: current });
      throw err;
    }
  },

  /* ── Kontrahenci — Optimistic UI ─────────────────────────────────────── */

  addContractor: async (c) => {
    c = { ...c, companyId: c.companyId ?? get().selectedCompanyId };
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
    p = { ...p, companyId: p.companyId ?? get().selectedCompanyId };
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
    if (get().invoices.find((i) => i.id === id)?.type === 'purchase') throw new Error(PURCHASE_INVOICE_READ_ONLY);
    const previousInvoices = get().invoices;
    // Catalog-only route reads deliberately omit the invoice list. An editor
    // keeps its authorised detail snapshot, including the original version.
    const existing = previousInvoices.find((i) => i.id === id)
      ?? (!get().draftInvoiceIsNew && get().draftInvoice?.id === id ? get().draftInvoice : null);
    if (!existing) throw new Error("Nie znaleziono faktury.");
    if (existing.type === "purchase") throw new Error(PURCHASE_INVOICE_READ_ONLY);

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
    if (get().invoices.find((i) => i.id === id)?.type === 'purchase') throw new Error(PURCHASE_INVOICE_READ_ONLY);
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

  setDraft: (invoice, isNew, preserveSession = false) => set(state => ({ draftInvoice: invoice, draftInvoiceIsNew: isNew, invoiceEditorSession: preserveSession ? state.invoiceEditorSession : state.invoiceEditorSession + 1 })),

  /* ── Powiadomienia ──────────────────────────────────────────────────── */

  fetchNotifications: async (signal) => {
    const res = await fetch("/api/notifications?limit=50", { cache: "no-store", signal });
    if (signal?.aborted) return { unread: get().notifications.filter(n=>!n.read).length };
    if (res.status === 401) {
      set({ hydrated: true, authError: true });
      return { unread: 0 };
    }
    if (!res.ok) throw await apiError(res, "Nie udało się pobrać powiadomień.");
    const data = (await res.json()) as { notifications: AppNotification[]; unread: number };
    if (signal?.aborted) return { unread: get().notifications.filter(n=>!n.read).length };
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
  });
};

/** Never share this instance between server requests. */
export function createAppStore(initialBootstrap: AppBootstrapData | null = null): StoreApi<AppState> {
  return createStore<AppState>((set, get, api) => ({
    ...appStateCreator(set, get, api),
    ...(initialBootstrap ? { ...bootstrapState(initialBootstrap, null), dataMode: initialBootstrap.dataMode ?? "list" as const } : {}),
  }));
}

let browserStore = createAppStore();
let browserOwner: string | null = null;

/** A warm app navigation keeps its company; a new account gets a fresh store. */
export function browserAppStore(ownerId: string, initialBootstrap: AppBootstrapData | null) {
  if (typeof window === "undefined") throw new Error("Browser store cannot be selected on the server.");
  if (browserOwner !== ownerId || !browserStore.getState().hydrated) {
    browserStore = createAppStore(initialBootstrap);
    browserOwner = ownerId;
  }
  return browserStore;
}

const identity = (state: AppState) => state;
function useScopedAppStore<T = AppState>(selector: (state: AppState) => T = identity as (state: AppState) => T, equalityFn?: (a: T, b: T) => boolean) {
  const scoped = useContext(AppStoreContext);
  return useStore(scoped ?? browserStore, selector, equalityFn);
}

// Keep the existing imperative API for action handlers and isolated fixtures.
// SSR selectors always read the provider's request-local instance instead.
export const useAppStore: UseBoundStore<StoreApi<AppState>> = Object.assign(useScopedAppStore, {
  getState: () => browserStore.getState(),
  getInitialState: () => browserStore.getInitialState(),
  setState: (...args: Parameters<StoreApi<AppState>["setState"]>) => browserStore.setState(...args),
  subscribe: (...args: Parameters<StoreApi<AppState>["subscribe"]>) => browserStore.subscribe(...args),
  destroy: () => browserStore.destroy(),
});

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

