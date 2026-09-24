"use client";

import * as React from "react";
import { Building2, Check, Download, KeyRound, Loader2, Save, Sparkles, Image as ImageIcon, Upload, X, CreditCard, Plus, Trash2, Globe } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Checkbox, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { useAppStore } from "@/lib/store";
import { isValidNipFormat, normalizeNip, formatNip } from "@/lib/validation";
import type { CompanyProfile, CompanyBankAccount } from "@/lib/types";

interface CompanyModalProps {
  open: boolean;
  onClose: () => void;
  initialData?: CompanyProfile | null;
  onSaved?: (company: CompanyProfile) => void;
}

interface FormState {
  nip: string;
  companyName: string;
  street: string;
  buildingNumber: string;
  flatNumber: string;
  city: string;
  postalCode: string;
  bankAccount: string;
  ksefToken: string;
  isDefault: boolean;
  logoUrl: string;
  accentColor: string;
}

const emptyForm: FormState = {
  nip: "",
  companyName: "",
  street: "",
  buildingNumber: "",
  flatNumber: "",
  city: "",
  postalCode: "",
  bankAccount: "",
  ksefToken: "",
  isDefault: false,
  logoUrl: "",
  accentColor: "#4f46e5",
};

export function CompanyModal({ open, onClose, initialData, onSaved }: CompanyModalProps) {
  const toast = useToast();
  const { addCompany, updateCompanyProfile, companies } = useAppStore();

  const isEditing = Boolean(initialData?.id);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [loadingGus, setLoadingGus] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Rachunki wielowalutowe
  const [bankAccounts, setBankAccounts] = React.useState<CompanyBankAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = React.useState(false);
  const [showAddAccount, setShowAddAccount] = React.useState(false);
  const [addingAccount, setAddingAccount] = React.useState(false);
  const [newAccount, setNewAccount] = React.useState({
    accountName: "Konto walutowe",
    currency: "EUR",
    accountNumber: "",
    swiftBic: "",
    bankName: "",
    isDefault: false,
  });

  const fetchBankAccounts = React.useCallback(async (companyId: string) => {
    setLoadingAccounts(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/bank-accounts`);
      if (res.ok) {
        const data = await res.json();
        setBankAccounts(data.accounts || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const handleCreateBankAccount = async () => {
    if (!initialData?.id) return;
    if (!newAccount.accountNumber.trim()) {
      toast("error", "Błąd", "Wprowadź numer rachunku bankowego / IBAN.");
      return;
    }
    setAddingAccount(true);
    try {
      const res = await fetch(`/api/companies/${initialData.id}/bank-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapisu rachunku");
      toast("success", "Dodano rachunek bankowy", `${newAccount.currency} · ${newAccount.accountNumber}`);
      setShowAddAccount(false);
      setNewAccount({
        accountName: "Konto walutowe",
        currency: "EUR",
        accountNumber: "",
        swiftBic: "",
        bankName: "",
        isDefault: false,
      });
      await fetchBankAccounts(initialData.id);
    } catch (e: any) {
      toast("error", "Błąd", e.message);
    } finally {
      setAddingAccount(false);
    }
  };

  const handleDeleteBankAccount = async (accId: string) => {
    if (!initialData?.id) return;
    try {
      const res = await fetch(`/api/companies/${initialData.id}/bank-accounts?accountId=${accId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd usuwania rachunku");
      toast("info", "Usunięto rachunek bankowy");
      await fetchBankAccounts(initialData.id);
    } catch (e: any) {
      toast("error", "Błąd", e.message);
    }
  };

  React.useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          nip: initialData.nip || "",
          companyName: initialData.companyName || initialData.name || "",
          street: initialData.street || "",
          buildingNumber: initialData.buildingNumber || "",
          flatNumber: initialData.flatNumber || "",
          city: initialData.city || "",
          postalCode: initialData.postalCode || initialData.postal || "",
          bankAccount: initialData.bankAccount || initialData.iban || "",
          ksefToken: "",
          isDefault: Boolean(initialData.isDefault),
          logoUrl: initialData.logoUrl || "",
          accentColor: initialData.accentColor || initialData.primaryColor || "#4f46e5",
        });
      } else {
        setForm({
          ...emptyForm,
          isDefault: companies.length === 0, // pierwsza firma automatycznie domyślna
          logoUrl: "",
          accentColor: "#4f46e5",
        });
      }
      setErrors({});
      if (initialData?.id) {
        void fetchBankAccounts(initialData.id);
      } else {
        setBankAccounts([]);
      }
      setShowAddAccount(false);
    }
  }, [open, initialData, companies.length, fetchBankAccounts]);

  const setField = (field: keyof FormState, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleFetchGus = async () => {
    const clean = normalizeNip(form.nip);
    if (!clean) {
      toast("error", "Brak NIP", "Wpisz numer NIP przed pobraniem danych z GUS.");
      return;
    }
    if (!isValidNipFormat(clean)) {
      toast("error", "Nieprawidłowy NIP", "Wprowadzony numer NIP ma nieprawidłową sumę kontrolną.");
      return;
    }

    setLoadingGus(true);
    try {
      const res = await fetch(`/api/gus/search?nip=${encodeURIComponent(clean)}`);
      const result = await res.json();

      if (!res.ok || !result.success || !result.data) {
        throw new Error(result.error || result.message || "Nie znaleziono firmy w bazie GUS.");
      }

      const d = result.data;
      setForm((prev) => ({
        ...prev,
        nip: clean,
        companyName: d.name || prev.companyName,
        street: d.street || prev.street,
        buildingNumber: d.buildingNumber || prev.buildingNumber,
        flatNumber: d.flatNumber || prev.flatNumber,
        city: d.city || prev.city,
        postalCode: d.postalCode || prev.postalCode,
        bankAccount: d.bankAccount || prev.bankAccount,
      }));

      toast(
        "success",
        "Pobrano dane z GUS",
        `${d.name} (${d.postalCode || ""} ${d.city || ""})`
      );
    } catch (err) {
      toast("error", "Błąd pobierania z GUS", err instanceof Error ? err.message : "Nie udało się pobrać danych.");
    } finally {
      setLoadingGus(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const cleanNip = normalizeNip(form.nip);

    if (!cleanNip) {
      newErrors.nip = "Numer NIP jest wymagany.";
    } else if (!isValidNipFormat(cleanNip)) {
      newErrors.nip = "Nieprawidłowy format lub suma kontrolna NIP.";
    }

    if (!form.companyName.trim()) {
      newErrors.companyName = "Nazwa firmy / spółki jest wymagana.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: Partial<CompanyProfile> = {
        nip: normalizeNip(form.nip),
        companyName: form.companyName.trim(),
        street: form.street.trim() || null,
        buildingNumber: form.buildingNumber.trim() || null,
        flatNumber: form.flatNumber.trim() || null,
        city: form.city.trim() || null,
        postalCode: form.postalCode.trim() || null,
        bankAccount: form.bankAccount.trim() || null,
        ...(form.ksefToken.trim() ? { ksefToken: form.ksefToken.trim() } : {}),
        isDefault: form.isDefault,
        logoUrl: form.logoUrl.trim() || null,
        accentColor: form.accentColor.trim() || null,
      };

      let saved: CompanyProfile;
      if (isEditing && initialData?.id) {
        saved = await updateCompanyProfile(initialData.id, payload);
        toast("success", "Zaktualizowano profil firmy", saved.companyName);
      } else {
        saved = await addCompany(payload);
        toast("success", "Dodano nowy profil firmy", saved.companyName);
      }

      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast("error", "Błąd zapisu", err instanceof Error ? err.message : "Nie udało się zapisać profilu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={isEditing ? "Edycja profilu firmy / spółki" : "Dodaj nową firmę / NIP"}
      description="Skonfiguruj dane spółki, numer rachunku bankowego oraz dedykowany token KSeF."
      footer={
        <div className="flex w-full items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-[12.5px] font-medium text-foreground">
            <Checkbox
              checked={form.isDefault}
              onChange={(e) => setField("isDefault", e.target.checked)}
            />
            <span>Ustaw jako firmę domyślną</span>
          </label>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Anuluj
            </Button>
            <Button onClick={() => handleSave()} loading={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isEditing ? "Zapisz zmiany" : "Dodaj firmę"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-4 py-1">
        {/* NIP + Pobierz z GUS */}
        <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="company-nip" className="font-semibold text-[13px] flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" /> Numer NIP *
            </Label>
            <span className="text-[11px] text-muted-foreground">Weryfikacja GUS BIR 1.1</span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="company-nip"
                value={form.nip}
                onChange={(e) => setField("nip", e.target.value)}
                placeholder="np. 5260301706"
                className="font-mono text-[13px]"
                maxLength={13}
              />
              {isValidNipFormat(normalizeNip(form.nip)) && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleFetchGus}
              loading={loadingGus}
              disabled={loadingGus || !normalizeNip(form.nip)}
              className="shrink-0 font-medium"
            >
              {loadingGus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4 text-primary" />
              )}
              Pobierz dane z GUS
            </Button>
          </div>
          {errors.nip && <p className="text-[11.5px] font-medium text-destructive">{errors.nip}</p>}
        </div>

        {/* Nazwa firmy */}
        <div className="space-y-1.5">
          <Label htmlFor="company-name">Pełna nazwa firmy / spółki *</Label>
          <Input
            id="company-name"
            value={form.companyName}
            onChange={(e) => setField("companyName", e.target.value)}
            placeholder="np. ACME Polska Sp. z o.o."
          />
          {errors.companyName && (
            <p className="text-[11.5px] font-medium text-destructive">{errors.companyName}</p>
          )}
        </div>

        {/* Adres: Ulica, Budynek, Lokal */}
        <div className="grid gap-3 sm:grid-cols-6">
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="company-street">Ulica</Label>
            <Input
              id="company-street"
              value={form.street}
              onChange={(e) => setField("street", e.target.value)}
              placeholder="ul. Marszałkowska"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="company-bldg">Nr budynku</Label>
            <Input
              id="company-bldg"
              value={form.buildingNumber}
              onChange={(e) => setField("buildingNumber", e.target.value)}
              placeholder="10A"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="company-flat">Nr lokalu</Label>
            <Input
              id="company-flat"
              value={form.flatNumber}
              onChange={(e) => setField("flatNumber", e.target.value)}
              placeholder="4"
            />
          </div>
        </div>

        {/* Kod pocztowy i miasto */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="company-postal">Kod pocztowy</Label>
            <Input
              id="company-postal"
              value={form.postalCode}
              onChange={(e) => setField("postalCode", e.target.value)}
              placeholder="00-001"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="company-city">Miejscowość</Label>
            <Input
              id="company-city"
              value={form.city}
              onChange={(e) => setField("city", e.target.value)}
              placeholder="Warszawa"
            />
          </div>
        </div>

        {/* Rachunek bankowy (IBAN) */}
        <div className="space-y-1.5">
          <Label htmlFor="company-bank">Numer konta bankowego (IBAN dla tej firmy)</Label>
          <Input
            id="company-bank"
            value={form.bankAccount}
            onChange={(e) => setField("bankAccount", e.target.value)}
            placeholder="PL00 0000 0000 0000 0000 0000 0000"
            className="font-mono text-[12.5px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Będzie domyślnie umieszczany na fakturach wystawianych z tego profilu firmy.
          </p>
        </div>

        {/* Rachunki wielowalutowe (EUR, USD, GBP, CHF, etc.) */}
        {isEditing && initialData?.id && (
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-[13px] flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-primary" /> Rachunki bankowe i konta walutowe
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddAccount(!showAddAccount)}
                className="h-7 text-xs gap-1 rounded-lg"
              >
                <Plus className="h-3.5 w-3.5" />
                {showAddAccount ? "Anuluj" : "Dodaj konto walutowe"}
              </Button>
            </div>

            {/* Formularz dodawania konta */}
            {showAddAccount && (
              <div className="p-3 bg-card rounded-xl border border-border space-y-3 animate-in fade-in-50">
                <p className="text-xs font-bold text-foreground">Nowy rachunek walutowy</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <Label className="text-[11px]">Waluta</Label>
                    <Select
                      value={newAccount.currency}
                      onChange={(e) => setNewAccount((p) => ({ ...p, currency: e.target.value }))}
                      className="text-xs mt-1"
                    >
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="CHF">CHF (Fr)</option>
                      <option value="PLN">PLN (zł)</option>
                      <option value="NOK">NOK</option>
                      <option value="SEK">SEK</option>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11px]">Nazwa rachunku</Label>
                    <Input
                      value={newAccount.accountName}
                      onChange={(e) => setNewAccount((p) => ({ ...p, accountName: e.target.value }))}
                      placeholder="np. Rachunek walutowy EUR"
                      className="text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-[11px]">Numer konta / IBAN *</Label>
                    <Input
                      value={newAccount.accountNumber}
                      onChange={(e) => setNewAccount((p) => ({ ...p, accountNumber: e.target.value }))}
                      placeholder="PL61 1090 1014 0000 0712 1981 2874"
                      className="font-mono text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Kod SWIFT / BIC</Label>
                    <Input
                      value={newAccount.swiftBic}
                      onChange={(e) => setNewAccount((p) => ({ ...p, swiftBic: e.target.value.toUpperCase() }))}
                      placeholder="np. PKOPPLPW"
                      className="font-mono text-xs mt-1 uppercase"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px]">Nazwa banku</Label>
                  <Input
                    value={newAccount.bankName}
                    onChange={(e) => setNewAccount((p) => ({ ...p, bankName: e.target.value }))}
                    placeholder="np. PKO Bank Polski / Santander"
                    className="text-xs mt-1"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <Checkbox
                      checked={newAccount.isDefault}
                      onChange={(e) => setNewAccount((p) => ({ ...p, isDefault: e.target.checked }))}
                    />
                    <span>Ustaw jako domyślny dla tej waluty</span>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateBankAccount}
                    loading={addingAccount}
                    className="h-8 text-xs gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Dodaj rachunek
                  </Button>
                </div>
              </div>
            )}

            {/* Lista istniejących kont */}
            <div className="space-y-1.5">
              {loadingAccounts ? (
                <div className="text-center py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                  Ładowanie kont...
                </div>
              ) : bankAccounts.length === 0 ? (
                <p className="text-[11.5px] text-muted-foreground italic py-1">
                  Brak dodatkowych kont walutowych. Główne konto PLN z pola powyżej jest aktywne.
                </p>
              ) : (
                bankAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-2.5 bg-card rounded-xl border border-border flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge tone="primary" className="font-mono font-bold text-[10px] px-1.5 py-0">
                          {acc.currency}
                        </Badge>
                        <span className="text-xs font-semibold text-foreground truncate">
                          {acc.accountName}
                        </span>
                        {acc.isDefault && (
                          <Badge tone="success" className="text-[9px] px-1 py-0">
                            Domyślne
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                        {acc.accountNumber}
                        {acc.swiftBic && ` · SWIFT: ${acc.swiftBic}`}
                        {acc.bankName && ` (${acc.bankName})`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteBankAccount(acc.id)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-500 shrink-0"
                      title="Usuń rachunek"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Token KSeF dla tej spółki */}
        <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="company-ksef-token" className="font-semibold text-[13px] flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-primary" /> Dedykowany token KSeF dla tego NIP-u
            </Label>
            <span className="text-[11px] text-muted-foreground">Opcjonalnie</span>
          </div>
          <Input
            id="company-ksef-token"
            type="password"
            value={form.ksefToken}
            onChange={(e) => setField("ksefToken", e.target.value)}
            placeholder={isEditing && initialData?.ksefTokenSet ? "•••••••••••••••• (zapisany token)" : "Wklej token autoryzacyjny KSeF..."}
            className="font-mono text-[12px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Token wygenerowany w Aplikacji Podatnika KSeF dla numeru NIP tej konkretnej spółki.
          </p>
        </div>

        {/* Logo firmy na fakturze */}
        <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-semibold text-[13px] flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-primary" /> Logo firmy na fakturze (nagłówek)
            </Label>
            <span className="text-[11px] text-muted-foreground">PNG, JPG, SVG (max 2 MB)</span>
          </div>

          {form.logoUrl ? (
            <div className="flex items-center gap-4 p-3 bg-card rounded-xl border border-border">
              <div className="relative flex items-center justify-center p-2 bg-white rounded-lg border border-border/60 max-w-[180px] max-h-[70px] overflow-hidden">
                <img
                  src={form.logoUrl}
                  alt="Podgląd logo"
                  className="max-h-12 max-w-full object-contain"
                />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Logo wgrane
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Logo będzie widoczne w lewym górnym rogu faktury i na wydruku PDF.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setField("logoUrl", "")}
                className="h-8 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 border-rose-500/30"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Usuń
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs gap-1.5 h-9"
                  onClick={() => {
                    const el = document.createElement("input");
                    el.type = "file";
                    el.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
                    el.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        toast("error", "Zbyt duży plik", "Maksymalny dopuszczalny rozmiar logo to 2 MB.");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const res = ev.target?.result as string;
                        setField("logoUrl", res);
                        toast("success", "Wgrano logo", file.name);
                      };
                      reader.readAsDataURL(file);
                    };
                    el.click();
                  }}
                >
                  <Upload className="h-3.5 w-3.5" /> Wybierz plik z dysku…
                </Button>
                <span className="text-xs text-muted-foreground">lub wpisz URL poniżej:</span>
              </div>
              <Input
                placeholder="https://twoja-domena.pl/logo.png lub data:image/..."
                value={form.logoUrl}
                onChange={(e) => setField("logoUrl", e.target.value)}
                className="text-xs font-mono"
              />
            </div>
          )}
        </div>

        {/* Kolor akcentu firmy na fakturach (personalizacja PDF) */}
        <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-semibold text-[13px] flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" /> Kolor akcentu PDF i faktury
            </Label>
            <span className="text-[11px] text-muted-foreground">Wyróżniki, nagłówki, kwoty</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {[
              { name: "Indigo", hex: "#4f46e5" },
              { name: "Sky", hex: "#0284c7" },
              { name: "Emerald", hex: "#059669" },
              { name: "Amber", hex: "#d97706" },
              { name: "Rose", hex: "#e11d48" },
              { name: "Violet", hex: "#7c3aed" },
              { name: "Slate", hex: "#334155" },
            ].map((c) => {
              const selected = form.accentColor === c.hex;
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setField("accentColor", c.hex)}
                  className={`h-7 px-2.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                    selected
                      ? "border-foreground ring-2 ring-primary/30 font-semibold bg-muted/50"
                      : "border-border/70 hover:border-border hover:bg-muted/30"
                  }`}
                >
                  <span className="h-3 w-3 rounded-full border border-black/20" style={{ backgroundColor: c.hex }} />
                  <span>{c.name}</span>
                </button>
              );
            })}
            <div className="flex items-center gap-1.5 sm:ml-auto">
              <input
                type="color"
                value={form.accentColor || "#4f46e5"}
                onChange={(e) => setField("accentColor", e.target.value)}
                className="h-7 w-8 rounded-lg cursor-pointer border border-border/80 bg-transparent p-0.5"
                title="Własny kolor z próbnika"
              />
              <span className="font-mono text-xs text-muted-foreground">{form.accentColor}</span>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
