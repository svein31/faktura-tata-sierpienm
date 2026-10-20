"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit2,
  KeyRound,
  MapPin,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { CompanyModal } from "@/components/company/company-modal";
import { InfoTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/toast";
import { useAppStore } from "@/lib/store";
import { formatNip } from "@/lib/validation";
import type { CompanyProfile } from "@/lib/types";
import { DEFAULT_INVOICE_PATTERN, INVOICE_NUMBER_PRESETS, nextFormattedInvoiceNumber, parseInvoicePattern } from "@/lib/invoice-numbering";
import { Select } from "@/components/ui/input";

export default function CompaniesSettingsPage() {
  const toast = useToast();
  const {
    companies,
    invoices,
    setDefaultCompanyProfile,
    deleteCompanyProfile,
    fetchCompanies,
  } = useAppStore();

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingCompany, setEditingCompany] = React.useState<CompanyProfile | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = React.useState<string | null>(null);
  const [patterns, setPatterns] = React.useState<Record<string, string>>({});
  const [savingPatternId, setSavingPatternId] = React.useState<string | null>(null);

  const savePattern = async (company: CompanyProfile) => {
    const pattern = patterns[company.id] ?? company.invoiceNumberPattern ?? DEFAULT_INVOICE_PATTERN;
    try {
      parseInvoicePattern(pattern);
      setSavingPatternId(company.id);
      const res = await fetch(`/api/companies/${company.id}/numbering`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pattern }),
      });
      if (!res.ok) { const body = await res.json(); throw new Error(body.error || "Nie można zapisać formatu."); }
      await fetchCompanies();
      toast("success", "Zapisano format numeru", pattern);
    } catch (error) {
      toast("error", "Nie można zapisać numeracji", error instanceof Error ? error.message : "Nieprawidłowy format.");
    } finally { setSavingPatternId(null); }
  };

  const defaultCompany = companies.find((c) => c.isDefault) ?? companies[0] ?? null;
  const companiesWithKsef = companies.filter((c) => Boolean(c.ksefTokenSet)).length;

  const handleCopyNip = (nip: string) => {
    navigator.clipboard.writeText(nip);
    toast("success", "Skopiowano NIP", nip);
  };

  const handleSetDefault = async (company: CompanyProfile) => {
    if (company.isDefault) return;
    setSettingDefaultId(company.id);
    try {
      await setDefaultCompanyProfile(company.id);
      toast("success", "Ustawiono firmę domyślną", company.companyName);
    } catch (err) {
      toast("error", "Błąd", err instanceof Error ? err.message : "Nie udało się zmienić domyślnej firmy.");
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const target = companies.find((c) => c.id === deletingId);
    try {
      await deleteCompanyProfile(deletingId);
      toast("success", "Usunięto profil firmy", target?.companyName);
    } catch (err) {
      toast("error", "Nie można usunąć firmy", err instanceof Error ? err.message : "Wystąpił błąd.");
    } finally {
      setDeletingId(null);
    }
  };

  const getFullAddress = (c: CompanyProfile) => {
    const streetPart = [c.street, c.buildingNumber].filter(Boolean).join(" ");
    const streetFull = c.flatNumber ? `${streetPart}/${c.flatNumber}` : (streetPart || c.street || "");
    const cityPart = [c.postalCode || c.postal, c.city].filter(Boolean).join(" ");
    return [streetFull, cityPart].filter(Boolean).join(", ") || "Brak adresu";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Moje Firmy / NIP"
        description="Profile wystawców, rachunki bankowe i integracja KSeF dla podmiotów gospodarczych."
        actions={
          <Button
            onClick={() => {
              setEditingCompany(null);
              setModalOpen(true);
            }}
            className="font-medium"
          >
            <Plus className="h-4 w-4" /> Dodaj firmę
          </Button>
        }
      />

      {companies.length > 0 && <Card id="invoice-numbering" className="scroll-mt-24 p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Numeracja faktur</h2>
          <p className="text-sm text-muted-foreground">Wzór jest zapamiętywany osobno dla każdej firmy. Dowolna nazwa i separatory, licznik {'{NN}'}, dzień {'{DD}'}, miesiąc {'{MM}'}, tydzień ISO {'{WW}'}, rok {'{YYYY}'} lub rok ISO {'{GGGG}'}. Bez roku licznik zachowuje ciągłość w kolejnych latach.</p>
        </div>
        {companies.filter(c => c.currentUserRole === "owner").map(c => {
          const pattern = patterns[c.id] ?? c.invoiceNumberPattern ?? DEFAULT_INVOICE_PATTERN;
          let example = "Sprawdź format";
          try { example = nextFormattedInvoiceNumber(pattern, [], "2026-07-01", "FV"); } catch { /* Show validation on save. */ }
          return <div key={c.id} className="grid gap-2 border-t pt-3 sm:grid-cols-[180px_1fr_auto] sm:items-center">
            <label htmlFor={`pattern-${c.id}`} className="text-sm font-medium">{c.companyName}</label>
            <div>
              <Select className="mb-2" display="dropdown" aria-label={`Wariant numeracji: ${c.companyName}`}
                value={INVOICE_NUMBER_PRESETS.some(p => p.pattern === pattern) ? pattern : "custom"}
                onChange={event => { if (event.target.value !== "custom") setPatterns(prev => ({ ...prev, [c.id]: event.target.value })); }}>
                <option value="custom">Własny wzór i nazwa</option>
                {INVOICE_NUMBER_PRESETS.map(preset => <option key={preset.pattern} value={preset.pattern}>{preset.label}</option>)}
              </Select>
              <input id={`pattern-${c.id}`} value={pattern} onChange={event => setPatterns(prev => ({ ...prev, [c.id]: event.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm" placeholder="FV NN/MM/RRRR" maxLength={80} />
              <p className="mt-1 text-xs text-muted-foreground">Przykład: {example}. Liczba N określa zera wiodące. W nowym dokumencie wybierzesz numer automatyczny lub ręczny.</p>
            </div>
            <Button type="button" size="sm" disabled={savingPatternId === c.id} onClick={() => void savePattern(c)}>Zapisz format</Button>
          </div>;
        })}
      </Card>}

      {/* Karty podsumowania (tylko gdy dodano firmy) */}
      {companies.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary dark:text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-muted-foreground">Podpięte firmy / NIP-y</p>
                <p className="text-xl font-bold tracking-tight">{companies.length}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success dark:text-success">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-muted-foreground">Domyślna spółka</p>
                <p className="text-[13.5px] font-semibold truncate max-w-[180px]">
                  {defaultCompany?.companyName || defaultCompany?.name || "Brak"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info dark:text-info">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-muted-foreground">Dedykowane tokeny KSeF</p>
                <p className="text-xl font-bold tracking-tight">
                  {companiesWithKsef} <span className="text-[12px] font-normal text-muted-foreground">/ {companies.length}</span>
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Lista firm */}
      <div className="space-y-4">
        {companies.length > 0 && (
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold tracking-tight">Lista zapisanych spółek i działalności</h2>
            <span className="text-[12px] text-muted-foreground">{companies.length} {companies.length === 1 ? "profil" : "profile"}</span>
          </div>
        )}

        {companies.length === 0 ? (
          <Card className="border-border/60 bg-card  p-10 sm:p-14 text-center rounded-xl shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">Nie dodano jeszcze żadnej firmy</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground leading-relaxed">
              Wpisz NIP swojej działalności lub spółki — nazwa, adres i rachunek bankowy zostaną pobrane z rejestru GUS.
            </p>
            <Button
              onClick={() => {
                setEditingCompany(null);
                setModalOpen(true);
              }}
              className="mt-5 gap-2 rounded-xl"
            >
              <Plus className="h-4 w-4" /> Dodaj pierwszą firmę
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {companies.map((company) => {
                const invoiceCount = invoices.filter((i) => i.sellerCompanyId === company.id).length;
                const isDef = company.isDefault;

                return (
                  <motion.div
                    key={company.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card
                      className={`relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md ${
                        isDef ? "ring-2 ring-primary/40 border-primary/30" : ""
                      }`}
                    >
                      {isDef && (
                        <div className="absolute right-0 top-0 rounded-bl-lg bg-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary-foreground shadow-sm flex items-center gap-1">
                          <Star className="h-3 w-3 fill-current" /> Domyślna firma
                        </div>
                      )}

                      <CardHeader className="pb-3">
                        <div className="pr-16">
                          {company.logoUrl && (
                            <div className="mb-2 flex h-9 w-fit items-center rounded-lg border border-border/70 bg-white p-1 px-2 max-w-[140px] overflow-hidden">
                              <img src={company.logoUrl} alt={company.companyName} className="max-h-7 max-w-full object-contain" />
                            </div>
                          )}
                          <CardTitle className="text-[15px] leading-tight font-bold line-clamp-2">
                            {company.companyName}
                          </CardTitle>
                          <CardDescription className="mt-1 flex items-center gap-1.5 font-mono text-[12px]">
                            <span>NIP: {formatNip(company.nip)}</span>
                            <button
                              onClick={() => handleCopyNip(company.nip)}
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Kopiuj NIP"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </CardDescription>
                        </div>
                      </CardHeader>

                      <CardContent className="flex-1 space-y-3 pb-4 text-[12.5px]">
                        {/* Adres */}
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                          <span className="line-clamp-2">{getFullAddress(company)}</span>
                        </div>

                        {/* Konto bankowe */}
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                          <span className="font-mono text-[11.5px] truncate">
                            {company.bankAccount || "Brak zdefiniowanego IBAN"}
                          </span>
                        </div>

                        {/* Status KSeF & Liczba faktur */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {company.ksefTokenSet ? (
                            <Badge tone="success" className="gap-1 text-[11px]">
                              <ShieldCheck className="h-3 w-3" /> Dedykowany token KSeF
                            </Badge>
                          ) : (
                            <Badge tone="outline" className="text-[11px] text-muted-foreground">
                              Domyślny KSeF konta
                            </Badge>
                          )}

                          <Badge tone="indigo" className="text-[11px]">
                            {invoiceCount} {invoiceCount === 1 ? "faktura" : invoiceCount < 5 ? "faktury" : "faktur"}
                          </Badge>
                        </div>
                      </CardContent>

                      {/* Stopka akcji karty */}
                      <div className="flex items-center justify-between border-t border-border/70 bg-muted/20 px-4 py-2.5">
                        <div>
                          {!isDef ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefault(company)}
                              loading={settingDefaultId === company.id}
                              className="text-[12px] h-8 px-2 font-medium text-muted-foreground hover:text-foreground"
                            >
                              <Star className="h-3.5 w-3.5 mr-1" /> Ustaw jako domyślną
                            </Button>
                          ) : (
                            <span className="text-[11.5px] font-medium text-success dark:text-success flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Aktywna jako domyślna
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingCompany(company);
                              setModalOpen(true);
                            }}
                            title="Edytuj dane firmy"
                            className="h-8 w-8"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingId(company.id)}
                            title="Usuń firmę"
                            className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modal dodawania / edycji spółki */}
      <CompanyModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingCompany(null);
        }}
        initialData={editingCompany}
      />

      {/* Modal potwierdzenia usunięcia */}
      <ConfirmDialog
        open={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Czy na pewno chcesz usunąć ten profil firmy?"
        description="Usunięcie profilu spółki jest możliwe tylko wtedy, gdy nie zostały z niego wystawione żadne faktury."
        confirmLabel="Usuń profil"
        danger
      />
    </div>
  );
}
