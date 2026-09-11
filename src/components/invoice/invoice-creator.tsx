"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { useAppStore, nextInvoiceNumber } from "@/lib/store";
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
import { CompanyModal } from "@/components/company/company-modal";
import { InfoTooltip, HelpTooltip } from "@/components/ui/tooltip";
import { useInvoiceExports } from "@/lib/invoice-actions";

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
  type: InvoiceType;
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
    type: inv.type,
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
    type: "sale",
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
type InvoicePayload = Omit<Invoice, "id" | "createdAt">;

export function InvoiceCreator() {
  const router = useRouter();
  const toast = useToast();
  const store = useAppStore();
  const { contractors, products, company, companies, invoices, draftInvoice, draftInvoiceIsNew, ksef } = store;
  const ksefEnv = ksef?.environment ?? "demo";

  const defaultCompany =
    companies.find((c) => c.isDefault) ??
    companies[0] ??
    company ??
    EMPTY_COMPANY;

  const [form, setForm] = React.useState<FormState>(() =>
    draftInvoice ? formFromInvoice(draftInvoice, defaultCompany.id) : freshForm(defaultCompany.id)
  );

  // ── Autosave stanu roboczego w localStorage ──
  const DRAFT_KEY = "fakturo_local_draft_v2";
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
          setForm(parsed.form);
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
  const [companyModalOpen, setCompanyModalOpen] = React.useState(false);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Synchronizacja firmy domyślnej po załadowaniu danych
  React.useEffect(() => {
    if (!form.sellerCompanyId && defaultCompany.id) {
      setForm((f) => ({ ...f, sellerCompanyId: defaultCompany.id }));
    }
  }, [form.sellerCompanyId, defaultCompany.id]);

  const effectiveSellerCompany: CompanyProfile =
    companies.find((c) => c.id === form.sellerCompanyId) ?? defaultCompany ?? EMPTY_COMPANY;

  const editing = !!draftInvoice && !draftInvoiceIsNew;
  const invoiceNumber = draftInvoice?.number ?? nextInvoiceNumber(invoices, form.type, form.isCorrection);
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
    sellerCompanyId: form.sellerCompanyId || undefined,
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
    if (form.isCorrection && !form.correctionReason?.trim()) {
      errs.push("Faktura korygująca wymaga podania przyczyny korekty.");
    }
    if (form.useNewContractor) {
      const nc = form.newContractor;
      if (!nc.name.trim()) errs.push("Podaj nazwę nowego kontrahenta.");
      if (!isValidNipFormat(nc.nip)) errs.push("Nowy kontrahent: NIP ma nieprawidłową sumę kontrolną.");
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
    return errs;
  };

  /** Buduje payload faktury; nowego kontrahenta zapisuje przez API (zwraca id z backendu). */
  const buildInvoice = async (status: Invoice["status"]): Promise<InvoicePayload> => {
    let contractorId = form.contractorId;
    if (form.useNewContractor) {
      const nc = form.newContractor;
      const c = await store.addContractor({
        name: nc.name.trim(),
        nip: normalizeNip(nc.nip),
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
    const base: InvoicePayload = {
      number: invoiceNumber,
      type: form.type,
      status,
      sellerCompanyId: form.sellerCompanyId || undefined,
      contractorId,
      issueDate: form.issueDate || todayISO(),
      saleDate: form.saleDate || form.issueDate || todayISO(),
      dueDate: form.dueDate || addDaysISO(form.issueDate || todayISO(), form.paymentTermDays),
      currency: form.currency,
      language: form.language,
      paymentMethod: form.paymentMethod,
      paymentTermDays: form.paymentTermDays,
      notes: form.notes.trim() || undefined,
      lines: form.lines
        .filter((l) => l.name.trim() && l.quantity > 0)
        .map((l) => ({ ...l, netPrice: round2(Number(l.netPrice) || 0), quantity: round2(Number(l.quantity) || 0) })),
      isCorrection: form.isCorrection,
      correctionReason: form.correctionReason?.trim() || undefined,
      originalInvoiceId: form.originalInvoiceId || undefined,
      originalInvoiceNumber: form.originalInvoiceNumber || undefined,
      originalIssueDate: form.originalIssueDate || undefined,
      originalKsefNumber: form.originalKsefNumber || undefined,
      isRecurring: form.isRecurring,
      recurringInterval: form.recurringInterval,
      recurringNextDate: form.recurringNextDate,
      recurringAutoSend: form.recurringAutoSend,
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
    setErrors(errs);
    if (errs.length) {
      toast("error", "Nie można zapisać faktury", errs[0]);
      return;
    }
    setSaving("save");
    try {
      const inv = await buildInvoice("issued");
      const saved = await persist(inv);
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast("success", `Zapisano fakturę ${saved.number}`, "Faktura oznaczona jako wystawiona.");
      store.setDraft(null, true);
      router.push("/invoices");
    } catch (e) {
      toast("error", "Nie udało się zapisać", e instanceof Error ? e.message : undefined);
      setSaving(null);
    }
  };

  const handleSaveDraft = async () => {
    const errs = validate();
    if (errs.length) {
      setErrors(errs);
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
      toast("error", "Nie udało się zapisać szkicu", e instanceof Error ? e.message : undefined);
    }
  };

  const handleSendKsef = async () => {
    if (isPurchase) {
      toast("error", "Błąd logiczny", "Faktura zakupowa (FZ) nie może być wysłana do KSeF jako faktura sprzedaży. Faktury zakupowe są odbierane z KSeF.");
      return;
    }
    if (isKsefRegistered) {
      toast("error", "Błąd KSeF", "Ta faktura posiada już nadany numer KSeF i nie może zostać wysłana ponownie.");
      return;
    }
    const errs = validate();
    setErrors(errs);
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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      {/* ── Formularz ── */}
      <div className="space-y-5">
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
          {form.isCorrection && (
            <Badge tone="danger" className="text-[11px] font-bold">
              Tryb: KOREKTA (FA-3 / KOR)
            </Badge>
          )}
        </div>

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
                <HelpTooltip text="Wybierz spółkę / NIP wystawcy oraz rodzaj dokumentu (Sprzedaż / Zakup)." />
              </CardTitle>
              <CardDescription>
                Wybierz profil spółki / NIP, z którego wystawiasz ten dokument
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-muted/70 p-1 text-[12px] font-medium">
                {(["sale", "purchase"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => set({ type: t })}
                    className={
                      form.type === t
                        ? "rounded-md bg-card px-2.5 py-0.5 shadow-sm ring-1 ring-border text-foreground font-semibold"
                        : "px-2.5 py-0.5 text-muted-foreground hover:text-foreground"
                    }
                  >
                    {t === "sale" ? "Sprzedaż (FV)" : "Zakup (FZ)"}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCompanyModalOpen(true)}
                className="gap-1 font-medium text-[11px] h-7 px-2"
              >
                <Plus className="h-3 w-3 text-primary" /> Nowa firma
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={form.sellerCompanyId}
              onChange={(e) => {
                if (e.target.value === "__new_company__") {
                  setCompanyModalOpen(true);
                } else {
                  set({ sellerCompanyId: e.target.value });
                }
              }}
            >
              <option value="">— wybierz spółkę / NIP wystawcy —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName} · NIP: {formatNip(c.nip)} {c.isDefault ? "★ [Domyślna]" : ""}
                </option>
              ))}
              <option value="__new_company__">➕ Dodaj nowy profil firmy / NIP…</option>
            </Select>

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
                    {effectiveSellerCompany.ksefToken ? (
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
              Wybierz kontrahenta z listy lub wpisz NIP, aby pobrać dane z bazy GUS / VIES
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Select
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
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>NIP *</Label>
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
                  </div>
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
                <Input type="date" value={form.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Data sprzedaży</Label>
                <Input type="date" value={form.saleDate} onChange={(e) => set({ saleDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Termin płatności{" "}
                  {!form.dueTouched && <span className="font-normal text-muted-foreground">(auto)</span>}
                </Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set({ dueDate: e.target.value, dueTouched: true })}
                />
              </div>
            </div>

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
                  {(["PLN", "EUR", "USD"] as const).map((c) => (
                    <option key={c} value={c}>
                      {currencyNames[c]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

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
              <div className="inline-flex rounded-lg bg-muted/70 p-1 text-[13px] font-medium">
                {(["PL", "EN"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => set({ language: l })}
                    className={
                      form.language === l
                        ? "rounded-md bg-card px-3 py-1 shadow-sm ring-1 ring-border text-foreground font-semibold"
                        : "px-3 py-1 text-muted-foreground hover:text-foreground"
                    }
                  >
                    {l === "PL" ? "Polski" : "English"}
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
              <Button onClick={handleSave} loading={saving === "save"}>
                <CheckCircle2 className="h-4 w-4" /> {isPurchase ? "Zapisz fakturę zakupową (FZ)" : (form.isCorrection ? "Zapisz korektę" : "Zapisz fakturę")}
              </Button>
              {!isPurchase && !isKsefRegistered && (
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
          <Button onClick={handleSave} loading={saving === "save"} className="flex-1">
            <CheckCircle2 className="h-4 w-4" /> {isPurchase ? `Zapisz fakturę zakupową ${invoiceNumber}` : `Zapisz fakturę ${invoiceNumber}`}
          </Button>
          {!isPurchase && !isKsefRegistered && (
            <Button onClick={handleSendKsef} loading={saving === "ksef"} variant="subtle" className="flex-1" title="Po kliknięciu faktura zostanie zaszyfrowana i przekazana do serwerów Ministerstwa Finansów">
              <Send className="h-4 w-4" /> Wystaw i Wyślij do KSeF
            </Button>
          )}
        </div>

        {errors.length > 0 && (
          <div className="no-print mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-[12.5px] text-red-600 dark:text-red-400">
            <p className="mb-1 font-semibold">Popraw przed zapisem:</p>
            <ul className="list-inside list-disc space-y-0.5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Szybkie dodanie nowej firmy / NIP */}
      <CompanyModal
        open={companyModalOpen}
        onClose={() => setCompanyModalOpen(false)}
        onSaved={(c) => set({ sellerCompanyId: c.id })}
      />
    </div>
  );
}
