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
  const invoiceNumber = draftInvoice?.number ?? nextInvoiceNumber(invoices, form.type);

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
    if (form.useNewContractor) {
      const nc = form.newContractor;
      if (!nc.name.trim()) errs.push("Podaj nazwę nowego kontrahenta.");
      if (!isValidNipFormat(nc.nip)) errs.push("Nowy kontrahent: NIP ma nieprawidłową sumę kontrolną.");
      if (!nc.street.trim() || !nc.city.trim() || !nc.postal.trim()) errs.push("Nowy kontrahent: uzupełnij adres.");
    } else if (!form.contractorId) {
      errs.push("Wybierz kontrahenta (lub dodaj nowego).");
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
      toast("info", "Szkic zapisany", saved.number);
      store.setDraft(null, true);
      router.push("/invoices");
    } catch (e) {
      toast("error", "Nie udało się zapisać szkicu", e instanceof Error ? e.message : undefined);
    }
  };

  const handleSendKsef = async () => {
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
      const xmlRes = await import("@/lib/xml");
      const xml = xmlRes.buildFaVatXml(saved, effectiveSellerCompany);
      const res = await fetch("/api/ksef/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml, environment: ksefEnv, invoiceId: saved.id, invoiceNumber: saved.number }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.ksefNumber) {
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
        toast("success", "Wysłano do KSeF (demo)", `${saved.number} → numer KSeF: ${data.ksefNumber}`);
        store.setDraft(null, true);
        router.push("/invoices");
      } else {
        toast("error", "KSeF: odrzucono dokument", data.message ?? "Błąd API demo.");
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
              , aby Twoje dane pojawiły się na fakturze i w pliku XML FA(2)/FA(3).
            </span>
          </div>
        )}

        {/* Sprzedawca (Wystawca faktury) - Wybór firmy / spółki */}
        <Card className="border-primary/25 bg-card">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <Building2 className="h-4 w-4 text-primary" /> Sprzedawca (Wystawca)
              </CardTitle>
              <CardDescription>
                Wybierz profil spółki / NIP, z którego wystawiasz ten dokument
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCompanyModalOpen(true)}
              className="gap-1.5 font-medium text-[12px] h-8"
            >
              <Plus className="h-3.5 w-3.5 text-primary" /> + Szybkie dodanie nowej firmy/NIP
            </Button>
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
              <div className="rounded-lg border border-border/80 bg-muted/20 p-3 text-[12.5px] grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-foreground">
                    {effectiveSellerCompany.companyName || effectiveSellerCompany.name}
                  </p>
                  <p className="font-mono text-muted-foreground text-[12px]">
                    NIP: {formatNip(effectiveSellerCompany.nip)}
                  </p>
                  <p className="text-muted-foreground text-[12px]">
                    {[
                      [effectiveSellerCompany.street, effectiveSellerCompany.buildingNumber].filter(Boolean).join(" ") +
                        (effectiveSellerCompany.flatNumber ? `/${effectiveSellerCompany.flatNumber}` : ""),
                      `${effectiveSellerCompany.postalCode || effectiveSellerCompany.postal || ""} ${effectiveSellerCompany.city || ""}`.trim(),
                    ].filter(Boolean).join(", ")}
                  </p>
                </div>
                <div className="sm:text-right space-y-1">
                  {(effectiveSellerCompany.bankAccount || effectiveSellerCompany.iban) && (
                    <p className="font-mono text-[11.5px] text-muted-foreground truncate">
                      IBAN: {effectiveSellerCompany.bankAccount || effectiveSellerCompany.iban}
                    </p>
                  )}
                  <div className="flex sm:justify-end gap-1 pt-1">
                    {effectiveSellerCompany.ksefToken ? (
                      <Badge tone="success" className="text-[10.5px]">
                        <ShieldCheck className="h-3 w-3 mr-1" /> Dedykowany token KSeF
                      </Badge>
                    ) : (
                      <Badge tone="outline" className="text-[10.5px] text-muted-foreground">
                        Domyślny KSeF konta
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Typ faktury */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Typ dokumentu</CardTitle>
              <CardDescription>Faktura sprzedaży lub zakupowa (FZ)</CardDescription>
            </div>
            <div className="inline-flex rounded-lg bg-muted/70 p-1 text-[13px] font-medium">
              {(["sale", "purchase"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => set({ type: t })}
                  className={
                    form.type === t
                      ? "rounded-md bg-card px-3 py-1 shadow-sm ring-1 ring-border"
                      : "px-3 py-1 text-muted-foreground hover:text-foreground"
                  }
                >
                  {t === "sale" ? "Sprzedaż (FV)" : "Zakup (FZ)"}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-[12.5px] text-muted-foreground">
              {form.type === "sale"
                ? "Faktura VAT wystawiana Twoim kontrahentom."
                : "Faktura zakupowa od kontrahenta — trafi do zakupów KSeF."}
            </p>
          </CardContent>
        </Card>

        {/* Kontrahent */}
        <Card>
          <CardHeader>
            <CardTitle>Kontrahent</CardTitle>
            <CardDescription>
              {form.type === "sale" ? "Nabywca" : "Sprzedawca"} — wybierz z bazy lub dodaj nowego
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
                    (zostanie dodany do bazy)
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
                  <div className="space-y-1.5">
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

        {/* Daty, płatność, waluta, język */}
        <Card>
          <CardHeader>
            <CardTitle>Parametry faktury</CardTitle>
            <CardDescription>Daty, płatność, waluta i język dokumentu</CardDescription>
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
                  <option value="transfer">Przelew</option>
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

            <div className="space-y-1.5">
              <Label>Język dokumentu</Label>
              <div className="inline-flex rounded-lg bg-muted/70 p-1 text-[13px] font-medium">
                {(["PL", "EN"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => set({ language: l })}
                    className={
                      form.language === l
                        ? "rounded-md bg-card px-3 py-1 shadow-sm ring-1 ring-border"
                        : "px-3 py-1 text-muted-foreground hover:text-foreground"
                    }
                  >
                    {l === "PL" ? "Polski" : "English"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Uwagi</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="np. numer zamówienia, zapłata w terminie 14 dni…"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pozycje */}
        <Card>
          <CardHeader>
            <CardTitle>Pozycje faktury</CardTitle>
            <CardDescription>Dynamiczna lista — nazwa, ilość, jednostka, netto, VAT, brutto</CardDescription>
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

        {/* Podsumowanie + akcje (mobile) */}
        <Card className="xl:hidden">
          <CardHeader>
            <CardTitle>Podsumowanie</CardTitle>
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
                <CheckCircle2 className="h-4 w-4" /> Zapisz fakturę
              </Button>
              <Button onClick={handleSendKsef} loading={saving === "ksef"} variant="subtle">
                <Send className="h-4 w-4" /> Wyślij do KSeF
              </Button>
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
            <Button variant="ghost" size="sm" onClick={exports.exportXml} title="Eksport XML FA(2)">
              <FileCode2 className="h-3.5 w-3.5" /> XML
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
            <CheckCircle2 className="h-4 w-4" /> Zapisz fakturę {invoiceNumber}
          </Button>
          <Button onClick={handleSendKsef} loading={saving === "ksef"} variant="subtle" className="flex-1">
            <Send className="h-4 w-4" /> Wyślij do KSeF (demo)
          </Button>
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
