"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { InfoTooltip } from "@/components/ui/tooltip";
import { formatMoney, vatRateLabel, VAT_RATES } from "@/lib/format";
import type { Product, VatRate } from "@/lib/types";

interface ProductDraft {
  name: string;
  sku: string;
  unit: string;
  netPrice: number;
  vatRate: VatRate;
  description: string;
}

const emptyDraft: ProductDraft = {
  name: "",
  sku: "",
  unit: "szt.",
  netPrice: 0,
  vatRate: "23",
  description: "",
};

export default function ProductsPage() {
  const toast = useToast();
  const { products: allProducts, selectedCompanyId, addProduct, updateProduct, deleteProduct } = useAppStore();

  const products = allProducts.filter(item => !item.companyId || item.companyId === selectedCompanyId);

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<ProductDraft>(emptyDraft);
  const [toDelete, setToDelete] = React.useState<string | null>(null);

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${p.name} ${p.sku ?? ""} ${p.description ?? ""}`.toLowerCase().includes(q);
  });

  const openNew = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setDraft({
      name: p.name,
      sku: p.sku ?? "",
      unit: p.unit,
      netPrice: p.netPrice,
      vatRate: p.vatRate,
      description: p.description ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast("error", "Podaj nazwę produktu/usługi");
      return;
    }
    if (Number.isNaN(draft.netPrice) || draft.netPrice < 0) {
      toast("error", "Cena netto musi być liczbą nieujemną");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      sku: draft.sku.trim() || undefined,
      unit: draft.unit.trim() || "szt.",
      netPrice: Number(draft.netPrice) || 0,
      vatRate: draft.vatRate,
      description: draft.description.trim() || undefined,
    };
    try {
      if (editingId) {
        await updateProduct(editingId, payload);
        toast("success", "Zaktualizowano pozycję", payload.name);
      } else {
        await addProduct(payload);
        toast("success", "Dodano pozycję", payload.name);
      }
      setDialogOpen(false);
    } catch (e) {
      toast("error", "Nie udało się zapisać", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div>
      <PageHeader
        title="Produkty / Usługi"
        description="Katalog pozycji i cennik do szybkiego wstawiania na fakturach."
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Dodaj pozycję
          </Button>
        }
      />

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj: nazwa, SKU, opis…"
          className="pl-9 h-9"
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-card  shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Pozycja</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5">J.m.</th>
                <th className="px-3 py-2.5 text-right">Cena netto (PLN)</th>
                <th className="px-3 py-2.5">VAT</th>
                <th className="px-3 py-2.5 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((p) => (
                  <motion.tr
                    key={p.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success ring-1 ring-inset ring-success/20">
                          <Package className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold">{p.name}</p>
                          {p.description && (
                            <p className="max-w-[320px] truncate text-[11.5px] text-muted-foreground">
                              {p.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px] text-muted-foreground">
                      {p.sku ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{p.unit}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">
                      {formatMoney(p.netPrice, "PLN")}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={p.vatRate === "zw" || p.vatRate === "np" ? "warning" : "default"}>
                        {vatRateLabel(p.vatRate)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edytuj">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setToDelete(p.id)}
                          title="Usuń"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Package className="h-6 w-6" />
              </div>
              <p className="mt-4 text-[15px] font-semibold text-foreground">
                {products.length === 0 ? "Brak pozycji w katalogu" : "Brak pozycji spełniających kryteria"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-muted-foreground leading-relaxed">
                {products.length === 0
                  ? "Zdefiniuj swoje towary i usługi ze stawkami VAT, aby błyskawicznie wypełniać pozycje faktur."
                  : "Zmień parametry wyszukiwania."}
              </p>
              <Button size="sm" className="mt-4 gap-1.5 rounded-xl" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" /> Dodaj pozycję
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? "Edytuj pozycję" : "Nowa pozycja katalogu"}
        description="Pozycje są dostępne w kreatorze faktury jako szybkie wstawianie."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={save}>
              <Plus className="h-4 w-4" /> {editingId ? "Zapisz zmiany" : "Dodaj"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nazwa *</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="np. Usługa programistyczna (osobodzień)"
            />
          </div>
          <div className="space-y-1.5">
            <Label>SKU (opcjonalnie)</Label>
            <Input
              value={draft.sku}
              onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
              placeholder="SVC-DEV"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Jednostka miary</Label>
            <Input
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              placeholder="szt., godz., md, msc…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cena netto (PLN) *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={draft.netPrice}
              onChange={(e) => setDraft({ ...draft, netPrice: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stawka VAT</Label>
            <Select
              value={draft.vatRate}
              onChange={(e) => setDraft({ ...draft, vatRate: e.target.value as VatRate })}
            >
              {VAT_RATES.map((r) => (
                <option key={r} value={r}>
                  {vatRateLabel(r)} —{" "}
                  {r === "zw" ? "zwolnione" : r === "np" ? "nie podlega" : `stawka ${r}%`}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Opis</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              placeholder="Krótki opis widoczny na liście…"
            />
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            const p = products.find((x) => x.id === toDelete);
            void deleteProduct(toDelete)
              .then(() => toast("success", "Usunięto pozycję", p?.name))
              .catch((e: Error) => toast("error", "Nie udało się usunąć", e.message));
          }
        }}
        title="Usunąć pozycję z katalogu?"
        description="Istniejące faktury nie zostaną zmienione."
      />
    </div>
  );
}

