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

export default function CompaniesSettingsPage() {
  const toast = useToast();
  const {
    companies,
    invoices,
    setDefaultCompanyProfile,
    deleteCompanyProfile,
  } = useAppStore();

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingCompany, setEditingCompany] = React.useState<CompanyProfile | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = React.useState<string | null>(null);

  const defaultCompany = companies.find((c) => c.isDefault) ?? companies[0] ?? null;
  const companiesWithKsef = companies.filter((c) => Boolean(c.ksefToken)).length;

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

      {/* Karty podsumowania */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Star className="h-5 w-5 fill-emerald-500/20" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-muted-foreground">Główna firma domyślna</p>
              <p className="truncate text-[14px] font-semibold">
                {defaultCompany ? defaultCompany.companyName : "Brak"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <KeyRound className="h-5 w-5" />
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

      {/* Lista firm */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold tracking-tight">Lista zapisanych spółek i działalności</h2>
          <span className="text-[12px] text-muted-foreground">{companies.length} {companies.length === 1 ? "profil" : "profile"}</span>
        </div>

        {companies.length === 0 ? (
          <Card className="border-dashed p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-3 text-[15px] font-semibold">Brak zapisanych profili firm</h3>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
              Dodaj swoją pierwszą firmę wpisując NIP i pobierając dane bezpośrednio z bazy rejestru GUS.
            </p>
            <Button
              onClick={() => {
                setEditingCompany(null);
                setModalOpen(true);
              }}
              className="mt-4"
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
                          {company.ksefToken ? (
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
                            <span className="text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
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
