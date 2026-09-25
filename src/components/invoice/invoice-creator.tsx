"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  AlertOctagon,
  Building2,
  CheckCircle2,
  Eye,
  FileCode2,
  FileJson2,
  Plus,
  Printer,
  Save,
  Send,
  ShieldCheck,
  UserPlus,
  Mail,
  Info,
  TrendingUp,
  Copy,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { useAppStore } from "@/lib/store";
import { DEFAULT_INVOICE_PATTERN, invoicePrefix, nextFormattedInvoiceNumber } from "@/lib/invoice-numbering";
import { getContractor } from "@/lib/store";
import { addDaysISO, todayISO } from "@/lib/utils";
import { formatMoney, invoiceTotals, round2 } from "@/lib/format";
import { currencyNames } from "@/lib/i18n";
import { isValidNipFormat, normalizeNip, formatNip } from "@/lib/validation";
import { EMPTY_COMPANY } from "@/lib/types";
import type {
  CompanyProfile,
  Contractor,
  Currency,
  Invoice,
  InvoiceLanguage,
  InvoiceType,
  PaymentMethod,
} from "@/lib/types";
import { InvoicePreview } from "./invoice-preview";
import { LineItemsEditor, newLine } from "./line-items";
import { NipLookup } from "./nip-lookup";
import { ViesLookup } from "./vies-lookup";
import { CompanyModal } from "@/components/company/company-modal";
import { ShortcutsModal } from "./shortcuts-modal";
import { InfoTooltip, HelpTooltip } from "@/components/ui/tooltip";
import { useInvoiceExports } from "@/lib/invoice-actions";

export const DRAFT_KEY = "fakturo_invoice_creator_draft";

interface NewContractorDraft {
  name: string;
  nip: string;
  street: string;
  city: string;
  postal: string;
  country: string;
  iban: string;
  bankName: string;
  isVatPayer: boolean;
}

const emptyNewContractor: NewContractorDraft = {
  name: "",
  nip: "",
  street: "",
  city: "",
  postal: "",
  country: "PL",
  iban: "",
  bankName: "",
  isVatPayer: true,
};

interface FormState {
  number: string;
  type: InvoiceType;
  isProforma?: boolean;
  sellerCompanyId: string;
  contractorId: string;
  useNewContractor: boolean;
  newContractor: NewContractorDraft;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  dueTouched: boolean;
  paymentMethod: PaymentMethod;
  paymentTermDays: number;
  currency: Currency;
  language: InvoiceLanguage;
  notes: string;
  isOffline?: boolean;
  offlineReason?: string;
  offlineDeadline?: string;
  lines: ReturnType<typeof newLine>[];
  // Faktura korygująca
  isCorrection?: boolean;
  correctionReason?: string;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  originalIssueDate?: string;
  originalKsefNumber?: string;
  // Faktura cykliczna
  isRecurring?: boolean;
  recurringInterval?: string;
  recurringNextDate?: string;
  recurringAutoSend?: boolean;
}

function formFromInvoice(inv: Invoice, defaultCompanyId: string = ""): FormState {
  return {
    number: inv.number,
    type: inv.type,
    isProforma: inv.isProforma ?? false,
    sellerCompanyId: inv.sellerCompanyId || defaultCompanyId,
    contractorId: inv.contractorId,
    useNewContractor: false,
    newContractor: emptyNewContractor,
    issueDate: inv.issueDate,
    saleDate: inv.saleDate,
    dueDate: inv.dueDate,
    dueTouched: true,
    paymentMethod: inv.paymentMethod,
    paymentTermDays: inv.paymentTermDays,
    currency: inv.currency,
    language: inv.language,
    notes: inv.notes ?? "",
    isOffline: inv.isOffline ?? false,
    offlineReason: inv.offlineReason ?? "",
    offlineDeadline: inv.offlineDeadline?.slice(0,10) ?? "",
    lines: inv.lines.map((l) => ({ ...l })),
    isCorrection: inv.isCorrection ?? false,
    correctionReason: inv.correctionReason ?? "",
    originalInvoiceId: inv.originalInvoiceId ?? "",
    originalInvoiceNumber: inv.originalInvoiceNumber ?? "",
    originalIssueDate: inv.originalIssueDate ?? "",
    originalKsefNumber: inv.originalKsefNumber ?? "",
    isRecurring: inv.isRecurring ?? false,
    recurringInterval: inv.recurringInterval ?? "monthly",
    recurringNextDate: inv.recurringNextDate ?? addDaysISO(todayISO(), 30),
    recurringAutoSend: inv.recurringAutoSend ?? false,
  };
}

function freshForm(defaultCompanyId: string = ""): FormState {
  const today = todayISO();
  return {
    number: "",
    type: "sale",
    isProforma: false,
    sellerCompanyId: defaultCompanyId,
    contractorId: "",
    useNewContractor: false,
    newContractor: emptyNewContractor,
    issueDate: today,
    saleDate: today,
    dueDate: addDaysISO(today, 14),
    dueTouched: false,
    paymentMethod: "transfer",
    paymentTermDays: 14,
    currency: "PLN",
    language: "PL",
    notes: "",
    isOffline: false,
    offlineReason: "",
    offlineDeadline: "",
    lines: [newLine()],
    isCorrection: false,
    correctionReason: "",
    originalInvoiceId: "",
    originalInvoiceNumber: "",
    originalIssueDate: "",
    originalKsefNumber: "",
    isRecurring: false,
    recurringInterval: "monthly",
    recurringNextDate: addDaysISO(today, 30),
    recurringAutoSend: false,
  };
}

/** Dane faktury bez id/createdAt — id nadaje backend (źródło prawdy). */
type InvoicePayload = Omit<Invoice, "id" | "createdAt"> & { autoNumber?: boolean };

export function InvoiceCreator() {
  const router = useRouter();
  const toast = useToast();
  const store = useAppStore();
  const { contractors: allContractors, products: allProducts, company, companies, invoices, draftInvoice, draftInvoiceIsNew, ksef } = store;
  const ksefEnv = ksef?.environment ?? "demo";

  const defaultCompany =
    companies.find((c) => c.id === store.selectedCompanyId) ??
    companies.find((c) => c.isDefault) ??
    companies[0] ??
    company ??
    EMPTY_COMPANY;

  const [form, setForm] = React.useState<FormState>(() =>
    draftInvoice ? { ...formFromInvoice(draftInvoice, defaultCompany.id), number: draftInvoiceIsNew ? "" : draftInvoice.number } : freshForm(defaultCompany.id)
  );

  const contractors = allContractors.filter(c => !c.companyId || c.companyId === form.sellerCompanyId);
  const products = allProducts.filter(p => !p.companyId || p.companyId === form.sellerCompanyId);

  const searchParams = useSearchParams();
  const [tabConflict, setTabConflict] = React.useState(false);
  const [nbpRate, setNbpRate] = React.useState<{ rate: number; tableNumber: string; effectiveDate: string; source: string } | null>(null);
  const [isManualRate, setIsManualRate] = React.useState(false);
  const [manualRateInput, setManualRateInput] = React.useState("");
  const [manualJustification, setManualJustification] = React.useState("");
  const [selectedBankAccountId, setSelectedBankAccountId] = React.useState<string>("");
  const [newContractorTaxIdType, setNewContractorTaxIdType] = React.useState<"nip" | "vat_eu" | "tin" | "none">("nip");
  const [shortcutsModalOpen, setShortcutsModalOpen] = React.useState(false);

  // Multi-tab conflict listener
  React.useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    try {
      const channel = new BroadcastChannel("fakturo_invoice_creator");
      const tabId = Math.random().toString(36).substring(7);
      channel.postMessage({ type: "TAB_PING", tabId });
      channel.onmessage = (e) => {
        if (e.data && e.data.tabId !== tabId) {
          if (e.data.type === "TAB_PING") {
            channel.postMessage({ type: "TAB_PONG", tabId });
            setTabConflict(true);
          } else if (e.data.type === "TAB_PONG") {
            setTabConflict(true);
          }
        }
      };
      return () => {
        channel.close();
      };
    } catch {}
  }, []);

  // Clone from existing invoice (?cloneFrom=<id>)
  React.useEffect(() => {
    const cloneId = searchParams.get("cloneFrom");
    if (cloneId && invoices.length > 0) {
      const src = invoices.find((i) => i.id === cloneId);
      if (src) {
        setForm({
          ...formFromInvoice(src, defaultCompany.id),
          sellerCompanyId: defaultCompany.id,
          number: "",
          isCorrection: false,
          correctionReason: "",
          originalInvoiceId: "",
          originalInvoiceNumber: "",
          originalIssueDate: "",
          originalKsefNumber: "",
          issueDate: todayISO(),
          saleDate: todayISO(),
          dueDate: addDaysISO(todayISO(), src.paymentTermDays || 14),
          dueTouched: false,
        });
        toast("info", "Sklonowano dane faktury", `Utworzono nowy dokument na wzór ${src.number}`);
      }
    }
  }, [searchParams, invoices, defaultCompany.id]);

  // NBP rate fetcher zgodny z art. 31a ust. 1 i 2
  const fetchNbpRate = React.useCallback(async (curr: string, issueDate: string, saleDate: string) => {
    if (curr === "PLN") {
      setNbpRate(null);
      return;
    }
    try {
      const rule = (issueDate && saleDate && issueDate < saleDate) ? "issue_before_tax_point" : "standard";
      const res = await fetch(`/api/nbp?currency=${curr}&issueDate=${issueDate}&saleDate=${saleDate || issueDate}&rule=${rule}`);
      if (res.ok) {
        const data = await res.json();
        setNbpRate(data);
        if (!isManualRate) {
          setManualRateInput(data.rate ? String(data.rate) : "");
        }
      }
    } catch {
      // Ignored
    }
  }, [isManualRate]);

  React.useEffect(() => {
    if (form.currency !== "PLN") {
      fetchNbpRate(form.currency, form.issueDate, form.saleDate);
    } else {
      setNbpRate(null);
    }
  }, [form.currency, form.issueDate, form.saleDate, fetchNbpRate]);

  // ── Autosave stanu roboczego w localStorage ──
  const DRAFT_KEY = `fakturo_local_draft_v3_${defaultCompany.id}`;
  const [autosaveStatus, setAutosaveStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const [hasRecoverableDraft, setHasRecoverableDraft] = React.useState<boolean>(false);
  const [recoverableDate, setRecoverableDate] = React.useState<string>("");

  React.useEffect(() => {
    if (!draftInvoice || draftInvoiceIsNew) {
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.form && (parsed.form.contractorId || parsed.form.lines?.length > 1 || parsed.form.lines?.[0]?.name)) {
            setHasRecoverableDraft(true);
            setRecoverableDate(parsed.savedAt ? new Date(parsed.savedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "");
          }
        }
      } catch {}
    }
  }, [draftInvoice, draftInvoiceIsNew]);

  React.useEffect(() => {
    const isKsef = Boolean(draftInvoice?.ksefNumber || draftInvoice?.ksef?.number);
    if (isKsef) return;
    setAutosaveStatus("saving");
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, savedAt: new Date().toISOString() }));
        setAutosaveStatus("saved");
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [form, draftInvoice]);

  const handleRecoverDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.form) {
          if (parsed.form.sellerCompanyId === defaultCompany.id) setForm(parsed.form);
          toast("success", "Przywrócono wersję roboczą", `Zapisana o: ${recoverableDate}`);
        }
      }
    } catch {}
    setHasRecoverableDraft(false);
  };

  const handleDiscardRecoverableDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setHasRecoverableDraft(false);
  };
  const [saving, setSaving] = React.useState<"save" | "ksef" | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string,string>>({});
  const [companyModalOpen, setCompanyModalOpen] = React.useState(false);

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setFieldErrors(current => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };

  const showValidation = (messages: string[], fromServer?: Record<string,string>) => {
    const fields: Record<string,string> = { ...fromServer };
    if (!form.issueDate) fields.issueDate = "Podaj datę wystawienia.";
    if (!form.useNewContractor && !form.contractorId) fields.contractorId = "Wybierz kontrahenta.";
    if (form.isOffline && !form.offlineReason) fields.offlineReason = "Wybierz powód.";
    if (form.isOffline && !form.offlineDeadline) fields.offlineDeadline = "Podaj termin przesłania.";
    setErrors(messages);
    setFieldErrors(fields);
    const first = Object.keys(fields)[0];
    if (first) requestAnimationFrame(() => document.getElementById(`invoice-${first}`)?.focus());
  };

  // Synchronizacja firmy domyślnej po załadowaniu danych
  React.useEffect(() => {
    if (!form.sellerCompanyId && defaultCompany.id) {
      setForm((f) => ({ ...f, sellerCompanyId: defaultCompany.id }));
    }
  }, [form.sellerCompanyId, defaultCompany.id]);

  React.useEffect(() => {
    if ((!draftInvoice || draftInvoiceIsNew) && store.selectedCompanyId) {
      setForm((f) => ({ ...f, sellerCompanyId: store.selectedCompanyId! }));
      setSelectedBankAccountId("");
    }
  }, [store.selectedCompanyId, draftInvoice, draftInvoiceIsNew]);

  const effectiveSellerCompany: CompanyProfile = defaultCompany ?? EMPTY_COMPANY;

  const editing = !!draftInvoice && !draftInvoiceIsNew;
  const suggestedNumber = nextFormattedInvoiceNumber(
    effectiveSellerCompany.invoiceNumberPattern || DEFAULT_INVOICE_PATTERN,
    invoices.filter(inv => inv.sellerCompanyId === effectiveSellerCompany.id).map(inv => inv.number),
    form.issueDate || todayISO(),
    invoicePrefix(form.type, form.isCorrection, form.isProforma),
  );
  const invoiceNumber = form.number || suggestedNumber;
  const isPurchase = form.type === "purchase";
  const isKsefRegistered = Boolean(draftInvoice?.ksefNumber || draftInvoice?.ksef?.number);

  const selectedContractor = form.useNewContractor
    ? undefined
    : getContractor(contractors, form.contractorId);

  const effectiveContractor: Contractor | undefined = form.useNewContractor
    ? {
        id: "temp",
        name: form.newContractor.name,
        nip: form.newContractor.nip,
        address: {
          street: form.newContractor.street,
          city: form.newContractor.city,
          postal: form.newContractor.postal,
          country: form.newContractor.country,
        },
        iban: form.newContractor.iban,
        bankName: form.newContractor.bankName,
        isVatPayer: form.newContractor.isVatPayer,
        createdAt: new Date().toISOString(),
      }
    : selectedContractor;

  const previewInvoice: Invoice = {
    id: draftInvoice?.id ?? "preview",
    number: invoiceNumber,
    type: form.type,
    status: "draft",
    isProforma: form.isProforma,
    sellerCompanyId: effectiveSellerCompany.id || undefined,
    sellerCompany: effectiveSellerCompany,
    contractorId: form.contractorId,
    issueDate: form.issueDate,
    saleDate: form.saleDate,
    dueDate: form.dueDate,
    currency: form.currency,
    language: form.language,
    paymentMethod: form.paymentMethod,
    paymentTermDays: form.paymentTermDays,
    notes: form.notes,
    lines: form.lines,
    createdAt: new Date().toISOString(),
    isCorrection: form.isCorrection,
    correctionReason: form.correctionReason,
    originalInvoiceId: form.originalInvoiceId,
    originalInvoiceNumber: form.originalInvoiceNumber,
    originalIssueDate: form.originalIssueDate,
    originalKsefNumber: form.originalKsefNumber,
    isRecurring: form.isRecurring,
    recurringInterval: form.recurringInterval,
    recurringNextDate: form.recurringNextDate,
    recurringAutoSend: form.recurringAutoSend,
  };

  const exports = useInvoiceExports(previewInvoice, effectiveContractor, effectiveSellerCompany);
  const totals = invoiceTotals(previewInvoice);

  const onTermChange = (days: number) => {
    set({ paymentTermDays: days });
    if (!form.dueTouched) {
      set({ dueDate: addDaysISO(form.issueDate || todayISO(), days) });
    }
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!form.issueDate) errs.push("Data wystawienia jest wymagana.");
    if (form.isOffline && (!form.offlineReason || !form.offlineDeadline)) errs.push("Tryb offline wymaga wskazania przyczyny i terminu przesłania.");
    if (form.isCorrection && !form.correctionReason?.trim()) {
      errs.push("Faktura korygująca wymaga podania przyczyny korekty.");
    }
    if (form.useNewContractor) {
      const nc = form.newContractor;
      if (!nc.name.trim()) errs.push("Podaj nazwę nowego kontrahenta.");
      if (newContractorTaxIdType === "nip" && !isValidNipFormat(nc.nip)) {
        errs.push("Nowy kontrahent: Polski NIP ma nieprawidłową sumę kontrolną.");
      } else if (newContractorTaxIdType === "vat_eu" && !nc.nip.trim()) {
        errs.push("Nowy kontrahent: Podaj numer VAT UE.");
      } else if (newContractorTaxIdType === "tin" && !nc.nip.trim()) {
        errs.push("Nowy kontrahent: Podaj zagraniczny identyfikator podatkowy (TIN / Tax ID).");
      }
      if (!nc.street.trim() || !nc.city.trim() || !nc.postal.trim()) errs.push("Nowy kontrahent: uzupełnij adres.");
    } else if (!form.contractorId) {
      errs.push("Wybierz kontrahenta (lub dodaj nowego).");
    }
    if (companies.length === 0 && !effectiveSellerCompany?.companyName && !effectiveSellerCompany?.nip) {
      errs.push("Dodaj profil firmy Sprzedawcy (w 'Moje Firmy'), aby Twoje dane pojawiły się na fakturze.");
    }
    const validLines = form.lines.filter((l) => l.name.trim() && l.quantity > 0);
    if (validLines.length === 0) errs.push("Dodaj co najmniej jedną pozycję z nazwą i ilością.");
    if (form.lines.some((l) => l.quantity < 0 || l.netPrice < 0)) errs.push("Ilość i cena nie mogą być ujemne.");

    // Walidacja kursu walutowego dla walut obcych (art. 31a ustawy o VAT)
    if (form.currency !== "PLN") {
      if (isManualRate) {
        const parsedRate = parseFloat(manualRateInput.replace(",", "."));
        if (isNaN(parsedRate) || parsedRate <= 0) {
          errs.push("Wpisz poprawny kurs waluty (większy od zera).");
        }
        if (!manualJustification.trim()) {
          errs.push("Wpisz uzasadnienie zastosowania własnego kursu waluty (wymóg art. 31a ustawy o VAT).");
        }
      } else if (!nbpRate) {
        errs.push("Pobierz oficjalny kurs waluty z NBP dla tego dokumentu.");
      }
    }

    return errs;
  };

  /** Buduje payload faktury; nowego kontrahenta zapisuje przez API (zwraca id z backendu). */
  const buildInvoice = async (status: Invoice["status"]): Promise<InvoicePayload> => {
    let contractorId = form.contractorId;
    if (form.useNewContractor) {
      const nc = form.newContractor;
      const c = await store.addContractor({
        name: nc.name.trim(),
        nip: newContractorTaxIdType === "nip" ? normalizeNip(nc.nip) : nc.nip.trim(),
        taxId: newContractorTaxIdType !== "nip" && newContractorTaxIdType !== "none" ? nc.nip.trim() : undefined,
        taxIdType: newContractorTaxIdType,
        country: nc.country.trim() || "PL",
        regon: undefined,
        address: {
          street: nc.street.trim(),
          city: nc.city.trim(),
          postal: nc.postal.trim(),
          country: nc.country.trim() || "PL",
        },
        iban: nc.iban.trim() || undefined,
        bankName: nc.bankName.trim() || undefined,
        isVatPayer: nc.isVatPayer,
        notes: undefined,
      });
      contractorId = c.id;
    }

    const effectiveRate = form.currency !== "PLN"
      ? (isManualRate ? parseFloat(manualRateInput.replace(",", ".")) || null : nbpRate?.rate || null)
      : null;

    const totalsCalc = invoiceTotals({ lines: form.lines as any });
    const netPln = effectiveRate ? round2(totalsCalc.net * effectiveRate) : null;
    const vatPln = effectiveRate ? round2(totalsCalc.vat * effectiveRate) : null;
    const grossPln = effectiveRate ? round2(totalsCalc.gross * effectiveRate) : null;

    const chosenBankAccount = effectiveSellerCompany?.bankAccounts?.find((b: any) => b.id === selectedBankAccountId);

    const base: InvoicePayload = {
      number: invoiceNumber,
      type: form.type,
      status,
      sellerCompanyId: effectiveSellerCompany.id || undefined,
      autoNumber: !form.number && (!draftInvoice || draftInvoiceIsNew),
      contractorId,
      issueDate: form.issueDate || todayISO(),
      saleDate: form.saleDate || form.issueDate || todayISO(),
      dueDate: form.dueDate || addDaysISO(form.issueDate || todayISO(), form.paymentTermDays),
      currency: form.currency,
      language: form.language,
      paymentMethod: form.paymentMethod,
      paymentTermDays: form.paymentTermDays,
      notes: form.notes.trim() || undefined,
      isOffline: Boolean(form.isOffline),
      offlineReason: form.isOffline ? form.offlineReason : undefined,
      offlineDeadline: form.isOffline && form.offlineDeadline ? new Date(form.offlineDeadline).toISOString() : undefined,
      lines: form.lines
        .filter((l) => l.name.trim() && l.quantity > 0)
        .map((l) => ({ ...l, netPrice: round2(Number(l.netPrice) || 0), quantity: round2(Number(l.quantity) || 0) })),
      isCorrection: form.isCorrection,
      correctionReason: form.correctionReason?.trim() || undefined,
      originalInvoiceId: form.originalInvoiceId || undefined,
      originalInvoiceNumber: form.originalInvoiceNumber || undefined,
      originalIssueDate: form.originalIssueDate || undefined,
      originalKsefNumber: form.originalKsefNumber || undefined,
      isProforma: form.isProforma,
      isRecurring: form.isRecurring,
      recurringInterval: form.recurringInterval,
      recurringNextDate: form.recurringNextDate,
      recurringAutoSend: form.recurringAutoSend,
      // Pola walutowe i kursowe NBP
      exchangeRate: effectiveRate,
      exchangeRateTable: form.currency !== "PLN" ? (isManualRate ? "Kurs własny podatnika" : nbpRate?.tableNumber || null) : null,
      exchangeRateDate: form.currency !== "PLN" ? (isManualRate ? form.issueDate : nbpRate?.effectiveDate || null) : null,
      exchangeRateSource: form.currency !== "PLN" ? (isManualRate ? "Własny kurs podatnika" : nbpRate?.source || null) : null,
      exchangeRateRule: form.currency !== "PLN" ? (isManualRate ? "manual" : (form.issueDate < form.saleDate ? "art_31a_issue_date" : "art_31a_sale_date")) : null,
      exchangeRateJustification: form.currency !== "PLN" && isManualRate ? manualJustification.trim() : null,
      totalNetPln: netPln,
      totalVatPln: vatPln,
      totalGrossPln: grossPln,
      bankAccountId: selectedBankAccountId || null,
      bankAccountSnapshot: chosenBankAccount ? (chosenBankAccount as any) : undefined,
      buyerTaxIdType: form.useNewContractor ? newContractorTaxIdType : (selectedContractor?.taxIdType || "nip"),
      buyerCountry: form.useNewContractor ? form.newContractor.country : (selectedContractor?.country || "PL"),
    };
    return base;
  };

  /** Zapisywanie przez backend — zwraca fakturę z id nadanym przez serwer. */
  const persist = async (inv: InvoicePayload): Promise<Invoice> => {
    if (draftInvoice && !draftInvoiceIsNew) {
      return store.updateInvoice(draftInvoice.id, inv);
    }
    return store.addInvoice(inv);
  };

  const handleSave = async () => {
    const errs = validate();
    showValidation(errs);
    if (errs.length) {
      toast("error", "Nie można zapisać faktury", errs[0]);
      return;
    }
    setSaving("save");
    try {
      const inv = await buildInvoice("issued");
      const saved = await persist(inv);
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast("success", `Zapisano ${form.isProforma ? "fakturę proforma" : "fakturę"} ${saved.number}`, "Dokument oznaczony jako wystawiony.");
      store.setDraft(null, true);
      router.push("/invoices");
    } catch (e) {
      const fields = (e as {fieldErrors?:Record<string,string>}).fieldErrors;
      if (fields) showValidation(Object.values(fields), fields);
      toast("error", "Nie udało się zapisać", e instanceof Error ? e.message : undefined);
      setSaving(null);
    }
  };

  const handleSaveDraft = async () => {
    const errs = validate();
    if (errs.length) {
      showValidation(errs);
      toast("error", "Popraw błędy", errs[0]);
      return;
    }
    try {
      const inv = await buildInvoice("draft");
      const saved = await persist(inv);
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast("info", "Szkic zapisany", saved.number);
      store.setDraft(null, true);
      router.push("/invoices");
    } catch (e) {
      const fields = (e as {fieldErrors?:Record<string,string>}).fieldErrors;
      if (fields) showValidation(Object.values(fields), fields);
      toast("error", "Nie udało się zapisać szkicu", e instanceof Error ? e.message : undefined);
    }
  };

  const handleSendKsef = async () => {
    if (form.isProforma) {
      toast("error", "KSeF: Błąd dokumentu", "Faktura proforma nie jest dokumentem księgowym i nie podlega rejestracji w KSeF.");
      return;
    }
    if (isPurchase) {
      toast("error", "Błąd logiczny", "Faktura zakupowa (FZ) nie może być wysłana do KSeF jako faktura sprzedaży. Faktury zakupowe są odbierane z KSeF.");
      return;
    }
    if (isKsefRegistered) {
      toast("error", "Błąd KSeF", "Ta faktura posiada już nadany numer KSeF i nie może zostać wysłana ponownie.");
      return;
    }
    const errs = validate();
    showValidation(errs);
    if (errs.length) {
      toast("error", "Popraw błędy", errs[0]);
      return;
    }
    setSaving("ksef");
    try {
      const inv = await buildInvoice("issued");
      const saved = await persist(inv);
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      const xmlRes = await import("@/lib/xml");
      const xml = xmlRes.buildFaVatXml(saved, effectiveSellerCompany);
      const res = await fetch("/api/ksef/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml, environment: ksefEnv, invoiceId: saved.id, invoiceNumber: saved.number }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.invoice) {
          store.applyInvoice(data.invoice);
        } else {
          store.setInvoiceKsef(saved.id, {
            number: data.ksefNumber,
            status: data.status ?? "SENT",
            sentAt: data.timestamp ?? new Date().toISOString(),
            environment: ksefEnv,
          });
        }
        toast("success", "Przekazano do KSeF", `${saved.number} → ${data.message || "Przyjęto do kolejki KSeF"}`);
        store.setDraft(null, true);
        router.push("/invoices");
      } else {
        toast("error", "KSeF: odrzucono dokument", data.message ?? "Błąd wysyłki do KSeF.");
        setSaving(null);
      }
    } catch (e) {
      setSaving(null);
      toast("error", "Nie udało się wysłać do KSeF", e instanceof Error ? e.message : undefined);
    }
  };

  // ── Globalne skróty klawiszowe w kreatorze faktury ──
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S -> Zapisz wersję roboczą (szkic)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveDraft();
        return;
      }

      // Ctrl/Cmd + Enter -> Wystaw fakturę / Zapisz i wyślij
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isPurchase && !isKsefRegistered && !form.isProforma) {
          handleSendKsef();
        } else {
          handleSave();
        }
        return;
      }

      // Shift + Alt + N lub Ctrl + Alt + N -> Dodaj nową pozycję
      if ((e.altKey && e.shiftKey && e.key.toLowerCase() === "n") || (e.ctrlKey && e.altKey && e.key.toLowerCase() === "n")) {
        e.preventDefault();
        setForm((f) => ({ ...f, lines: [...f.lines, newLine()] }));
        toast("info", "Dodano nową pozycję na fakturze");
        return;
      }

      // Ctrl/Cmd + P -> Drukuj / PDF
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        exports.exportPdf();
        return;
      }

      // Esc -> zamknięcie modalu skrótów
      if (e.key === "Escape" && shortcutsModalOpen) {
        setShortcutsModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [form, handleSave, handleSaveDraft, handleSendKsef, exports, shortcutsModalOpen, isPurchase, isKsefRegistered, toast]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      {/* ── Formularz ── */}
      <div className="space-y-5">
        {/* Inline walidacja błędów z wejściem fade+slide-down */}
        <AnimatePresence>
          {errors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              role="alert"
              className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 space-y-1 shadow-xs overflow-hidden"
            >
              <div className="flex items-center gap-2 font-bold text-[13px]">
                <AlertOctagon className="h-4 w-4 shrink-0 text-rose-500" />
                <span>Uzupełnij wymagane pola przed zapisem:</span>
              </div>
              <p className="text-[11.5px]">{errors[0]}{errors.length > 1 ? ` · jeszcze ${errors.length - 1} do poprawy` : ""}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pasek statusu autozapisu */}
        <div className="flex items-center justify-between gap-2 px-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Status wersji roboczej:</span>
            {autosaveStatus === "saving" ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Zapisywanie w tle…
              </span>
            ) : autosaveStatus === "saved" ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Zapisano lokalnie
              </span>
            ) : (
              <span className="text-muted-foreground">Bieżący stan gotowy do edycji</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShortcutsModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shadow-2xs"
              title="Skróty klawiszowe (Ctrl+S, Ctrl+Enter, Shift+Alt+N...)"
            >
              <Keyboard className="h-3 w-3 text-primary" />
              <span className="hidden sm:inline">Skróty klawiszowe</span>
              <kbd className="text-[9px] font-mono bg-muted px-1 rounded border">?</kbd>
            </button>
            {form.isCorrection && (
              <Badge tone="danger" className="text-[11px] font-bold">
                Tryb: KOREKTA (FA-3 / KOR)
              </Badge>
            )}
          </div>
        </div>

        {/* Ostrzeżenie o równoczesnej edycji w innej karcie */}
        {tabConflict && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <b>Wykryto edycję w innej karcie:</b> Ta faktura jest jednocześnie otwarta w innej karcie przeglądarki. Aby uniknąć nadpisania danych, zalecamy edycję tylko w jednej karcie.
            </span>
          </div>
        )}

        {/* Baner przywracania niezapisanej wersji roboczej */}
        {hasRecoverableDraft && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3.5 text-xs text-foreground">
            <div className="flex items-center gap-2.5">
              <Save className="h-4 w-4 text-primary shrink-0" />
              <span>
                Wykryto niezapisaną wersję roboczą faktury z <b>{recoverableDate}</b>. Czy chcesz przywrócić dane?
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={handleRecoverDraft} className="h-7 text-xs px-3 font-semibold">
                Przywróć
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDiscardRecoverableDraft} className="h-7 text-xs px-2.5 text-muted-foreground">
                Odrzuć
              </Button>
            </div>
          </div>
        )}

        {isKsefRegistered && (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-[12.5px] text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-semibold">Faktura zarejestrowana w KSeF (numer: {draftInvoice?.ksefNumber || draftInvoice?.ksef?.number})</p>
              <p className="text-[11.5px] opacity-90 mt-0.5">
                Ten dokument został oficjalnie przetworzony w KSeF. Jego dane skarbowe są nienaruszalne i zablokowane przed ponowną wysyłką.
              </p>
            </div>
          </div>
        )}

        {/* Sekcja faktury korygującej */}
        {form.isCorrection && (
          <Card className="border-rose-500/40 bg-rose-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-rose-700 dark:text-rose-400 text-[15px] flex items-center gap-2">
                Faktura korygująca (KOR)
              </CardTitle>
              <CardDescription>
                Korygujesz fakturę nr <b>{form.originalInvoiceNumber || "—"}</b> z dnia {form.originalIssueDate || "—"}.
                {form.originalKsefNumber ? ` Numer KSeF oryginału: ${form.originalKsefNumber}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-rose-900 dark:text-rose-300 font-semibold">
                  Przyczyna korekty (pole wymagane w schemacie FA(3)) *
                </Label>
                <Input
                  value={form.correctionReason || ""}
                  onChange={(e) => set({ correctionReason: e.target.value })}
                  placeholder="np. Udzielenie rabatu potransakcyjnego, zwrot towaru, korekta ilości"
                  className="bg-card"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {form.isProforma && (
          <div className="flex items-start gap-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-[12px] text-indigo-900 dark:text-indigo-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <div>
              <p className="font-semibold">Tryb: Faktura Proforma (dokument handlowy)</p>
              <p className="text-[11.5px] opacity-90 mt-0.5">
                Faktura proforma nie jest dokumentem księgowym w rozumieniu ustawy o VAT i nie podlega wysyłce do KSeF. Służy jako wezwanie do zapłaty lub oferta handlowa.
              </p>
            </div>
          </div>
        )}

        {isPurchase && (
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 text-[12px] text-blue-700 dark:text-blue-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span>
              <b>Faktura zakupowa (FZ):</b> Dokument kosztowy od zewnętrznego sprzedawcy. Trafia do ewidencji wydatków i zatwierdzenia dla księgowości (nie podlega wysyłce do KSeF).
            </span>
          </div>
        )}

        {companies.length === 0 && !effectiveSellerCompany?.companyName && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12.5px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Nie dodałeś jeszcze profilu firmy sprzedawcy.{" "}
              <button
                type="button"
                onClick={() => setCompanyModalOpen(true)}
                className="font-semibold underline underline-offset-2"
              >
                Dodaj firmę teraz
              </button>
              , aby Twoje dane pojawiły się na fakturze i w pliku XML FA(3).
            </span>
          </div>
        )}

        {/* Sprzedawca (Wystawca faktury) oraz typ dokumentu */}
        <Card className="border-primary/25 bg-card">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <Building2 className="h-4 w-4 text-primary" /> Sprzedawca (Wystawca) & Typ
                <HelpTooltip text="Wystawcą faktury jest firma z aktywnego konta. Wybierz rodzaj dokumentu." />
              </CardTitle>
              <CardDescription>
                Firma wystawiająca jest przypisana do bieżącego konta
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-muted/70 p-1 text-[12px] font-medium">
                {(["sale", "purchase"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set({ type: t, isProforma: false })}
                    className={
                      form.type === t && !form.isProforma
                        ? "rounded-md bg-card px-2.5 py-0.5 shadow-sm ring-1 ring-border text-foreground font-semibold"
                        : "px-2.5 py-0.5 text-muted-foreground hover:text-foreground"
                    }
                  >
                    {t === "sale" ? "Sprzedaż (FV)" : "Zakup (FZ)"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => set({ type: "sale", isProforma: !form.isProforma })}
                  className={
                    form.isProforma
                      ? "rounded-md bg-primary text-primary-foreground px-2.5 py-0.5 shadow-sm font-semibold"
                      : "px-2.5 py-0.5 text-muted-foreground hover:text-foreground"
                  }
                  title="Wystaw fakturę proforma"
                >
                  Proforma
                </button>
              </div>
              {companies.length === 0 && <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCompanyModalOpen(true)}
                className="gap-1 font-medium text-[11px] h-7 px-2"
              >
                <Plus className="h-3 w-3 text-primary" /> Nowa firma
              </Button>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">{effectiveSellerCompany.companyName || "Dodaj firmę"} · NIP: {formatNip(effectiveSellerCompany.nip)}</p>
            {editing && draftInvoice?.sellerCompanyId !== effectiveSellerCompany.id && <p className="text-sm text-red-600">Ten dokument należy do innej firmy. Otwórz go w kontekście właściwej firmy.</p>}
            <div className="space-y-1">
              <label htmlFor="invoice-number" className="block text-xs font-semibold">Numer faktury</label>
              <Input id="invoice-number" value={invoiceNumber} maxLength={50} className="w-full max-w-md font-mono"
                disabled={isKsefRegistered || (Boolean(draftInvoice) && draftInvoice?.status !== "draft" && !draftInvoiceIsNew)}
                onChange={(event) => set({ number: event.target.value })} />
              <p className="text-xs text-muted-foreground">Propozycja: {suggestedNumber}. Numer możesz poprawić przed wystawieniem. <a href="/settings/companies" className="text-primary underline">Ustaw format numeracji</a>.</p>
            </div>

            {effectiveSellerCompany && (effectiveSellerCompany.companyName || effectiveSellerCompany.nip) && (
              <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 text-[12px] grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-foreground">
                    {effectiveSellerCompany.companyName || effectiveSellerCompany.name}
                  </p>
                  <p className="font-mono text-muted-foreground text-[11.5px]">
                    NIP: {formatNip(effectiveSellerCompany.nip)}
                  </p>
                </div>
                <div className="sm:text-right space-y-0.5">
                  {(effectiveSellerCompany.bankAccount || effectiveSellerCompany.iban) && (
                    <p className="font-mono text-[11px] text-muted-foreground truncate">
                      IBAN: {effectiveSellerCompany.bankAccount || effectiveSellerCompany.iban}
                    </p>
                  )}
                  <div className="flex sm:justify-end gap-1 pt-0.5">
                    {effectiveSellerCompany.ksefTokenSet ? (
                      <Badge tone="success" className="text-[10px]">
                        <ShieldCheck className="h-3 w-3 mr-1" /> Dedykowany token KSeF
                      </Badge>
                    ) : (
                      <Badge tone="outline" className="text-[10px] text-muted-foreground">
                        Domyślny KSeF konta
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── KROK 1: Kontrahent ── */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-[15px]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mr-2">1</span>
              Kontrahent ({form.type === "sale" ? "Nabywca" : "Sprzedawca"})
              <HelpTooltip text="Wpisz NIP klienta i kliknij 'GUS', aby automatycznie pobrać dane kontrahenta z Bazy REGON / Białej Listy MF." />
            </CardTitle>
            <CardDescription>
              Wybierz kontrahenta albo pobierz dane z GUS. Zagraniczny VAT UE sprawdzisz osobno w VIES.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Select
                id="invoice-contractorId" aria-invalid={Boolean(fieldErrors.contractorId)} aria-describedby={fieldErrors.contractorId ? "invoice-contractorId-error" : undefined}
                value={form.useNewContractor ? "__new__" : form.contractorId}
                onChange={(e) => {
                  if (e.target.value === "__new__") set({ useNewContractor: true, contractorId: "" });
                  else set({ useNewContractor: false, contractorId: e.target.value });
                }}
              >
                <option value="">— wybierz kontrahenta —</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {formatNip(c.nip)}
                  </option>
                ))}
                <option value="__new__">➕ Dodaj nowego kontrahenta…</option>
              </Select>
              {fieldErrors.contractorId && <p id="invoice-contractorId-error" className="text-xs text-destructive">{fieldErrors.contractorId}</p>}
              {selectedContractor && (
                <Badge tone={selectedContractor.isVatPayer ? "success" : "outline"}>
                  {selectedContractor.isVatPayer ? "płatnik VAT" : "zwolniony z VAT"}
                </Badge>
              )}
            </div>

            {form.useNewContractor && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3.5">
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  <UserPlus className="h-4 w-4 text-primary" /> Nowy kontrahent
                  <span className="text-[11px] font-normal text-muted-foreground">
                    (zostanie zapisany w bazie)
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Nazwa firmy *</Label>
                    <Input
                      value={form.newContractor.name}
                      onChange={(e) => set({ newContractor: { ...form.newContractor, name: e.target.value } })}
                      placeholder="np. DemoIT Solutions Sp. z o.o."
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 sm:col-span-2">
                    <div className="space-y-1.5">
                      <Label>Kraj kontrahenta</Label>
                      <Select
                        value={form.newContractor.country}
                        onChange={(e) => {
                          const c = e.target.value;
                          set({ newContractor: { ...form.newContractor, country: c } });
                          if (c === "PL") setNewContractorTaxIdType("nip");
                          else if (["DE", "FR", "IT", "ES", "NL", "CZ", "SK", "AT", "BE", "SE"].includes(c)) setNewContractorTaxIdType("vat_eu");
                          else setNewContractorTaxIdType("tin");
                        }}
                      >
                        <option value="PL">Polska (PL)</option>
                        <option value="DE">Niemcy (DE)</option>
                        <option value="GH">Ghana (GH)</option>
                        <option value="US">Stany Zjednoczone (US)</option>
                        <option value="GB">Wielka Brytania (GB)</option>
                        <option value="FR">Francja (FR)</option>
                        <option value="IT">Włochy (IT)</option>
                        <option value="ES">Hiszpania (ES)</option>
                        <option value="NL">Holandia (NL)</option>
                        <option value="CZ">Czechy (CZ)</option>
                        <option value="SK">Słowacja (SK)</option>
                        <option value="UA">Ukraina (UA)</option>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Typ identyfikatora podatkowego</Label>
                      <Select
                        value={newContractorTaxIdType}
                        onChange={(e) => setNewContractorTaxIdType(e.target.value as any)}
                      >
                        <option value="nip">NIP (Polski - GUS BIR)</option>
                        <option value="vat_eu">VAT UE (Unia Europejska)</option>
                        <option value="tin">TIN / Tax ID (Zagraniczny)</option>
                        <option value="none">Brak (Osoba fizyczna / konsument)</option>
                      </Select>
                    </div>
                  </div>

                  {newContractorTaxIdType !== "none" && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>
                        {newContractorTaxIdType === "nip"
                          ? "NIP *"
                          : newContractorTaxIdType === "vat_eu"
                            ? "Numer VAT UE (np. DE123456789) *"
                            : "Numer TIN / Tax ID (np. Ghana TIN, US EIN) *"}
                      </Label>
                      {newContractorTaxIdType === "nip" ? (
                        <NipLookup
                          nip={form.newContractor.nip}
                          onNipChange={(v) => set({ newContractor: { ...form.newContractor, nip: v } })}
                          onFound={(c) =>
                            set({
                              newContractor: {
                                ...form.newContractor,
                                name: c.name,
                                nip: c.nip,
                                street: c.address.street,
                                city: c.address.city,
                                postal: c.address.postal,
                                country: c.address.country,
                                isVatPayer: c.isVatPayer,
                              },
                            })
                          }
                        />
                      ) : (
                        <Input
                          value={form.newContractor.nip}
                          onChange={(e) => set({ newContractor: { ...form.newContractor, nip: e.target.value } })}
                          placeholder={
                            newContractorTaxIdType === "vat_eu"
                              ? "np. DE123456789"
                              : "np. C0001234567 (Ghana TIN / US EIN)"
                          }
                          className="font-mono text-xs"
                        />
                      )}
                      {newContractorTaxIdType === "vat_eu" && <ViesLookup vat={form.newContractor.nip} country={form.newContractor.country} />}
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Kod pocztowy *</Label>
                      <Input
                        value={form.newContractor.postal}
                        onChange={(e) => set({ newContractor: { ...form.newContractor, postal: e.target.value } })}
                        placeholder="00-001"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Miasto *</Label>
                      <Input
                        value={form.newContractor.city}
                        onChange={(e) => set({ newContractor: { ...form.newContractor, city: e.target.value } })}
                        placeholder="Warszawa"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Ulica i numer *</Label>
                    <Input
                      value={form.newContractor.street}
                      onChange={(e) => set({ newContractor: { ...form.newContractor, street: e.target.value } })}
                      placeholder="ul. Przykładowa 1"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Kraj</Label>
                    <Input
                      value={form.newContractor.country}
                      onChange={(e) => set({ newContractor: { ...form.newContractor, country: e.target.value } })}
                      placeholder="PL"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nr konta (IBAN)</Label>
                    <Input
                      value={form.newContractor.iban}
                      onChange={(e) => set({ newContractor: { ...form.newContractor, iban: e.target.value } })}
                      placeholder="PL00 0000 0000 0000 0000 0000 0000"
                      className="font-mono text-[12px]"
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── KROK 2: Pozycje faktury (zgodnie z kolejnością Kontrahent -> Pozycje -> Płatność) ── */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-[15px]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mr-2">2</span>
              Pozycje faktury
            </CardTitle>
            <CardDescription>Towary i usługi — stawki VAT (23%, 8%, 5%, 0%, zw, np, oo), przeliczenia kwot na żywo</CardDescription>
          </CardHeader>
          <CardContent>
            <LineItemsEditor
              lines={form.lines}
              onChange={(lines) => set({ lines })}
              currency={form.currency}
              products={products}
            />
          </CardContent>
        </Card>

        {/* ── KROK 3: Płatność, terminy i parametry ── */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-[15px]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mr-2">3</span>
              Płatność, terminy i parametry
            </CardTitle>
            <CardDescription>Daty, sposób uregulowania płatności, faktury cykliczne oraz uwagi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Data wystawienia *</Label>
                <Input id="invoice-issueDate" type="date" value={form.issueDate} aria-invalid={Boolean(fieldErrors.issueDate)} aria-describedby={fieldErrors.issueDate ? "invoice-issueDate-error" : undefined} onChange={(e) => set({ issueDate: e.target.value })} />
                {fieldErrors.issueDate && <p id="invoice-issueDate-error" className="text-xs text-destructive">{fieldErrors.issueDate}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Data sprzedaży</Label>
                <Input id="invoice-saleDate" type="date" value={form.saleDate} aria-invalid={Boolean(fieldErrors.saleDate)} aria-describedby={fieldErrors.saleDate ? "invoice-saleDate-error" : undefined} onChange={(e) => set({ saleDate: e.target.value })} />
                {fieldErrors.saleDate && <p id="invoice-saleDate-error" className="text-xs text-destructive">{fieldErrors.saleDate}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>
                  Termin płatności{" "}
                  {!form.dueTouched && <span className="font-normal text-muted-foreground">(auto)</span>}
                </Label>
                <Input
                  id="invoice-dueDate" type="date" aria-invalid={Boolean(fieldErrors.dueDate)} aria-describedby={fieldErrors.dueDate ? "invoice-dueDate-error" : undefined}
                  value={form.dueDate}
                  onChange={(e) => set({ dueDate: e.target.value, dueTouched: true })}
                />
                {fieldErrors.dueDate && <p id="invoice-dueDate-error" className="text-xs text-destructive">{fieldErrors.dueDate}</p>}
              </div>
            </div>

            {form.type === "sale" && !form.isProforma && <details className="rounded-xl border p-3 text-xs" open={form.isOffline && Boolean(fieldErrors.offlineReason || fieldErrors.offlineDeadline) ? true : undefined}>
              <summary className="cursor-pointer font-medium">Wystawienie offline</summary>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form.isOffline)} onChange={e => set({ isOffline: e.target.checked })} /> Oznacz jako dokument offline</label>
                {form.isOffline && <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label>Powód
                      <Select id="invoice-offlineReason" value={form.offlineReason || ""} aria-invalid={Boolean(fieldErrors.offlineReason)} aria-describedby={fieldErrors.offlineReason ? "invoice-offlineReason-error" : undefined} onChange={e => set({ offlineReason: e.target.value })}>
                        <option value="">Wybierz powód</option><option value="offline24">Offline24</option><option value="unavailability">Niedostępność KSeF</option><option value="failure">Awaria KSeF</option><option value="total_failure">Awaria całkowita</option>
                      </Select>{fieldErrors.offlineReason && <span id="invoice-offlineReason-error" className="block text-destructive">{fieldErrors.offlineReason}</span>}
                    </label>
                    <label>Termin przesłania ustalony przez operatora
                      <Input id="invoice-offlineDeadline" type="date" value={form.offlineDeadline || ""} aria-invalid={Boolean(fieldErrors.offlineDeadline)} aria-describedby={fieldErrors.offlineDeadline ? "invoice-offlineDeadline-error" : undefined} onChange={e => set({ offlineDeadline: e.target.value })} />
                      {fieldErrors.offlineDeadline && <span id="invoice-offlineDeadline-error" className="block text-destructive">{fieldErrors.offlineDeadline}</span>}
                    </label>
                  </div>
                  <p className="text-muted-foreground">Sprawdź termin w komunikatach MF. Wystawienie offline wymaga kodów I i II podpisanych certyfikatem typu Offline. Bez niego możesz zapisać tylko szkic.</p>
                </>}
              </div>
            </details>}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Metoda płatności</Label>
                <Select
                  value={form.paymentMethod}
                  onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod })}
                >
                  <option value="transfer">Przelew bankowy</option>
                  <option value="cash">Gotówka</option>
                  <option value="card">Karta płatnicza</option>
                  <option value="blik">BLIK</option>
                  <option value="compensation">Kompensata</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Termin (dni)</Label>
                <Select value={form.paymentTermDays} onChange={(e) => onTermChange(Number(e.target.value))}>
                  {[7, 14, 21, 30, 45, 60].map((d) => (
                    <option key={d} value={d}>
                      {d} dni
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Waluta</Label>
                <Select value={form.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>
                  {(["PLN", "EUR", "USD", "GBP", "CHF", "NOK", "SEK", "CAD"] as const).map((c) => (
                    <option key={c} value={c}>
                      {currencyNames[c] || c}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Wybór rachunku bankowego firmy */}
              {effectiveSellerCompany?.bankAccounts && effectiveSellerCompany.bankAccounts.length > 0 && (
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Rachunek bankowy firmy dla tej faktury</Label>
                  <Select
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                  >
                    <option value="">— Domyślny rachunek profilu ({effectiveSellerCompany.bankAccount || "Brak"}) —</option>
                    {effectiveSellerCompany.bankAccounts.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.currency} · {b.bankName || "Bank"} · {b.accountNumber} {b.isDefault ? "(domyślny)" : ""}
                      </option>
                    ))}
                  </Select>
                  {form.currency !== "PLN" && !effectiveSellerCompany.bankAccounts.some((b: any) => b.currency === form.currency || b.currency === "MULTI") && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Uwaga: firma nie posiada dedykowanego konta w walucie {form.currency}. Środki wpłyną na konto PLN z możliwym przewalutowaniem banku.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Przelicznik walut NBP (art. 31a ustawy o VAT) */}
            {form.currency !== "PLN" && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-primary">
                    <TrendingUp className="h-4 w-4" />
                    Kurs przeliczeniowy NBP (art. 31a ustawy o VAT)
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 text-primary hover:bg-primary/10"
                    onClick={() => fetchNbpRate(form.currency, form.issueDate, form.saleDate)}
                  >
                    Odśwież kurs z NBP
                  </Button>
                </div>

                <div className="text-[11.5px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Zastosowana podstawa prawna: </span>
                  {form.issueDate && form.saleDate && form.issueDate < form.saleDate
                    ? "art. 31a ust. 2 (faktura wystawiona przed sprzedażą — kurs z ostatniego dnia roboczego przed wystawieniem)"
                    : "art. 31a ust. 1 (kurs z ostatniego dnia roboczego poprzedzającego datę sprzedaży / powstania obowiązku)"}
                </div>

                {nbpRate && !isManualRate ? (
                  <div className="p-3 bg-card rounded-lg border border-border/80 space-y-1.5">
                    <p className="font-medium text-foreground">
                      Tabela NBP: <span className="font-bold text-primary">{nbpRate.tableNumber}</span> z dnia{" "}
                      <span className="font-bold">{nbpRate.effectiveDate}</span>
                    </p>
                    <p className="text-xs">
                      Oficjalny średni kurs: <b className="text-foreground">1 {form.currency} = {nbpRate.rate.toFixed(4)} PLN</b>
                    </p>
                    <div className="pt-1.5 border-t border-border/60 grid grid-cols-3 gap-2 text-[11.5px]">
                      <div>
                        <span className="text-muted-foreground">Netto w PLN: </span>
                        <b className="text-foreground">{formatMoney(totals.net * nbpRate.rate, "PLN")}</b>
                      </div>
                      <div>
                        <span className="text-muted-foreground">VAT w PLN: </span>
                        <b className="text-primary">{formatMoney(totals.vat * nbpRate.rate, "PLN")}</b>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Brutto w PLN: </span>
                        <b className="text-foreground">{formatMoney(totals.gross * nbpRate.rate, "PLN")}</b>
                      </div>
                    </div>
                  </div>
                ) : !isManualRate ? (
                  <p className="text-muted-foreground italic">Pobieranie tabeli kursowej z NBP...</p>
                ) : null}

                {/* Przełącznik kursu ręcznego */}
                <div className="pt-2 border-t border-primary/20 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isManualRate}
                      onChange={(e) => {
                        setIsManualRate(e.target.checked);
                        if (!e.target.checked && nbpRate) {
                          setManualRateInput(String(nbpRate.rate));
                        }
                      }}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="font-semibold text-foreground">
                      Wpisz kurs własny (modyfikacja manualna)
                    </span>
                  </label>

                  {isManualRate && (
                    <div className="grid gap-3 sm:grid-cols-2 p-3 bg-card rounded-lg border border-border/80">
                      <div className="space-y-1">
                        <Label className="text-[11.5px]">Zastosowany kurs (PLN) *</Label>
                        <Input
                          type="text"
                          value={manualRateInput}
                          onChange={(e) => setManualRateInput(e.target.value)}
                          placeholder="np. 4.2500"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-[11.5px]">
                          Uzasadnienie zastosowania własnego kursu * (wymóg art. 31a ustawy o VAT)
                        </Label>
                        <Input
                          type="text"
                          value={manualJustification}
                          onChange={(e) => setManualJustification(e.target.value)}
                          placeholder="np. Zgodnie z umową handlową kurs z dnia zlecenia bankowego"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Opcja faktury cyklicznej */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">Faktura cykliczna (automatyczne odnawianie)</p>
                  <p className="text-[11px] text-muted-foreground">Generuj kolejne dokumenty w zadanym cyklu czasowym</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(form.isRecurring)}
                  onChange={(e) => set({ isRecurring: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </div>

              {form.isRecurring && (
                <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/50">
                  <div className="space-y-1">
                    <Label className="text-[11.5px]">Interwał odnawiania</Label>
                    <Select
                      value={form.recurringInterval || "monthly"}
                      onChange={(e) => set({ recurringInterval: e.target.value })}
                    >
                      <option value="monthly">Co miesiąc (zalecane dla abonamentów)</option>
                      <option value="quarterly">Co kwartał</option>
                      <option value="yearly">Co rok</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11.5px]">Data kolejnego wystawienia</Label>
                    <Input
                      type="date"
                      value={form.recurringNextDate || ""}
                      onChange={(e) => set({ recurringNextDate: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Język dokumentu</Label>
              <div className="inline-flex rounded-lg bg-muted/70 p-1 text-[13px] font-medium gap-1 flex-wrap">
                {(["PL", "EN", "PL/EN"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => set({ language: l })}
                    className={
                      form.language === l
                        ? "rounded-md bg-card px-3 py-1 shadow-sm ring-1 ring-border text-foreground font-semibold"
                        : "px-3 py-1 text-muted-foreground hover:text-foreground"
                    }
                  >
                    {l === "PL" ? "Polski (PL)" : l === "EN" ? "English (EN)" : "Dwujęzyczna (PL/EN)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Uwagi / Informacje dodatkowe</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="np. numer zamówienia, numer umowy, szczegóły dostawy…"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── KROK 4: Podsumowanie i akcje (mobile) ── */}
        <Card className="xl:hidden border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center text-[15px]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mr-2">4</span>
              Podsumowanie i wystawienie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">Netto</p>
                <p className="text-[14px] font-bold tabular-nums">{formatMoney(totals.net, form.currency)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">VAT</p>
                <p className="text-[14px] font-bold tabular-nums">{formatMoney(totals.vat, form.currency)}</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2.5">
                <p className="text-[11px] text-primary">Brutto</p>
                <p className="text-[14px] font-bold tabular-nums text-primary">{formatMoney(totals.gross, form.currency)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveDraft} variant="outline">
                <Save className="h-4 w-4" /> Szkic
              </Button>
              {!form.isOffline && <Button onClick={handleSave} loading={saving === "save"}>
                <CheckCircle2 className="h-4 w-4" /> {form.isProforma ? `Zapisz proformę ${invoiceNumber}` : isPurchase ? "Zapisz fakturę zakupową (FZ)" : (form.isCorrection ? "Zapisz korektę" : "Zapisz fakturę")}
              </Button>}
              {!isPurchase && !form.isOffline && !isKsefRegistered && !form.isProforma && (
                <Button onClick={handleSendKsef} loading={saving === "ksef"} variant="subtle">
                  <Send className="h-4 w-4" /> Wyślij do KSeF
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Podgląd na żywo ── */}
      <div className="xl:sticky xl:top-24 xl:h-fit">
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Eye className="h-4 w-4 text-muted-foreground" /> Podgląd na żywo
            <Badge tone="outline">{form.language === "PL" ? "PL" : "EN"} · {form.currency}</Badge>
          </div>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={exports.exportPdf} title="PDF (drukuj / zapisz jako PDF)">
              <Printer className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={exports.exportXml} title="Eksport XML FA(3)">
              <FileCode2 className="h-3.5 w-3.5" /> XML FA(3)
            </Button>
            <Button variant="ghost" size="sm" onClick={exports.exportJson} title="Eksport JSON">
              <FileJson2 className="h-3.5 w-3.5" /> JSON
            </Button>
          </div>
        </div>

        <InvoicePreview invoice={previewInvoice} contractor={effectiveContractor} company={effectiveSellerCompany} />

        <div className="no-print mt-4 hidden flex-wrap items-center gap-2 xl:flex">
          <Button onClick={handleSaveDraft} variant="outline">
            <Save className="h-4 w-4" /> Szkic
          </Button>
          {!form.isOffline && <Button onClick={handleSave} loading={saving === "save"} className="flex-1">
            <CheckCircle2 className="h-4 w-4" /> {form.isProforma ? `Zapisz proformę ${invoiceNumber}` : isPurchase ? `Zapisz fakturę zakupową ${invoiceNumber}` : `Zapisz fakturę ${invoiceNumber}`}
          </Button>}
          {!isPurchase && !form.isOffline && !isKsefRegistered && !form.isProforma && (
            <Button onClick={handleSendKsef} loading={saving === "ksef"} variant="subtle" className="flex-1" title="Po kliknięciu faktura zostanie zaszyfrowana i przekazana do serwerów Ministerstwa Finansów">
              <Send className="h-4 w-4" /> Wystaw i Wyślij do KSeF
            </Button>
          )}
        </div>

      </div>

      {/* Szybkie dodanie nowej firmy / NIP */}
      <CompanyModal
        open={companyModalOpen}
        onClose={() => setCompanyModalOpen(false)}
        onSaved={(c) => set({ sellerCompanyId: c.id })}
      />

      {/* Modal ściągawki skrótów klawiszowych */}
      <ShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </div>
  );
}
