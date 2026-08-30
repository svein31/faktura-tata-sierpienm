"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Pencil, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { InfoTooltip } from "@/components/ui/tooltip";
import { formatNip, isValidNipFormat, normalizeNip } from "@/lib/validation";
import type { Address, Contractor } from "@/lib/types";
import { NipLookup } from "@/components/invoice/nip-lookup";

interface ContractorDraft {
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
}

const emptyDraft: ContractorDraft = {
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
};

export default function ContractorsPage() {
  const toast = useToast();
  const { contractors, addContractor, updateContractor, deleteContractor } = useAppStore();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<ContractorDraft>(emptyDraft);
  const [toDelete, setToDelete] = React.useState<string | null>(null);

  const filtered = contractors.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${c.name} ${c.nip} ${c.address.city} ${c.address.street}`
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
      name: c.name,
      nip: c.nip,
      regon: c.regon ?? "",
      address: { ...c.address },
      email: c.email ?? "",
      phone: c.phone ?? "",
      iban: c.iban ?? "",
      bankName: c.bankName ?? "",
      isVatPayer: c.isVatPayer,
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast("error", "Podaj nazwę kontrahenta");
      return;
    }
    if (!isValidNipFormat(draft.nip)) {
      toast("error", "Nieprawidłowy NIP", "NIP musi mieć 10 cyfr i poprawną sumę kontrolną.");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      nip: normalizeNip(draft.nip),
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

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj: nazwa, NIP, miasto…"
          className="pl-8"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {filtered.map((c) => {
            const nipOk = isValidNipFormat(c.nip);
            return (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
              >
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2 p-4 pb-2">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold">{c.name}</p>
                        <p className="font-mono text-[12px] text-muted-foreground">{formatNip(c.nip)}</p>
                      </div>
                    </div>
                    <Badge tone={nipOk ? (c.isVatPayer ? "success" : "warning") : "danger"}>
                      {nipOk ? (c.isVatPayer ? "płatnik VAT" : "zwolniony") : "zły NIP"}
                    </Badge>
                  </div>
                  <div className="flex-1 px-4 pb-3 text-[12.5px] text-muted-foreground">
                    <p>{c.address.street}</p>
                    <p>
                      {c.address.postal} {c.address.city} · {c.address.country}
                    </p>
                    {c.iban && (
                      <p className="mt-1 truncate font-mono text-[11px]">{c.iban}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 border-t border-border/70 p-2">
                    <span className="px-1 text-[11px] text-muted-foreground">
                      {useAppStore.getState().invoices.filter((i) => i.contractorId === c.id).length} faktur
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Edytuj">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToDelete(c.id)}
                        title="Usuń"
                        className="text-muted-foreground hover:text-red-500"
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
        <Card className="py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-[14px] font-semibold">Brak kontrahentów</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Dodaj pierwszego kontrahenta lub zmień kryteria wyszukiwania.
          </p>
          {contractors.length === 0 && (
            <Button size="sm" className="mt-4" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Dodaj kontrahenta
            </Button>
          )}
        </Card>
      )}

      {/* Dialog dodawania/edycji */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? "Edytuj kontrahenta" : "Nowy kontrahent"}
        description="NIP jest walidowany (format + suma kontrolna); możesz sprawdzić dane w GUS (demo)."
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
          <div className="space-y-1.5">
            <Label>NIP *</Label>
            <NipLookup
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
            />
          </div>
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
        description="Faktury powiązane z tym kontrahentem zostaną w systemie (bez przypisanej nazwy)."
      />
    </div>
  );
}
