"use client";

import * as React from "react";
import Link from "next/link";
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
import { Dialog } from "@/components/ui/dialog";
import type { PreflightIssue } from "@/lib/invoice-preflight";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { useAppStore } from "@/lib/store";
import { DEFAULT_INVOICE_PATTERN, INVOICE_NUMBER_PRESETS, invoicePatternFromExample, invoicePrefix, parseInvoicePattern } from "@/lib/invoice-numbering";
import { accountConflictsWithAnotherCompany, normalizedBankAccount } from "@/lib/company-bank-account-scope";
import { defaultCompanyBankAccount } from "@/lib/company-default-bank-account";
import { correctionOriginalKsefNumber, isCorrectableInvoiceSource } from "@/lib/invoice-correction-eligibility";
import { getContractor } from "@/lib/store";
import { addDaysISO, todayISO } from "@/lib/utils";
import { formatMoney, invoiceTotals, round2 } from "@/lib/format";
import { roundHalfUp } from "@/lib/tax/money";
import { normalizeInvoiceLineAmounts } from "@/lib/invoice-input";
import { correctionDifferenceLines } from "@/lib/invoice-correction-lines";
import { convertToPln, isIsoCalendarDate } from "@/lib/nbp";
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
  gtuText?: string;
  proceduresText?: string;
  isSplitPayment?: boolean;
  exemptionBasis?: string;
  gtuCodes?: Invoice["gtuCodes"];
  jpkProcedures?: Invoice["jpkProcedures"];
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
  correctionInput?: "after";
  correctionOriginalLines?: Invoice["lines"];
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
    isSplitPayment: inv.isSplitPayment ?? false,
    exemptionBasis: inv.exemptionBasis ?? "",
    gtuCodes: inv.gtuCodes ?? [],
    jpkProcedures: inv.jpkProcedures ?? [],
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
    isSplitPayment: false, exemptionBasis: "", gtuCodes: [], jpkProcedures: [],
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
type InvoicePayload = Omit<Invoice, "id" | "createdAt"> & { autoNumber?: boolean; bankAccountMode?: string };

export function InvoiceCreator() {
  const router = useRouter();
  const toast = useToast();
  const store = useAppStore();
  const { contractors: allContractors, products: allProducts, company, companies, draftInvoice, draftInvoiceIsNew, ksef } = store;
  const ksefEnv = ksef?.environment ?? "demo";

  const defaultCompany =
    (draftInvoice && !draftInvoiceIsNew ? companies.find(c => c.id === draftInvoice.sellerCompanyId) : undefined) ??
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
  const [nbpRate, setNbpRate] = React.useState<{ key: string; rate: number; tableNumber: string; effectiveDate: string; source: string } | null>(null);
  const rateRequest = React.useRef<AbortController | null>(null);
  const [nbpError, setNbpError] = React.useState("");
  const [nbpLoading, setNbpLoading] = React.useState(false);
  const activeRateKey = `${form.currency}:${form.issueDate}:${form.saleDate || form.issueDate}`;
  const activeNbpRate = nbpRate?.key === activeRateKey ? nbpRate : null;
  const [isManualRate, setIsManualRate] = React.useState(draftInvoice?.exchangeRateRule === "manual");
  const [manualRateInput, setManualRateInput] = React.useState(draftInvoice?.exchangeRateRule === "manual" && draftInvoice.exchangeRate ? String(draftInvoice.exchangeRate) : "");
  const [manualJustification, setManualJustification] = React.useState(draftInvoice?.exchangeRateJustification || "");
  const [selectedBankAccountId, setSelectedBankAccountId] = React.useState<string>(() =>
    draftInvoice && !draftInvoiceIsNew && draftInvoice.sellerCompanyId === defaultCompany.id
      ? draftInvoice.bankAccountSnapshot ? "saved" : draftInvoice.bankAccountId || "primary" : "auto"
  );
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
  const clonedFrom = React.useRef("");
  const correctionId = searchParams.get("correctionFrom");
  const cloneId = correctionId || searchParams.get("cloneFrom");
  const [cloneLoading, setCloneLoading] = React.useState(Boolean(cloneId));
  const [cloneError, setCloneError] = React.useState("");
  const [cloneAttempt, setCloneAttempt] = React.useState(0);
  React.useEffect(() => {
    if (!cloneId) { setCloneLoading(false); setCloneError(""); return; }
    const cloneKey = `${defaultCompany.id}:${correctionId ? "correction" : "clone"}:${cloneId}`;
    if (clonedFrom.current === cloneKey) return;
    const controller = new AbortController();
    setCloneLoading(true); setCloneError("");
    void (async () => {
      try {
        const response = await fetch(`/api/invoices/${encodeURIComponent(cloneId)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Nie udało się wczytać faktury do sklonowania.");
        if (controller.signal.aborted) return;
        const src: Invoice = data.invoice;
        if (correctionId && (!isCorrectableInvoiceSource(src) || src.sellerCompanyId !== defaultCompany.id)) throw new Error("Otwórz wystawioną zwykłą fakturę sprzedaży w jej firmie, aby przygotować korektę.");
        clonedFrom.current = cloneKey;
        const useAfterValues = Boolean(correctionId && !src.isCorrection);
        const originalLines = src.lines.map((line, index) => ({ ...line, id: `source-${index}` }));
        setForm({
          ...formFromInvoice(src, defaultCompany.id),
          sellerCompanyId: defaultCompany.id,
          contractorId: src.sellerCompanyId === defaultCompany.id ? src.contractorId : "",
          number: "",
          isCorrection: Boolean(correctionId),
          correctionReason: "",
          originalInvoiceId: correctionId ? src.id : "",
          originalInvoiceNumber: correctionId ? src.number : "",
          originalIssueDate: correctionId ? src.issueDate : "",
          originalKsefNumber: correctionId ? correctionOriginalKsefNumber(src) || "" : "",
          correctionInput: useAfterValues ? "after" : undefined,
          correctionOriginalLines: useAfterValues ? originalLines : undefined,
          lines: useAfterValues ? originalLines.map(line => ({ ...line })) : src.lines.map(line => ({ ...line, quantity: correctionId ? 0 : line.quantity })),
          isProforma: correctionId ? false : src.isProforma,
          isRecurring: correctionId ? false : src.isRecurring,
          recurringAutoSend: correctionId ? false : src.recurringAutoSend,
          isOffline: correctionId ? false : src.isOffline,
          issueDate: todayISO(),
          saleDate: todayISO(),
          dueDate: addDaysISO(todayISO(), src.paymentTermDays || 14),
          dueTouched: false,
        });
        toast("info", correctionId ? "Przygotowano korektę" : "Sklonowano dane faktury", correctionId ? `Popraw pozycje faktury ${src.number}. Różnicę obliczymy automatycznie; oryginał pozostaje bez zmian.` : `Utworzono nowy dokument na wzór ${src.number}`);
      } catch (failure) {
        if (!controller.signal.aborted) setCloneError(failure instanceof Error ? failure.message : "Nie udało się sklonować faktury.");
      } finally { if (!controller.signal.aborted) setCloneLoading(false); }
    })();
    return () => controller.abort();
  }, [cloneId, correctionId, cloneAttempt, defaultCompany.id]);

  // NBP rate fetcher zgodny z art. 31a ust. 1 i 2
  const fetchNbpRate = React.useCallback(async (curr: string, issueDate: string, saleDate: string) => {
    rateRequest.current?.abort();
    const controller = new AbortController();
    rateRequest.current = controller;
    setNbpRate(null); setNbpError("");
    if (curr === "PLN") {
      setNbpLoading(false);
      return;
    }
    setNbpLoading(true);
    try {
      const rule = issueDate < saleDate ? "art_31a_issue_date" : "art_31a_sale_date";
      const params = new URLSearchParams({ currency: curr, issueDate, saleDate: saleDate || issueDate, rule });
      const res = await fetch(`/api/nbp?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      const data = await res.json();
      if (!res.ok || !Number.isFinite(data.rate) || data.rate <= 0) throw new Error(data.error || "Nie udało się pobrać poprawnego kursu NBP.");
      if (controller.signal.aborted || rateRequest.current !== controller) return;
      setNbpRate({ ...data, key: `${curr}:${issueDate}:${saleDate || issueDate}` });
      if (!isManualRate) setManualRateInput(String(data.rate));
    } catch (error) {
      if (!controller.signal.aborted && rateRequest.current === controller) setNbpError(error instanceof Error ? error.message : "Sprawdź połączenie z NBP.");
    } finally {
      if (rateRequest.current === controller) setNbpLoading(false);
    }
  }, [isManualRate]);

  React.useEffect(() => {
    void fetchNbpRate(form.currency, form.issueDate, form.saleDate);
    return () => rateRequest.current?.abort();
  }, [form.currency, form.issueDate, form.saleDate, fetchNbpRate]);

  // ── Autosave stanu roboczego w localStorage ──
  const DRAFT_KEY = `fakturo_local_draft_v3_${defaultCompany.id}`;
  const [autosaveStatus, setAutosaveStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const [hasRecoverableDraft, setHasRecoverableDraft] = React.useState<boolean>(false);
  const [recoverableDate, setRecoverableDate] = React.useState<string>("");
  const [numberMode, setNumberMode] = React.useState<"auto" | "manual" | null>(() => draftInvoice && !draftInvoiceIsNew ? "manual" : null);

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
  }, [draftInvoice, draftInvoiceIsNew, DRAFT_KEY]);

  React.useEffect(() => {
    const isKsef = Boolean(draftInvoice?.ksefNumber || draftInvoice?.ksef?.number);
    if (isKsef || hasRecoverableDraft || (draftInvoice && !draftInvoiceIsNew)) return;
    setAutosaveStatus("saving");
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, numberMode, selectedBankAccountId, savedAt: new Date().toISOString() }));
        setAutosaveStatus("saved");
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [form, numberMode, draftInvoice, selectedBankAccountId, hasRecoverableDraft, DRAFT_KEY]);

  const handleRecoverDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.form) {
          if (parsed.form.sellerCompanyId === defaultCompany.id) {
            setForm(parsed.form);
            setNumberMode(parsed.numberMode === "auto" || parsed.numberMode === "manual" ? parsed.numberMode : parsed.form.number ? "manual" : null);
            setSelectedBankAccountId(parsed.selectedBankAccountId && parsed.selectedBankAccountId !== "saved" ? parsed.selectedBankAccountId : "auto");
          }
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
  const [numberPatternInput, setNumberPatternInput] = React.useState("");
  const [numberPatternOpen, setNumberPatternOpen] = React.useState(false);
  const [savingNumberPattern, setSavingNumberPattern] = React.useState(false);
  const [counterFragment, setCounterFragment] = React.useState(0);
  const numberFragments = [...form.number.matchAll(/\d+/g)];
  const effectiveCounterFragment = Math.max(0, Math.min(counterFragment, numberFragments.length - 1));

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
    for (const [key, label] of [["issueDate", "wystawienia"], ["saleDate", "sprzedaży"], ["dueDate", "płatności"]] as const) {
      if (!isIsoCalendarDate(form[key])) fields[key] = `Podaj poprawną datę ${label}.`;
    }
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
      setForm((f) => f.sellerCompanyId && f.sellerCompanyId !== store.selectedCompanyId
        ? freshForm(store.selectedCompanyId!) : { ...f, sellerCompanyId: store.selectedCompanyId! });
      setSelectedBankAccountId("auto");
      setNumberMode(null);
      setForm(f => ({ ...f, number: "" }));
    }
  }, [store.selectedCompanyId, draftInvoice, draftInvoiceIsNew]);

  const effectiveSellerCompany: CompanyProfile = defaultCompany ?? EMPTY_COMPANY;
  const companyAccounts = React.useMemo(() => (effectiveSellerCompany.bankAccounts || []).filter(
    account => account.companyId === effectiveSellerCompany.id && !accountConflictsWithAnotherCompany(effectiveSellerCompany.id, account.accountNumber, companies, account.beneficiaryName),
  ), [effectiveSellerCompany.bankAccounts, effectiveSellerCompany.id, companies]);
  const defaultBankAccount = defaultCompanyBankAccount(effectiveSellerCompany.id, companyAccounts, form.currency, Boolean(effectiveSellerCompany.bankAccount));
  const savedBankAccount = draftInvoice?.sellerCompanyId === effectiveSellerCompany.id ? draftInvoice.bankAccountSnapshot : null;
  const primaryBankAccount = effectiveSellerCompany.bankAccount ? { companyId: effectiveSellerCompany.id, accountNumber: effectiveSellerCompany.bankAccount, accountName: "Główny rachunek profilu firmy", beneficiaryName: effectiveSellerCompany.companyName, currency: "PLN", bankName: effectiveSellerCompany.bankName || "" } : null;
  const chosenBankAccount = selectedBankAccountId === "saved" ? savedBankAccount
    : selectedBankAccountId === "auto" ? defaultBankAccount || primaryBankAccount
    : selectedBankAccountId === "primary" ? primaryBankAccount : companyAccounts.find(account => account.id === selectedBankAccountId);
  const effectiveBankAccountId = selectedBankAccountId === "saved" ? draftInvoice?.bankAccountId || null : (chosenBankAccount && "id" in chosenBankAccount ? chosenBankAccount.id : null) || null;

  React.useEffect(() => {
    setNumberPatternInput(effectiveSellerCompany.invoiceNumberPattern || DEFAULT_INVOICE_PATTERN);
    setNumberPatternOpen(false);
  }, [effectiveSellerCompany.id, effectiveSellerCompany.invoiceNumberPattern]);

  React.useEffect(() => {
    if (!["auto", "primary", "saved"].includes(selectedBankAccountId) && !companyAccounts.some(account => account.id === selectedBankAccountId)) setSelectedBankAccountId("auto");
  }, [selectedBankAccountId, companyAccounts]);

  const saveNumberPattern = async () => {
    try {
      if (!effectiveSellerCompany.id) throw new Error("Najpierw wybierz firmę.");
      const pattern = numberPatternInput.trim();
      parseInvoicePattern(pattern);
      setSavingNumberPattern(true);
      const res = await fetch(`/api/companies/${effectiveSellerCompany.id}/numbering`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pattern }),
      });
      if (!res.ok) {
        const response = await res.json();
        throw new Error(response.error || "Nie udało się zapisać numeracji.");
      }
      await store.fetchCompanies();
      setNumberPatternOpen(false);
      toast("success", "Zapisano numerację firmy", pattern);
    } catch (error) {
      toast("error", "Nie można zapisać numeracji", error instanceof Error ? error.message : "Nieprawidłowy format.");
    } finally {
      setSavingNumberPattern(false);
    }
  };

  const editing = !!draftInvoice && !draftInvoiceIsNew && !cloneId;
  const numberDate = form.issueDate || todayISO();
  const numberPrefix = invoicePrefix(form.type, form.isCorrection, form.isProforma);
  const numberKey = `${effectiveSellerCompany.id}:${effectiveSellerCompany.invoiceNumberPattern}:${numberDate}:${numberPrefix}`;
  const [numberPreview, setNumberPreview] = React.useState<{ key: string; number: string; lastNumber: string | null; error: string }>({ key: "", number: "", lastNumber: null, error: "" });
  const [numberAttempt, setNumberAttempt] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    if (!effectiveSellerCompany.id) { setNumberPreview({ key: numberKey, number: "", lastNumber: null, error: "Wybierz firmę wystawiającą fakturę." }); return; }
    const timer = setTimeout(() => { void (async () => {
      try {
        const params = new URLSearchParams({ companyId: effectiveSellerCompany.id, date: numberDate, type: form.type, correction: form.isCorrection ? "1" : "0", proforma: form.isProforma ? "1" : "0" });
        const response = await fetch(`/api/invoices/next-number?${params}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Nie udało się sprawdzić numeracji.");
        if (!controller.signal.aborted) setNumberPreview({ key: numberKey, number: data.number, lastNumber: data.lastNumber, error: "" });
      } catch (failure) {
        if (!controller.signal.aborted) setNumberPreview({ key: numberKey, number: "", lastNumber: null, error: failure instanceof Error ? failure.message : "Nie udało się sprawdzić numeracji." });
      }
    })(); }, 100);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [numberKey, numberAttempt]);
  const numberLoading = numberPreview.key !== numberKey;
  const suggestedNumber = numberLoading ? "" : numberPreview.number;
  const numberingError = numberLoading ? "" : numberPreview.error;
  const lastNumber = numberLoading ? null : numberPreview.lastNumber;
  const invoiceNumber = numberMode === "manual" ? form.number : form.number || suggestedNumber;
  const isPurchase = form.type === "purchase";
  const isKsefRegistered = !cloneId && Boolean(draftInvoice?.ksefNumber || draftInvoice?.ksef?.number);

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

  const correctionAfterValues = Boolean(form.isCorrection && form.correctionInput === "after" && form.correctionOriginalLines);
  const documentLines = correctionAfterValues
    ? correctionDifferenceLines(form.correctionOriginalLines!, form.lines)
    : form.lines.filter(line => line.name.trim() && (form.isCorrection ? line.quantity !== 0 : line.quantity > 0)).map(normalizeInvoiceLineAmounts);

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
    bankAccountId: effectiveBankAccountId,
    bankAccountSnapshot: chosenBankAccount as Invoice["bankAccountSnapshot"] || null,
    paymentTermDays: form.paymentTermDays,
    notes: form.notes,
    isSplitPayment: form.isSplitPayment,
    exemptionBasis: form.exemptionBasis,
    lines: documentLines,
    exchangeRate: form.currency === "PLN" ? null : isManualRate ? Number(manualRateInput.trim().replace(",", ".")) || null : activeNbpRate?.rate || null,
    exchangeRateRule: form.currency === "PLN" ? null : isManualRate ? "manual" : form.issueDate < form.saleDate ? "art_31a_issue_date" : "art_31a_sale_date",
    exchangeRateDate: form.currency === "PLN" ? null : isManualRate ? form.issueDate : activeNbpRate?.effectiveDate || null,
    exchangeRateTable: form.currency === "PLN" ? null : isManualRate ? "Kurs własny podatnika" : activeNbpRate?.tableNumber || null,
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

  const exports = useInvoiceExports(previewInvoice, effectiveContractor, effectiveSellerCompany, "preview");
  const totals = invoiceTotals(previewInvoice);

  const onTermChange = (days: number) => {
    set({ paymentTermDays: days });
    if (!form.dueTouched) {
      set({ dueDate: addDaysISO(form.issueDate || todayISO(), days) });
    }
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (cloneLoading) errs.push("Poczekaj na wczytanie faktury do sklonowania.");
    if (cloneError) errs.push(cloneError);
    if (!editing && !numberMode) errs.push("Wybierz, czy kontynuować numerację automatycznie, czy wpisać numer ręcznie.");
    if (numberMode === "auto" && numberingError) errs.push(numberingError);
    if (numberMode === "auto" && numberLoading) errs.push("Poczekaj na sprawdzenie numeracji firmy.");
    if (!invoiceNumber.trim()) errs.push("Wpisz numer faktury.");
    if (editing && draftInvoice?.sellerCompanyId && draftInvoice.sellerCompanyId !== effectiveSellerCompany.id) errs.push("Ta faktura należy do innej firmy. Otwórz ją we właściwym kontekście.");
    for (const [value, label] of [[form.issueDate, "wystawienia"], [form.saleDate, "sprzedaży"], [form.dueDate, "płatności"]]) {
      if (!isIsoCalendarDate(value)) errs.push(`Podaj poprawną datę ${label}.`);
    }
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
    const validLines = form.lines.filter((l) => l.name.trim() && (form.isCorrection ? l.quantity !== 0 : l.quantity > 0));
    if (!correctionAfterValues && validLines.length === 0) errs.push("Dodaj co najmniej jedną pozycję z nazwą i ilością.");
    if (correctionAfterValues && form.lines.some(line => line.quantity < 0)) errs.push("Wpisz prawidłową ilość po korekcie (co najmniej zero). Różnicę obliczamy automatycznie.");
    if (correctionAfterValues && form.lines.some(line => !line.name.trim() && line.quantity !== 0 && line.netPrice !== 0)) errs.push("Uzupełnij nazwę pozycji po korekcie albo usuń jej wiersz.");
    if (form.lines.some((l) => (!form.isCorrection && l.quantity < 0) || l.netPrice < 0)) errs.push("Cena nie może być ujemna. Ujemna ilość jest dostępna tylko dla korekt.");
    if (form.lines.some((l) => !Number.isFinite(l.quantity) || Math.abs(l.quantity) > 1e9 || !Number.isFinite(l.netPrice) || l.netPrice > 1e9)) errs.push("Sprawdź zakres ilości i cen pozycji.");
    if (validLines.length > 200 || documentLines.length > 200) errs.push(form.isCorrection ? "Dokument korekty może zawierać najwyżej 200 pozycji różnicowych. Zmniejsz liczbę zmienianych pozycji." : "Faktura może zawierać najwyżej 200 pozycji.");
    if (validLines.some(l => roundHalfUp(l.quantity, 6) === 0)) errs.push("Ilość wymaga najwyżej sześciu miejsc po przecinku.");

    // Walidacja kursu walutowego dla walut obcych (art. 31a ustawy o VAT)
    if (form.currency !== "PLN") {
      if (isManualRate) {
        const parsedRate = Number(manualRateInput.trim().replace(",", "."));
        if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
          errs.push("Wpisz poprawny kurs waluty (większy od zera).");
        }
        if (!manualJustification.trim()) {
          errs.push("Wpisz uzasadnienie zastosowania własnego kursu waluty (wymóg art. 31a ustawy o VAT).");
        }
      } else if (!activeNbpRate) {
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
      // Reuse the created buyer when an invoice write fails and the user retries.
      setForm(previous => ({ ...previous, contractorId: c.id, useNewContractor: false }));
    }

    const effectiveRate = form.currency !== "PLN"
      ? (isManualRate ? Number(manualRateInput.trim().replace(",", ".")) || null : activeNbpRate?.rate || null)
      : null;

    const totalsCalc = invoiceTotals({ lines: documentLines });
    const netPln = effectiveRate ? round2(totalsCalc.net * effectiveRate) : null;
    const vatPln = effectiveRate ? round2(totalsCalc.vat * effectiveRate) : null;
    const grossPln = effectiveRate ? round2(totalsCalc.gross * effectiveRate) : null;

    const base: InvoicePayload = {
      number: invoiceNumber,
      type: form.type,
      status,
      sellerCompanyId: effectiveSellerCompany.id || undefined,
      autoNumber: numberMode === "auto" && !editing,
      contractorId,
      issueDate: form.issueDate || todayISO(),
      saleDate: form.saleDate || form.issueDate || todayISO(),
      dueDate: form.dueDate || addDaysISO(form.issueDate || todayISO(), form.paymentTermDays),
      currency: form.currency,
      language: form.language,
      paymentMethod: form.paymentMethod,
      paymentTermDays: form.paymentTermDays,
      notes: form.notes.trim() || undefined,
      isSplitPayment: form.isSplitPayment ?? false,
      exemptionBasis: form.exemptionBasis || "",
      gtuCodes: (form.gtuText ?? (form.gtuCodes || []).join(",")).split(",").map(v=>v.trim()).filter(Boolean) as Invoice["gtuCodes"],
      jpkProcedures: (form.proceduresText ?? (form.jpkProcedures || []).join(",")).split(",").map(v=>v.trim()).filter(Boolean) as Invoice["jpkProcedures"],
      isOffline: Boolean(form.isOffline),
      offlineReason: form.isOffline ? form.offlineReason : undefined,
      offlineDeadline: form.isOffline && form.offlineDeadline ? new Date(form.offlineDeadline).toISOString() : undefined,
      lines: documentLines,
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
      exchangeRateTable: form.currency !== "PLN" ? (isManualRate ? "Kurs własny podatnika" : activeNbpRate?.tableNumber || null) : null,
      exchangeRateDate: form.currency !== "PLN" ? (isManualRate ? form.issueDate : activeNbpRate?.effectiveDate || null) : null,
      exchangeRateSource: form.currency !== "PLN" ? (isManualRate ? "Własny kurs podatnika" : activeNbpRate?.source || null) : null,
      exchangeRateRule: form.currency !== "PLN" ? (isManualRate ? "manual" : (form.issueDate < form.saleDate ? "art_31a_issue_date" : "art_31a_sale_date")) : null,
      exchangeRateJustification: form.currency !== "PLN" && isManualRate ? manualJustification.trim() : null,
      totalNetPln: netPln,
      totalVatPln: vatPln,
      totalGrossPln: grossPln,
      bankAccountId: effectiveBankAccountId,
      bankAccountMode: selectedBankAccountId === "saved" ? "preserve" : selectedBankAccountId === "primary" ? "primary" : "auto",
      bankAccountSnapshot: chosenBankAccount ? (chosenBankAccount as any) : undefined,
      buyerTaxIdType: form.useNewContractor ? newContractorTaxIdType : (selectedContractor?.taxIdType || "nip"),
      buyerCountry: form.useNewContractor ? form.newContractor.country : (selectedContractor?.country || "PL"),
    };
    return base;
  };

  /** Zapisywanie przez backend — zwraca fakturę z id nadanym przez serwer. */
  const persist = async (inv: InvoicePayload): Promise<Invoice> => {
    if (editing && draftInvoice) {
      return store.updateInvoice(draftInvoice.id, inv);
    }
    return store.addInvoice(inv);
  };

  const [assistant, setAssistant] = React.useState<{ issues: PreflightIssue[]; canProceed: boolean; action: "save" | "ksef"; snapshot: string } | null>(null);
  const [checkingInvoice, setCheckingInvoice] = React.useState(false);
  const assistantBusy = React.useRef(false);
  const mutationBusy = React.useRef(false);
  const invoiceSnapshot = JSON.stringify({ form, invoiceNumber, seller: effectiveSellerCompany.id, numberMode });
  const checkBeforeAction = async (action: "save" | "ksef") => {
    if (assistantBusy.current || saving) return;
    const errors = validate(); showValidation(errors);
    if (errors.length) { toast("error", "Popraw dane faktury", errors[0]); return; }
    assistantBusy.current = true; setCheckingInvoice(true);
    try {
      const response = await fetch("/api/invoices/preflight", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ ...form, correctionInput: undefined, correctionOriginalLines: undefined, lines: documentLines, companyId: effectiveSellerCompany.id, number: invoiceNumber, autoNumber: numberMode === "auto", invoiceId: editing ? draftInvoice?.id : undefined, buyer: { ...form.newContractor, taxIdType: newContractorTaxIdType } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się sprawdzić faktury.");
      setAssistant({ ...result, action, snapshot: invoiceSnapshot });
    } catch (e) { toast("error", "Asystent przed wysyłką", e instanceof Error ? e.message : "Sprawdź połączenie."); }
    finally { assistantBusy.current = false; setCheckingInvoice(false); }
  };
  const handleSave = async () => {
    if (mutationBusy.current) return;
    const errs = validate();
    showValidation(errs);
    if (errs.length) {
      toast("error", "Nie można zapisać faktury", errs[0]);
      return;
    }
    setSaving("save");
    mutationBusy.current = true;
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
    } finally { mutationBusy.current = false; }
  };

  const handleSaveDraft = async () => {
    if (mutationBusy.current) return;
    const errs = validate();
    if (errs.length) {
      showValidation(errs);
      toast("error", "Popraw błędy", errs[0]);
      return;
    }
    mutationBusy.current = true;
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
    } finally { mutationBusy.current = false; }
  };

  const handleSendKsef = async () => {
    if (mutationBusy.current) return;
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
    mutationBusy.current = true;
    try {
      const inv = await buildInvoice("issued");
      const saved = await persist(inv);
      // Keep the persisted identity if transport fails, so retries update this document instead of creating a duplicate.
      store.setDraft(saved, false, true);
      setForm(previous => ({ ...previous, number: saved.number, contractorId: saved.contractorId, useNewContractor: false }));
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
        toast("error", "KSeF: odrzucono dokument", data.message ?? data.error ?? "Błąd wysyłki do KSeF.");
        setSaving(null);
      }
    } catch (e) {
      setSaving(null);
      toast("error", "Nie udało się wysłać do KSeF", e instanceof Error ? e.message : undefined);
    } finally { mutationBusy.current = false; }
  };

  // ── Globalne skróty klawiszowe w kreatorze faktury ──
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isKsefRegistered) return;
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
          void checkBeforeAction("ksef");
        } else {
          void checkBeforeAction("save");
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

  if (isKsefRegistered && draftInvoice) return <div className="space-y-5">
    <div role="status" className="rounded-xl border bg-muted/30 p-4 text-sm">Faktura ma numer KSeF. Daty, pozycje, numer i rachunek są zablokowane. Zmiana danych dokumentu wymaga faktury korygującej. Możesz zmienić notatki.</div>
    <label className="block space-y-2 text-sm">Notatki<Textarea value={form.notes} onChange={e => set({ notes: e.target.value })} /></label>
    <Button loading={saving === "save"} onClick={async () => { if (mutationBusy.current) return; mutationBusy.current = true; setSaving("save"); try { await store.updateInvoice(draftInvoice.id, { notes: form.notes }); store.setDraft(null, true); toast("success", "Zapisano notatki"); router.push(`/invoices/${draftInvoice.id}`); } catch (error) { toast("error", "Nie zapisano notatek", error instanceof Error ? error.message : undefined); } finally { mutationBusy.current = false; setSaving(null); } }}>Zapisz notatki</Button>
    <InvoicePreview invoice={{ ...draftInvoice, notes: form.notes }} contractor={effectiveContractor} company={effectiveSellerCompany} />
  </div>;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      {/* ── Formularz ── */}
      <div className="min-w-0 space-y-5">
        {cloneLoading && <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm" role="status">Wczytywanie faktury do sklonowania…</p>}
        {cloneError && <div className="rounded-xl border border-rose-500/30 p-3 text-sm space-y-2" role="alert">
          <p>{cloneError}</p>
          <button type="button" className="text-primary underline" onClick={() => setCloneAttempt(value => value + 1)}>Spróbuj ponownie</button>
          <button type="button" className="ml-4 text-primary underline" onClick={() => router.replace("/invoices/new")}>Zacznij pustą fakturę</button>
        </div>}
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
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">Status wersji roboczej:</span>
            {autosaveStatus === "saving" ? (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Zapisywanie w tle…
              </span>
            ) : autosaveStatus === "saved" ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
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
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
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
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
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
              <p className="text-sm">{correctionAfterValues ? "Wpisz prawidłowe wartości po korekcie. System sam obliczy różnicę i zapisze osobną fakturę korygującą z numerem KSeF oryginału (jeśli został nadany). Oryginalna faktura pozostaje bez zmian." : <>Wpisz różnice względem oryginału: ujemna ilość zmniejsza wartość, dodatnia ją zwiększa. Aby zmienić cenę, dodaj pozycję z ujemną ilością i starą ceną oraz dodatnią z nową ceną. Oryginalna faktura pozostaje bez zmian.</>}</p>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-correctionReason" className="text-rose-900 dark:text-rose-300 font-semibold">
                  Przyczyna korekty (pole wymagane w schemacie FA(3)) *
                </Label>
                <Input
                  id="invoice-correctionReason"
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
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
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
            {editing && draftInvoice?.sellerCompanyId && draftInvoice.sellerCompanyId !== effectiveSellerCompany.id && <p className="text-sm text-red-600">Ten dokument należy do innej firmy. Otwórz go w kontekście właściwej firmy.</p>}
            <div className="space-y-1">
              {!editing && <div className="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2">
                <p className="text-sm font-semibold">Jak ponumerować tę fakturę?</p>
                <p className="text-xs text-muted-foreground">Zapamiętany wzór firmy: <span className="font-mono">{effectiveSellerCompany.invoiceNumberPattern || DEFAULT_INVOICE_PATTERN}</span></p>
                <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Sposób numeracji">
                  <Button type="button" variant={numberMode === "auto" ? "primary" : "outline"} aria-pressed={numberMode === "auto"}
                    onClick={() => { setNumberMode("auto"); set({ number: "" }); }}>Kontynuuj automatycznie</Button>
                  <Button type="button" variant={numberMode === "manual" ? "primary" : "outline"} aria-pressed={numberMode === "manual"}
                    onClick={() => { setNumberMode("manual"); set({ number: "" }); requestAnimationFrame(() => document.getElementById("invoice-number")?.focus()); }}>Wpisz numer ręcznie</Button>
                </div>
                {!numberMode && <p className="text-xs text-primary">Wybierz sposób numeracji przed zapisaniem dokumentu.</p>}
              </div>}
              <label htmlFor="invoice-number" className="block text-xs font-semibold">Numer faktury</label>
              <Input id="invoice-number" value={invoiceNumber} maxLength={50} className="w-full max-w-md font-mono"
                disabled={isKsefRegistered || (Boolean(draftInvoice) && draftInvoice?.status !== "draft" && !draftInvoiceIsNew)}
                onChange={(event) => { setNumberMode("manual"); set({ number: event.target.value }); }} />
              <p className="text-xs text-muted-foreground" aria-live="polite">{numberLoading ? "Sprawdzanie numeracji firmy…" : numberingError || `Propozycja: ${suggestedNumber}. Numer możesz zmienić przed wystawieniem.`}</p>
              {numberingError && <button type="button" className="text-xs text-primary underline" onClick={() => { setNumberPreview(value => ({ ...value, key: "" })); setNumberAttempt(value => value + 1); }}>Sprawdź numerację ponownie</button>}
              {lastNumber && <p className="text-xs text-muted-foreground">Ostatnio zapisany numer tej firmy: <span className="font-mono">{lastNumber}</span></p>}
              {effectiveSellerCompany.currentUserRole === "owner" && (
                <div className="pt-1">
                  <button type="button" className="text-xs font-semibold text-primary underline underline-offset-2" onClick={() => setNumberPatternOpen(open => !open)}>
                    {numberPatternOpen ? "Zamknij ustawienia numeracji" : "Ustaw numerację tej firmy"}
                  </button>
                  {numberPatternOpen && <div className="mt-2 max-w-md space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                    <Label htmlFor="invoice-number-preset">Gotowy wariant numeracji</Label>
                    <Select id="invoice-number-preset" display="dropdown" value={INVOICE_NUMBER_PRESETS.some(p => p.pattern === numberPatternInput) ? numberPatternInput : "custom"}
                      onChange={event => { if (event.target.value !== "custom") setNumberPatternInput(event.target.value); }}>
                      <option value="custom">Własny wzór i nazwa</option>
                      {INVOICE_NUMBER_PRESETS.map(preset => <option key={preset.pattern} value={preset.pattern}>{preset.label}</option>)}
                    </Select>
                    <Label htmlFor="invoice-number-pattern">Format numeru dla {effectiveSellerCompany.companyName}</Label>
                    <Input id="invoice-number-pattern" value={numberPatternInput} maxLength={80} className="font-mono" onChange={event => setNumberPatternInput(event.target.value)} placeholder="FV NN/MM/RRRR" />
                    <p className="text-xs text-muted-foreground">Dowolny tekst i separator, np. ENERVIO-{'{NN}'}/{'{MM}'}/{'{YYYY}'}. {'{N}'}–{'{NNNNNNNN}'} = licznik, {'{DD}'} = dzień, {'{MM}'} = miesiąc, {'{WW}'} = tydzień ISO, {'{YYYY}'} = rok, {'{GGGG}'} = rok ISO. {'{PREFIX}'} dobiera FV/FZ/PRO/KOR.</p>
                    <p className="text-xs text-muted-foreground">Bez roku licznik zachowuje ciągłość w kolejnych latach. Sama data nie zapewnia unikalności — wzór automatyczny musi mieć licznik.</p>
                    {numberMode === "manual" && /\d/.test(form.number) && <div className="space-y-2 border-t border-border pt-2">
                      <Label htmlFor="invoice-counter-fragment">Który fragment ręcznego numeru ma rosnąć?</Label>
                      <Select id="invoice-counter-fragment" display="dropdown" value={effectiveCounterFragment} onChange={event => setCounterFragment(Number(event.target.value))}>
                        {numberFragments.map((match, index) => <option key={index} value={index}>{match[0]} · fragment {index + 1}</option>)}
                      </Select>
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        try { setNumberPatternInput(invoicePatternFromExample(form.number, effectiveCounterFragment)); }
                        catch (error) { toast("error", "Sprawdź numer", error instanceof Error ? error.message : "Nieprawidłowy numer."); }
                      }}>Utwórz wzór z wpisanego numeru</Button>
                      <p className="text-xs text-muted-foreground">Pozostałe fragmenty zostają stałe. Zastąp datę znacznikami powyżej, jeśli ma zmieniać się automatycznie. Zapisz format, aby zapamiętać go na koncie firmy.</p>
                    </div>}
                    <Button type="button" size="sm" disabled={savingNumberPattern} onClick={() => void saveNumberPattern()}>Zapisz format</Button>
                  </div>}
                </div>
              )}
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
                    <Label htmlFor="invoice-new-name">Nazwa firmy *</Label>
                    <Input id="invoice-new-name"
                      value={form.newContractor.name}
                      onChange={(e) => set({ newContractor: { ...form.newContractor, name: e.target.value } })}
                      placeholder="np. DemoIT Solutions Sp. z o.o."
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 sm:col-span-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="invoice-new-country-choice">Kraj kontrahenta</Label>
                      <Select id="invoice-new-country-choice"
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
                      <Label htmlFor="invoice-new-tax-type">Typ identyfikatora podatkowego</Label>
                      <Select id="invoice-new-tax-type"
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
                      <Label htmlFor={newContractorTaxIdType === "nip" ? undefined : "invoice-new-tax-id"}>
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
                        <Input id="invoice-new-tax-id"
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
                      <Label htmlFor="invoice-new-postal">Kod pocztowy *</Label>
                      <Input id="invoice-new-postal"
                        value={form.newContractor.postal}
                        onChange={(e) => set({ newContractor: { ...form.newContractor, postal: e.target.value } })}
                        placeholder="00-001"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invoice-new-city">Miasto *</Label>
                      <Input id="invoice-new-city"
                        value={form.newContractor.city}
                        onChange={(e) => set({ newContractor: { ...form.newContractor, city: e.target.value } })}
                        placeholder="Warszawa"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="invoice-new-street">Ulica i numer *</Label>
                    <Input id="invoice-new-street"
                      value={form.newContractor.street}
                      onChange={(e) => set({ newContractor: { ...form.newContractor, street: e.target.value } })}
                      placeholder="ul. Przykładowa 1"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invoice-new-country">Kraj</Label>
                    <Input id="invoice-new-country"
                      value={form.newContractor.country}
                      onChange={(e) => set({ newContractor: { ...form.newContractor, country: e.target.value } })}
                      placeholder="PL"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invoice-new-iban">Nr konta (IBAN)</Label>
                    <Input id="invoice-new-iban"
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
              {correctionAfterValues ? "Pozycje po korekcie" : "Pozycje faktury"}
            </CardTitle>
            <CardDescription>Towary i usługi — stawki VAT (23%, 8%, 5%, 0%, zw, np, oo), przeliczenia kwot na żywo</CardDescription>
          </CardHeader>
          <CardContent>
            <LineItemsEditor
              lines={form.lines}
              onChange={(lines) => set({ lines })}
              currency={form.currency}
              correction={Boolean(form.isCorrection && !correctionAfterValues)}
              products={products}
            />
            {correctionAfterValues && <div className="mt-4 space-y-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">Ustaw ilość na 0 lub usuń wiersz, aby skorygować całą pozycję. Możesz zmienić cenę, ilość, VAT lub dodać pozycję.</p>
              <dl className="grid gap-3 sm:grid-cols-3" aria-label="Podsumowanie korekty">
                <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">Przed korektą brutto</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(invoiceTotals({ lines: form.correctionOriginalLines! }).gross, form.currency)}</dd></div>
                <div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">Po korekcie brutto</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(invoiceTotals({ lines: form.lines.map(normalizeInvoiceLineAmounts) }).gross, form.currency)}</dd></div>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3"><dt className="text-xs text-muted-foreground">Kwota korekty brutto</dt><dd className="mt-1 font-semibold tabular-nums" data-testid="correction-difference">{formatMoney(totals.gross, form.currency)}</dd></div>
              </dl>
            </div>}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="invoice-issueDate">Data wystawienia *</Label>
                <Input id="invoice-issueDate" type="date" value={form.issueDate} aria-invalid={Boolean(fieldErrors.issueDate)} aria-describedby={fieldErrors.issueDate ? "invoice-issueDate-error" : undefined} onChange={(e) => set({ issueDate: e.target.value })} />
                {fieldErrors.issueDate && <p id="invoice-issueDate-error" className="text-xs text-destructive">{fieldErrors.issueDate}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-saleDate">Data sprzedaży</Label>
                <Input id="invoice-saleDate" type="date" value={form.saleDate} aria-invalid={Boolean(fieldErrors.saleDate)} aria-describedby={fieldErrors.saleDate ? "invoice-saleDate-error" : undefined} onChange={(e) => set({ saleDate: e.target.value })} />
                {fieldErrors.saleDate && <p id="invoice-saleDate-error" className="text-xs text-destructive">{fieldErrors.saleDate}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-dueDate">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="invoice-paymentMethod">Metoda płatności</Label>
                <Select id="invoice-paymentMethod"
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
                <Label htmlFor="invoice-paymentTermDays">Termin (dni)</Label>
                <Select id="invoice-paymentTermDays" value={form.paymentTermDays} onChange={(e) => onTermChange(Number(e.target.value))}>
                  {[7, 14, 21, 30, 45, 60].map((d) => (
                    <option key={d} value={d}>
                      {d} dni
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-currency">Waluta</Label>
                <Select id="invoice-currency" value={form.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>
                  {(["PLN", "EUR", "USD", "GBP", "CHF", "NOK", "SEK", "CAD"] as const).map((c) => (
                    <option key={c} value={c}>
                      {currencyNames[c] || c}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Wybór rachunku bankowego firmy */}
              {(effectiveSellerCompany.bankAccount || companyAccounts.length > 0) && (
                <div className="min-w-0 space-y-1.5 sm:col-span-3">
                  <Label htmlFor="invoice-bank-account">Rachunek bankowy firmy dla tej faktury</Label>
                  <Select
                    id="invoice-bank-account"
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                  >
                    <option value="auto">Domyślny dla {form.currency}: {defaultBankAccount?.accountNumber || effectiveSellerCompany.bankAccount || "Brak rachunku"}</option>
                    {savedBankAccount && <option value="saved">Zapisany na fakturze: {savedBankAccount.accountNumber}</option>}
                    {effectiveSellerCompany.bankAccount && !companyAccounts.some(account => normalizedBankAccount(account.accountNumber) === normalizedBankAccount(effectiveSellerCompany.bankAccount)) &&
                      <option value="primary">Główny rachunek profilu: {effectiveSellerCompany.bankAccount}</option>}
                    {companyAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.currency} · {b.accountName || b.bankName || "Rachunek"} · {b.accountNumber} {b.isDefault ? "(domyślny)" : ""}
                      </option>
                    ))}
                  </Select>
                  <div className="min-w-0 break-words rounded-lg border bg-muted/30 p-3 text-xs space-y-1" aria-label="Wybrany rachunek do płatności">
                    <p>Odbiorca: <b>{chosenBankAccount?.beneficiaryName || effectiveSellerCompany.companyName}</b></p>
                    <p className="break-all">IBAN / numer konta: <b className="font-mono">{chosenBankAccount?.accountNumber || "Brak rachunku"}</b></p>
                    <p>Waluta rachunku: <b>{chosenBankAccount?.currency || "—"}</b> · Bank: <b>{chosenBankAccount?.bankName || "Nie podano nazwy banku"}</b></p>
                    <p>{selectedBankAccountId === "saved" ? "Rachunek zapisany podczas wystawienia tej faktury." : chosenBankAccount === primaryBankAccount ? "Źródło: główny rachunek w profilu firmy." : "Źródło: rachunki wybranej firmy."}</p>
                    <Link prefetch={false} className="inline-block text-primary underline" href="/settings/currencies">Zarządzaj rachunkami i nazwą banku</Link>
                  </div>
                  {form.currency !== "PLN" && !companyAccounts.some((b) => b.currency === form.currency || b.currency === "MULTI") && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-1">
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
                    disabled={nbpLoading}
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

                {activeNbpRate && !isManualRate ? (
                  <div className="p-3 bg-card rounded-lg border border-border/80 space-y-1.5">
                    <p className="font-medium text-foreground">
                      Tabela NBP: <span className="font-bold text-primary">{activeNbpRate.tableNumber}</span> z dnia{" "}
                      <span className="font-bold">{activeNbpRate.effectiveDate}</span>
                    </p>
                    <p className="text-xs">
                      Oficjalny średni kurs: <b className="text-foreground">1 {form.currency} = {activeNbpRate.rate.toFixed(4)} PLN</b>
                    </p>
                    <div className="pt-1.5 border-t border-border/60 grid grid-cols-3 gap-2 text-[11.5px]">
                      <div>
                        <span className="text-muted-foreground">Netto w PLN: </span>
                        <b className="text-foreground">{formatMoney(convertToPln(totals.net, activeNbpRate.rate), "PLN")}</b>
                      </div>
                      <div>
                        <span className="text-muted-foreground">VAT w PLN: </span>
                        <b className="text-primary">{formatMoney(convertToPln(totals.vat, activeNbpRate.rate), "PLN")}</b>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Brutto w PLN: </span>
                        <b className="text-foreground">{formatMoney(convertToPln(totals.gross, activeNbpRate.rate), "PLN")}</b>
                      </div>
                    </div>
                  </div>
                ) : !isManualRate ? (
                  <p className={nbpError ? "text-destructive" : "text-muted-foreground italic"} role={nbpError ? "alert" : "status"}>{nbpError || (nbpLoading ? "Pobieranie tabeli kursowej z NBP..." : "Brak kursu dla wybranych dat. Odśwież kurs lub podaj uzasadniony kurs ręczny.")}</p>
                ) : null}

                {/* Przełącznik kursu ręcznego */}
                <div className="pt-2 border-t border-primary/20 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isManualRate}
                      onChange={(e) => {
                        setIsManualRate(e.target.checked);
                        if (!e.target.checked && activeNbpRate) {
                          setManualRateInput(String(activeNbpRate.rate));
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
                        <Label htmlFor="invoice-manualRate" className="text-[11.5px]">Zastosowany kurs (PLN) *</Label>
                        <Input id="invoice-manualRate"
                          type="text"
                          value={manualRateInput}
                          onChange={(e) => setManualRateInput(e.target.value)}
                          placeholder="np. 4.2500"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="invoice-manualJustification" className="text-[11.5px]">
                          Uzasadnienie zastosowania własnego kursu * (wymóg art. 31a ustawy o VAT)
                        </Label>
                        <Input id="invoice-manualJustification"
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
                  <label htmlFor="invoice-isRecurring" className="text-xs font-semibold text-foreground">Faktura cykliczna (automatyczne odnawianie)</label>
                  <p className="text-[11px] text-muted-foreground">Generuj kolejne dokumenty w zadanym cyklu czasowym</p>
                </div>
                <input
                  id="invoice-isRecurring"
                  type="checkbox"
                  disabled={Boolean(form.isCorrection)}
                  checked={Boolean(form.isRecurring)}
                  onChange={(e) => set({ isRecurring: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </div>

              {form.isRecurring && (
                <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/50">
                  <div className="space-y-1">
                    <Label htmlFor="invoice-recurringInterval" className="text-[11.5px]">Interwał odnawiania</Label>
                    <Select id="invoice-recurringInterval"
                      value={form.recurringInterval || "monthly"}
                      onChange={(e) => set({ recurringInterval: e.target.value })}
                    >
                      <option value="monthly">Co miesiąc (zalecane dla abonamentów)</option>
                      <option value="quarterly">Co kwartał</option>
                      <option value="yearly">Co rok</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="invoice-recurringNextDate" className="text-[11.5px]">Data kolejnego wystawienia</Label>
                    <Input id="invoice-recurringNextDate"
                      type="date"
                      value={form.recurringNextDate || ""}
                      onChange={(e) => set({ recurringNextDate: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-[12.5px] font-medium">Język dokumentu</p>
              <div role="group" aria-label="Język dokumentu" className="inline-flex rounded-lg bg-muted/70 p-1 text-[13px] font-medium gap-1 flex-wrap">
                {(["PL", "EN", "PL/EN"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={form.language === l}
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
              <details className="mb-4 rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Oznaczenia VAT i JPK</summary><div className="mt-3 space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.isSplitPayment} onChange={e=>setForm(f=>({...f,isSplitPayment:e.target.checked}))}/>Mechanizm podzielonej płatności (MPP)</label><label className="block text-sm">Podstawa prawna zwolnienia VAT<Input value={form.exemptionBasis||""} onChange={e=>setForm(f=>({...f,exemptionBasis:e.target.value}))} placeholder="np. art. 113 ust. 1 ustawy o VAT"/></label><label className="block text-sm">Kody GTU, oddzielone przecinkami<Input value={form.gtuText ?? (form.gtuCodes||[]).join(", ")} onChange={e=>setForm(f=>({...f,gtuText:e.target.value}))} placeholder="GTU_01, GTU_02"/></label><label className="block text-sm">Procedury JPK, oddzielone przecinkami<Input value={form.proceduresText ?? (form.jpkProcedures||[]).join(", ")} onChange={e=>setForm(f=>({...f,proceduresText:e.target.value}))} placeholder="np. TP"/></label><p className="text-xs text-muted-foreground">Obowiązek MPP zależy m.in. od progu 15 000 zł i towarów/usług z załącznika 15. Oznaczenia ustal z księgowością. Bieżący eksport JPK obsługuje zwykłe transakcje i odrzuca procedury szczególne.</p></div></details>
              <Label htmlFor="invoice-notes">Uwagi / Informacje dodatkowe</Label>
              <Textarea id="invoice-notes"
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
            <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
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
              {!form.isOffline && <Button onClick={() => void checkBeforeAction("save")} loading={saving === "save"}>
                <CheckCircle2 className="h-4 w-4" /> {form.isProforma ? `Zapisz proformę ${invoiceNumber}` : isPurchase ? "Zapisz fakturę zakupową (FZ)" : (form.isCorrection ? "Zapisz korektę" : "Zapisz fakturę")}
              </Button>}
              {!isPurchase && !form.isOffline && !isKsefRegistered && !form.isProforma && (
                <Button onClick={() => void checkBeforeAction("ksef")} loading={saving === "ksef"} variant="subtle">
                  <Send className="h-4 w-4" /> Wyślij do KSeF
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Podgląd na żywo ── */}
      <div className="min-w-0 xl:sticky xl:top-24 xl:h-fit">
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Eye className="h-4 w-4 text-muted-foreground" /> Podgląd na żywo
            <Badge tone="outline">{form.language === "PL" ? "PL" : "EN"} · {form.currency}</Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="ghost" size="sm" onClick={exports.exportPdf} title="Podgląd aktualnych danych formularza (drukuj / zapisz jako PDF)">
              <Printer className="h-3.5 w-3.5" /> Podgląd PDF
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
          {!form.isOffline && <Button onClick={() => void checkBeforeAction("save")} loading={saving === "save"} className="flex-1">
            <CheckCircle2 className="h-4 w-4" /> {form.isProforma ? `Zapisz proformę ${invoiceNumber}` : isPurchase ? `Zapisz fakturę zakupową ${invoiceNumber}` : `Zapisz fakturę ${invoiceNumber}`}
          </Button>}
          {!isPurchase && !form.isOffline && !isKsefRegistered && !form.isProforma && (
            <Button onClick={() => void checkBeforeAction("ksef")} loading={saving === "ksef"} variant="subtle" className="flex-1" title="Po kliknięciu faktura zostanie zaszyfrowana i przekazana do serwerów Ministerstwa Finansów">
              <Send className="h-4 w-4" /> Wystaw i Wyślij do KSeF
            </Button>
          )}
        </div>

      </div>

      {/* Szybkie dodanie nowej firmy / NIP */}
      <Dialog open={Boolean(assistant)} onClose={() => setAssistant(null)} title="Asystent przed wysyłką faktury" description="Sprawdź wskazówki i zatwierdź dokument. Asystent nie zmienia danych automatycznie." footer={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setAssistant(null)}>Wróć do edycji</Button><Button disabled={!assistant?.canProceed || assistant?.snapshot !== invoiceSnapshot || Boolean(saving)} onClick={() => { const action = assistant?.action; setAssistant(null); if (action === "ksef") void handleSendKsef(); else void handleSave(); }}>Zatwierdzam i kontynuuję</Button></div>}>
        <div className="space-y-3 text-sm">{assistant?.issues.length ? assistant.issues.map(issue => <div key={issue.code} className="rounded-lg border p-3"><p className="font-medium">{issue.severity === "error" ? "Popraw przed zatwierdzeniem" : "Sprawdź"} · {issue.message}</p>{issue.href && <a href={issue.href} target="_blank" rel="noopener noreferrer" className="mt-2 block text-primary underline">Otwórz dokument →</a>}</div>) : <p>Nie znaleziono problemów w danych i numeracji. Zweryfikuj podgląd oraz właściwą stawkę VAT.</p>}{assistant?.snapshot !== invoiceSnapshot && <p role="alert">Dane zmieniły się. Zamknij asystenta i sprawdź fakturę ponownie.</p>}</div>
      </Dialog>
      {checkingInvoice && <p role="status" className="text-sm text-muted-foreground">Asystent sprawdza dane i duplikaty…</p>}
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
