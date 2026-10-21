"use client";

import * as React from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Pencil, Plus, Search, Trash2, UserPlus, Users, ShieldCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ContractorCrmDrawer } from "@/components/crm/contractor-crm-drawer";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { InfoTooltip } from "@/components/ui/tooltip";
import { formatNip, validateTaxId } from "@/lib/validation";
import type { Address, Contractor } from "@/lib/types";
import { NipLookup } from "@/components/invoice/nip-lookup";
import { ViesLookup } from "@/components/invoice/vies-lookup";
import { EmptyState } from "@/components/ui/empty-state";
import { ContractorImportWizard } from "@/components/contractor/import-wizard";

interface ContractorDraft {
  taxIdType: "nip" | "vat_eu" | "tin" | "none";
  name: string;
  nip: string;
  regon: string;
  address: Address;
  email: string;
  phone: string;
  iban: string;
  bankName: string;
  isVatPayer: boolean;
  notes: string;
  tags: string;
}

const emptyDraft: ContractorDraft = {
  taxIdType: "nip",
  name: "",
  nip: "",
  regon: "",
  address: { street: "", city: "", postal: "", country: "PL" },
  email: "",
  phone: "",
  iban: "",
  bankName: "",
  isVatPayer: true,
  notes: "",
  tags: "",
};

export default function ContractorsPage() {
  const toast = useToast();
  const { contractors: allContractors, selectedCompanyId, addContractor, updateContractor, deleteContractor } = useAppStore();

  const contractors = allContractors.filter(item => !item.companyId || item.companyId === selectedCompanyId);

  const [historyId, setHistoryId] = React.useState<string | null>(null);
  const [historyPage, setHistoryPage] = React.useState(0);
  const [historyCursors, setHistoryCursors] = React.useState<(string | null)[]>([null]);
  type History = { invoices: {id:string;number:string;issueDate:string;type:string;status:string;documentStatus:string|null;isProforma:boolean|null;currency:string;totalGross:number|null}[]; nextCursor:string|null; total:number; balances:{currency:string;receivable:number;payable:number}[] };
  const [history, setHistory] = React.useState<History | null>(null);
  const [historyError, setHistoryError] = React.useState("");
  React.useEffect(() => { setHistoryId(null); setHistoryPage(0); }, [selectedCompanyId]);
  React.useEffect(() => {
    if (!historyId) return;
    const controller = new AbortController();
    setHistory(null); setHistoryError("");
    const query = new URLSearchParams({companyId:selectedCompanyId || "unassigned"});
    if (historyCursors[historyPage]) query.set("cursor", historyCursors[historyPage]!);
    fetch(`/api/contractors/${historyId}/history?${query}`, {signal:controller.signal,cache:"no-store"})
      .then(async response => {const body=await response.json(); if (!response.ok) throw new Error(body.error || "Nie udało się pobrać historii."); return body as History;})
      .then(body => {if (!controller.signal.aborted) setHistory(body);})
      .catch(error => {if (!controller.signal.aborted) setHistoryError(error instanceof Error ? error.message : "Błąd połączenia.");});
    return () => controller.abort();
  }, [historyId,selectedCompanyId,historyPage,historyCursors]);
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<ContractorDraft>(emptyDraft);
  const [toDelete, setToDelete] = React.useState<string | null>(null);
  const [selectedCrmContractor, setSelectedCrmContractor] = React.useState<Contractor | null>(null);

  const filtered = contractors.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${c.name} ${c.nip} ${c.address.city} ${c.address.street} ${(c.tags || []).join(" ")}`
      .toLowerCase()
      .includes(q);
  });

  const openNew = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setDialogOpen(true);
  };

  const openEdit = (c: Contractor) => {
    setEditingId(c.id);
    setDraft({
      taxIdType: c.taxIdType === "vat_eu" || c.taxIdType === "tin" || c.taxIdType === "none" ? c.taxIdType : "nip",
      name: c.name,
      nip: c.taxId || c.nip,
      regon: c.regon ?? "",
      address: { ...c.address },
      email: c.email ?? "",
      phone: c.phone ?? "",
      iban: c.iban ?? "",
      bankName: c.bankName ?? "",
      isVatPayer: c.isVatPayer,
      notes: c.notes ?? "",
      tags: (c.tags || []).join(", "),
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast("error", "Podaj nazwę kontrahenta");
      return;
    }
    const taxId = validateTaxId(draft.nip, draft.taxIdType, draft.address.country);
    if (!taxId.valid) {
      toast("error", "Nieprawidłowy identyfikator", taxId.reason || "Sprawdź numer i kraj.");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      nip: taxId.normalized,
      taxId: taxId.displayValue,
      taxIdType: draft.taxIdType,
      country: draft.address.country.trim().toUpperCase() || "PL",
      regon: draft.regon.trim() || undefined,
      address: {
        street: draft.address.street.trim(),
        city: draft.address.city.trim(),
        postal: draft.address.postal.trim(),
        country: draft.address.country.trim() || "PL",
      },
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      iban: draft.iban.trim() || undefined,
      bankName: draft.bankName.trim() || undefined,
      isVatPayer: draft.isVatPayer,
      notes: draft.notes.trim() || undefined,
      tags: [...new Set(draft.tags.split(",").map(t => t.trim()).filter(Boolean))],
    };
    try {
      if (editingId) {
        await updateContractor(editingId, payload);
        toast("success", "Zaktualizowano kontrahenta", payload.name);
      } else {
        await addContractor(payload);
        toast("success", "Dodano kontrahenta", payload.name);
      }
      setDialogOpen(false);
    } catch (e) {
      toast("error", "Nie udało się zapisać", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div>
      <PageHeader
        title="Kontrahenci"
        description="Baza kontrahentów z automatycznym pobieraniem danych z Bazy REGON (GUS) i Białej Listy MF."
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Dodaj kontrahenta
          </Button>
        }
      />

      <ContractorImportWizard />

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj: nazwa, NIP, miasto…"
          className="pl-9 h-9"
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {filtered.map((c) => {
            const idType = c.taxIdType || "nip";
            const nipOk = validateTaxId(c.taxId || c.nip, idType, c.country || c.address.country).valid;
            return (
              <motion.div
                key={c.id}
                className="min-w-0"
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
              >
                <Card className="group flex h-full flex-col rounded-xl border border-border/70 bg-card  transition-all duration-200  hover:shadow-sm">
                  <div className="flex items-start justify-between gap-2 p-4 pb-2">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 group-hover:bg-primary/15 transition-colors">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-[13.5px] font-semibold text-foreground tracking-tight">{c.name}</p>
                        <p className="font-mono text-[11.5px] text-muted-foreground">{idType === "nip" ? formatNip(c.nip) : c.taxId || c.nip || "Brak ID"}</p>
                      </div>
                    </div>
                    <Badge tone={nipOk ? (c.isVatPayer ? "success" : "warning") : "danger"}>
                      {nipOk ? (idType === "nip" ? (c.isVatPayer ? "płatnik VAT" : "zwolniony") : idType === "vat_eu" ? "VAT UE" : idType === "none" ? "bez ID" : "TIN") : "zły identyfikator"}
                    </Badge>
                  </div>
                  <div className="flex-1 px-4 pb-3 text-[12px] text-muted-foreground space-y-0.5">
                    <p>{c.address.street}</p>
                    <p>{(c.tags || []).map(tag => <Badge key={tag}>{tag}</Badge>)}</p>
                    {c.notes && <p className="whitespace-pre-wrap">{c.notes}</p>}
                    <p>
                      {c.address.postal} {c.address.city} &middot; {c.address.country}
                    </p>
                    {c.iban && (
                      <p className="mt-1.5 truncate font-mono text-[10.5px] text-muted-foreground">{c.iban}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 rounded-b-2xl border-t border-border/60 bg-muted/30 p-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setHistoryCursors([null]); setHistoryPage(0); setHistoryId(c.id); }}
                        className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Saldo
                      </Button>
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => setSelectedCrmContractor(c)}
                        className="h-6 px-2 text-[10.5px] gap-1 text-primary hover:bg-primary/10 rounded-md font-medium border border-primary/20"
                        title="Otwórz kartotekę CRM 360° ze scoringiem i limitem kupieckim"
                      >
                        <ShieldCheck className="h-3 w-3" />
                        <span>CRM 360°</span>
                      </Button>
                    </div>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Edytuj">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToDelete(c.id)}
                        title="Usuń"
                        className="text-muted-foreground hover:text-destructive"
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

      {filtered.length === 0 && (
        <Card className="rounded-xl border border-border/70 bg-card ">
          <EmptyState
            icon={Users}
            title={contractors.length === 0 ? "Brak zapisanych kontrahentów" : "Brak kontrahentów spełniających kryteria"}
            description={
              contractors.length === 0
                ? "Wpisz NIP kontrahenta, a dane firmy i status VAT zostaną automatycznie pobrane z rejestru GUS."
                : "Zmień parametry wyszukiwania lub wyczyść filtr."
            }
            action={
              contractors.length === 0 ? (
                <Button size="sm" className="gap-1.5" onClick={openNew}>
                  <Plus className="h-3.5 w-3.5" /> Dodaj kontrahenta
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setSearch("")}>
                  Wyczyść filtr
                </Button>
              )
            }
          />
        </Card>
      )}

      {/* Dialog dodawania/edycji */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? "Edytuj kontrahenta" : "Nowy kontrahent"}
        description="Dane polskie możesz pobrać z GUS, a VAT UE sprawdzić na żądanie w VIES."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={save}>
              <UserPlus className="h-4 w-4" /> {editingId ? "Zapisz zmiany" : "Dodaj"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nazwa firmy *</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="np. DemoIT Solutions Sp. z o.o."
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Typ identyfikatora</Label>
            <Select value={draft.taxIdType} onChange={e => setDraft({ ...draft, taxIdType: e.target.value as ContractorDraft["taxIdType"] })}>
              <option value="nip">NIP (Polska)</option><option value="vat_eu">VAT UE</option><option value="tin">TIN / Tax ID</option><option value="none">Brak identyfikatora</option>
            </Select>
          </div>
          {draft.taxIdType !== "none" && <div className="space-y-1.5 sm:col-span-2">
            <Label>{draft.taxIdType === "nip" ? "NIP *" : draft.taxIdType === "vat_eu" ? "VAT UE *" : "TIN / Tax ID *"}</Label>
            {draft.taxIdType === "nip" ? <NipLookup
              nip={draft.nip}
              onNipChange={(v) => setDraft({ ...draft, nip: v })}
              onFound={(c) =>
                setDraft((d) => ({
                  ...d,
                  name: c.name,
                  nip: c.nip,
                  regon: c.regon,
                  address: { ...c.address },
                  isVatPayer: c.isVatPayer,
                }))
              }
            /> : <Input value={draft.nip} onChange={e => setDraft({ ...draft, nip: e.target.value })} placeholder={draft.taxIdType === "vat_eu" ? "np. DE123456789" : "Identyfikator zagraniczny"} />}
            {draft.taxIdType === "vat_eu" && <ViesLookup vat={draft.nip} country={draft.address.country} />}
          </div>}
          <div className="space-y-1.5">
            <Label>REGON</Label>
            <Input
              value={draft.regon}
              onChange={(e) => setDraft({ ...draft, regon: e.target.value })}
              placeholder="9 lub 14 cyfr"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ulica i numer</Label>
            <Input
              value={draft.address.street}
              onChange={(e) => setDraft({ ...draft, address: { ...draft.address, street: e.target.value } })}
              placeholder="ul. Przykładowa 1"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kod pocztowy</Label>
            <Input
              value={draft.address.postal}
              onChange={(e) => setDraft({ ...draft, address: { ...draft.address, postal: e.target.value } })}
              placeholder="00-001"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Miasto</Label>
            <Input
              value={draft.address.city}
              onChange={(e) => setDraft({ ...draft, address: { ...draft.address, city: e.target.value } })}
              placeholder="Warszawa"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kraj</Label>
            <Input
              value={draft.address.country}
              onChange={(e) => setDraft({ ...draft, address: { ...draft.address, country: e.target.value } })}
              placeholder="PL"
            />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="biuro@firma.pl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Input
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="+48 22 000 00 00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nr konta (IBAN)</Label>
            <Input
              value={draft.iban}
              onChange={(e) => setDraft({ ...draft, iban: e.target.value })}
              placeholder="PL00 0000 0000 0000 0000 0000 0000"
              className="font-mono text-[12px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Input
              value={draft.bankName}
              onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
              placeholder="Nazwa banku"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Status VAT</Label>
            <Select
              value={draft.isVatPayer ? "vat" : "nonvat"}
              onChange={(e) => setDraft({ ...draft, isVatPayer: e.target.value === "vat" })}
            >
              <option value="vat">Płatnik VAT</option>
              <option value="nonvat">Zwolniony z VAT</option>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tagi (oddzielone przecinkami)</Label>
            <Input value={draft.tags} onChange={e => setDraft({ ...draft, tags: e.target.value })} placeholder="np. stały klient, hurt" />
            <Label>Uwagi</Label>
            <Textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={2}
              placeholder="Notatki wewnętrzne…"
            />
          </div>
        </div>
      </Dialog>

      <Dialog open={!!historyId} onClose={() => setHistoryId(null)} title="Historia i saldo kontrahenta" size="lg">
        <p className="mb-3 text-sm">{contractors.find(c => c.id === historyId)?.name} — wybrana firma</p>
        {!history && !historyError && <p role="status" className="text-sm">Wczytywanie historii…</p>}
        {historyError && <p role="alert" className="text-sm text-destructive">{historyError}</p>}
        {history?.balances.map(b => <p key={b.currency}>Należności: {formatMoney(b.receivable, b.currency)} · Zobowiązania: {formatMoney(b.payable, b.currency)} · Saldo: {formatMoney(b.receivable - b.payable, b.currency)}</p>)}
        <p className="my-2 text-xs text-muted-foreground">Saldo według zapisanych rozliczeń. Szkice, anulowane dokumenty i proformy pominięte. Kwoty ujemne oznaczają nadpłatę lub korektę.</p>
        <div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Numer</th><th>Data</th><th>Typ / status</th><th>Brutto</th></tr></thead><tbody>
          {history?.invoices.map(i => <tr key={i.id}><td><Link prefetch={false} className="underline" href={`/invoices/${i.id}`}>{i.number}</Link></td><td>{i.issueDate}</td><td>{i.isProforma ? "Proforma" : i.type === "sale" ? "Sprzedaż" : "Zakup"} / {i.documentStatus || i.status}</td><td>{formatMoney(i.totalGross || 0, i.currency)}</td></tr>)}
        </tbody></table></div>
        {history && !history.total && <p>Brak faktur w tej firmie.</p>}
        {history && <div className="mt-3 flex items-center gap-2"><span className="text-xs text-muted-foreground">{historyPage*20+1}–{historyPage*20+history.invoices.length} z {history.total}</span><Button disabled={!historyPage} onClick={() => setHistoryPage(p => p - 1)}>Poprzednie</Button><Button disabled={!history.nextCursor} onClick={() => {setHistoryCursors(current => [...current.slice(0,historyPage+1),history.nextCursor]);setHistoryPage(p=>p+1);}}>Następne</Button></div>}
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            const c = contractors.find((x) => x.id === toDelete);
            void deleteContractor(toDelete)
              .then(() => toast("success", "Usunięto kontrahenta", c?.name))
              .catch((e: Error) => toast("error", "Nie udało się usunąć", e.message));
          }
        }}
        title="Usunąć kontrahenta?"
        description="Kontrahenta z historią faktur nie można usunąć."
      />

      {/* Drawer CRM 360° */}
      <ContractorCrmDrawer
        contractor={selectedCrmContractor}
        onClose={() => setSelectedCrmContractor(null)}
      />
    </div>
  );
}
