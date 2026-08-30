"use client";

import * as React from "react";
import { Building2, Check, Download, KeyRound, Loader2, Save, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Checkbox } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { useAppStore } from "@/lib/store";
import { isValidNipFormat, normalizeNip, formatNip } from "@/lib/validation";
import type { CompanyProfile } from "@/lib/types";

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
};

export function CompanyModal({ open, onClose, initialData, onSaved }: CompanyModalProps) {
  const toast = useToast();
  const { addCompany, updateCompanyProfile, companies } = useAppStore();

  const isEditing = Boolean(initialData?.id);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [loadingGus, setLoadingGus] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

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
          ksefToken: initialData.ksefToken || "",
          isDefault: Boolean(initialData.isDefault),
        });
      } else {
        setForm({
          ...emptyForm,
          isDefault: companies.length === 0, // pierwsza firma automatycznie domyślna
        });
      }
      setErrors({});
    }
  }, [open, initialData, companies.length]);

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
        ksefToken: form.ksefToken.trim() || null,
        isDefault: form.isDefault,
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
            Będzie domyślnie umieszczany na fakturach wystawianych z tego profilu spółki oraz w kodzie QR do płatności.
          </p>
        </div>

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
            placeholder={isEditing && initialData?.ksefToken ? "•••••••••••••••• (zapisany token)" : "Wklej token autoryzacyjny KSeF..."}
            className="font-mono text-[12px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Token wygenerowany w Aplikacji Podatnika KSeF dla numeru NIP tej konkretnej spółki.
          </p>
        </div>
      </form>
    </Dialog>
  );
}
