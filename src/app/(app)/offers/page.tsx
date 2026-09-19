"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileCheck2,
  Plus,
  Search,
  Trash2,
  Pencil,
  ArrowRight,
  Share2,
  Clock,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Briefcase,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { formatDate, formatMoney } from "@/lib/format";
import type { Offer, Currency, InvoiceLine } from "@/lib/types";
import { uid } from "@/lib/utils";

type OfferStatus = Offer["status"];

const STATUS_MAP: Record<OfferStatus, { label: string; tone: "outline" | "success" | "warning" | "danger" | "neutral" }> = {
  draft: { label: "Szkic", tone: "outline" },
  sent: { label: "Wysłana", tone: "warning" },
  accepted: { label: "Zaakceptowana", tone: "success" },
  rejected: { label: "Odrzucona", tone: "danger" },
  expired: { label: "Wygasła", tone: "neutral" },
  converted: { label: "Skonwertowana", tone: "neutral" },
};

export default function OffersPage() {
  const router = useRouter();
  const toast = useToast();
  const selectedCompanyId = useAppStore(s => s.selectedCompanyId);
  const [legacy, setLegacy] = React.useState(false);
  React.useEffect(() => { setLegacy(false); }, [selectedCompanyId]);
  const scope = legacy ? "legacy" : selectedCompanyId || "legacy";
  const scopeRef = React.useRef(scope);
  scopeRef.current = scope;
  React.useEffect(() => { setModalOpen(false); setToDelete(null); }, [scope]);
  const { contractors: allContractors } = useAppStore();
  const contractors = allContractors.filter(c => !c.companyId || c.companyId === scope);

  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | OfferStatus>("all");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<string | null>(null);
  const [editingOffer, setEditingOffer] = React.useState<Offer | null>(null);

  // Formularz oferty
  const [formContractorId, setFormContractorId] = React.useState("");
  const [formTitle, setFormTitle] = React.useState("");
  const [formNumber, setFormNumber] = React.useState("");
  const [formIssueDate, setFormIssueDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [formValidUntil, setFormValidUntil] = React.useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [formCurrency, setFormCurrency] = React.useState<Currency>("PLN");
  const [formNotes, setFormNotes] = React.useState("");
  const [formLines, setFormLines] = React.useState<InvoiceLine[]>([
    { id: uid("ol"), name: "", quantity: 1, unit: "usł.", netPrice: 0, vatRate: "23" },
  ]);

  const loadOffers = React.useCallback(async () => {
    try {
      setOffers([]);
      setLoading(true);
      const res = await fetch(`/api/offers?companyId=${scope}`);
      if (!res.ok) throw new Error("Nie udało się pobrać danych.");
      if (scopeRef.current !== scope) return;
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
      }
    } catch {
      toast("error", "Błąd ładowania ofert", "Nie udało się pobrać listy ofert.");
    } finally {
      setLoading(false);
    }
  }, [toast, scope]);

  React.useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const resetForm = () => {
    setEditingOffer(null);
    setFormContractorId(contractors[0]?.id || "");
    setFormTitle(`Oferta handlowa - ${new Date().toLocaleDateString("pl-PL")}`);
    setFormNumber(`OF/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`);
    setFormIssueDate(new Date().toISOString().slice(0, 10));
    setFormValidUntil(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    setFormCurrency("PLN");
    setFormNotes("Oferta ważna przez 14 dni od daty wystawienia. Warunki płatności: przelew 14 dni.");
    setFormLines([{ id: uid("ol"), name: "", quantity: 1, unit: "usł.", netPrice: 0, vatRate: "23" }]);
  };

  const handleOpenNew = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleEdit = (offer: Offer) => {
    setEditingOffer(offer);
    setFormContractorId(offer.contractorId || "");
    setFormTitle(offer.title);
    setFormNumber(offer.number);
    setFormIssueDate(offer.issueDate);
    setFormValidUntil(offer.validUntil);
    setFormCurrency(offer.currency);
    setFormNotes(offer.notes || "");
    setFormLines(offer.lines?.length ? offer.lines : [{ id: uid("ol"), name: "", quantity: 1, unit: "usł.", netPrice: 0, vatRate: "23" }]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formContractorId) {
      toast("error", "Błąd walidacji", "Wybierz kontrahenta.");
      return;
    }
    const validLines = formLines.filter((l) => l.name.trim() && l.quantity > 0);
    if (validLines.length === 0) {
      toast("error", "Błąd walidacji", "Dodaj co najmniej jedną pozycję z nazwą i ceną.");
      return;
    }

    const payload = {
      version: editingOffer?.version,
      contractorId: formContractorId,
      title: formTitle,
      number: formNumber,
      issueDate: formIssueDate,
      validUntil: formValidUntil,
      currency: formCurrency,
      notes: formNotes,
      lines: validLines,
    };

    try {
      const url = editingOffer ? `/api/offers/${editingOffer.id}` : "/api/offers";
      const method = editingOffer ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, companyId: scope === "legacy" ? null : scope }),
      });
      if (res.ok) {
        toast("success", editingOffer ? "Zaktualizowano ofertę" : "Utworzono ofertę", formNumber);
        setModalOpen(false);
        loadOffers();
      } else {
        const err = await res.json();
        toast("error", "Błąd zapisu", err.error || "Nie udało się zapisać oferty.");
      }
    } catch {
      toast("error", "Błąd zapisu", "Wystąpił problem z połączeniem.");
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      const res = await fetch(`/api/offers/${toDelete}`, { method: "DELETE" });
      if (res.ok) {
        toast("info", "Usunięto ofertę", "Oferta została pomyślnie usunięta.");
        loadOffers();
      }
    } catch {
      toast("error", "Błąd usuwania", "Nie udało się usunąć oferty.");
    } finally {
      setToDelete(null);
    }
  };

  const handleConvert = async (offerId: string, target: "invoice" | "order") => {
    try {
      const res = await fetch(`/api/offers/${offerId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (target === "invoice") {
          toast("success", "Przekształcono w fakturę", `Utworzono fakturę ${data.invoice.number}`);
          router.push(`/invoices/${data.invoice.id}`);
        } else {
          toast("success", "Przekształcono w zlecenie", `Utworzono zlecenie ${data.order.number}`);
          router.push(`/orders`);
        }
        loadOffers();
      } else {
        toast("error", "Błąd konwersji", data.error || "Nie udało się przekształcić oferty.");
      }
    } catch {
      toast("error", "Błąd konwersji", "Wystąpił problem z połączeniem.");
    }
  };

  const handleCopyClientLink = async (offer: Offer) => {
    try {
      let publicToken = offer.publicToken;
      if (offer.status === "draft") {
        const res = await fetch(`/api/offers/${offer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "sent", version: offer.version }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Nie udało się udostępnić oferty.");
        publicToken = data.offer.publicToken;
        await loadOffers();
      }
      await navigator.clipboard.writeText(`${window.location.origin}/portal/${publicToken}`);
      toast("success", "Skopiowano link do oferty");
    } catch (e) { toast("error", "Błąd", e instanceof Error ? e.message : "Nie udało się skopiować linku."); }
  };

  const filtered = offers.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const ctr = contractors.find((c) => c.id === o.contractorId)?.name || "";
    return `${o.number} ${o.title} ${ctr}`.toLowerCase().includes(q);
  });

  const totalAcceptedValue = offers
    .filter((o) => o.status === "accepted" || o.status === "converted")
    .reduce((sum, o) => sum + o.totalGross, 0);

  const totalPendingValue = offers
    .filter((o) => o.status === "sent" || o.status === "draft")
    .reduce((sum, o) => sum + o.totalGross, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Oferty handlowe"
        description="Wyceny, bezpieczne linki akceptacji dla klientów oraz błyskawiczna konwersja do zleceń i faktur VAT."
        actions={
          <Button onClick={handleOpenNew} className="rounded-xl gap-2 shadow-xs">
            <Plus className="h-4 w-4" /> Nowa oferta
          </Button>
        }
      />

      {/* Karty podsumowujące */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 bg-card/60 backdrop-blur-md border-border/70">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Wszystkie oferty</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{offers.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Łącznie przygotowanych dokumentów</p>
        </Card>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Zaakceptowane / Zrealizowane</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(totalAcceptedValue, "PLN")}</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-1">Potencjał przychodowy zamknięty</p>
        </Card>
        <Card className="p-4 bg-primary/5 border-primary/20">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">W toku (w negocjacji)</p>
          <p className="mt-1 text-2xl font-bold text-primary">{formatMoney(totalPendingValue, "PLN")}</p>
          <p className="text-xs text-muted-foreground mt-1">Oczekuje na akceptację klienta</p>
        </Card>
      </div>

      {/* Pasek filtrowania */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/70 p-3.5 backdrop-blur-md">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj: numer, tytuł, kontrahent…"
            className="pl-9.5 h-10 rounded-xl text-xs"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto text-xs">
          {(["all", "draft", "sent", "accepted", "rejected", "converted"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {s === "all" ? "Wszystkie" : STATUS_MAP[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Lista ofert */}
      <Card className="overflow-hidden border-border/70 bg-card/70 backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 px-4">Numer & Tytuł</th>
                <th className="py-3 px-4">Kontrahent</th>
                <th className="py-3 px-4">Data & Ważność</th>
                <th className="py-3 px-4 text-right">Wartość brutto</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((offer) => {
                const ctr = contractors.find((c) => c.id === offer.contractorId);
                const isExpired = new Date(offer.validUntil) < new Date() && offer.status === "sent";
                return (
                  <tr key={offer.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3.5 px-4 font-medium">
                      <p className="font-bold text-[13px] text-foreground">{offer.number}</p>
                      <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">{offer.title}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-foreground">{ctr?.name || "—"}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">{ctr?.nip || ""}</p>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">
                      <p>{formatDate(offer.issueDate)}</p>
                      <p className={`text-[10.5px] ${isExpired ? "text-rose-600 font-semibold" : "opacity-75"}`}>
                        do: {formatDate(offer.validUntil)} {isExpired ? "(wygasła)" : ""}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-right tabular-nums">
                      <p className="font-bold text-[13px] text-foreground">{formatMoney(offer.totalGross, offer.currency)}</p>
                      <p className="text-[11px] text-muted-foreground">netto: {formatMoney(offer.totalNet, offer.currency)}</p>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <Badge tone={STATUS_MAP[offer.status]?.tone || "neutral"}>
                        {STATUS_MAP[offer.status]?.label || offer.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {offer.status !== "converted" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConvert(offer.id, "invoice")}
                              title="Wystaw fakturę VAT z tej oferty"
                              className="h-8 px-2.5 text-xs text-primary border-primary/30 hover:bg-primary/10 gap-1 rounded-xl font-semibold"
                            >
                              <ArrowRight className="h-3.5 w-3.5" /> Faktura
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleConvert(offer.id, "order")}
                              title="Przekształć w zlecenie"
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                            >
                              <Briefcase className="h-3.5 w-3.5 mr-1" /> Zlecenie
                            </Button>
                          </>
                        )}

                        {offer.publicToken && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyClientLink(offer)}
                            title="Kopiuj link do portalu klienta"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(offer)}
                          disabled={["accepted", "rejected", "converted"].includes(offer.status)}
                          title="Edytuj ofertę"
                          className="h-8 w-8 rounded-lg"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setToDelete(offer.id)}
                          title="Usuń ofertę"
                          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && !loading && (
            <div className="py-16 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">Brak ofert</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Nie utworzyłeś jeszcze żadnej oferty handlowej lub żadna nie pasuje do wybranych filtrów.
              </p>
              <Button onClick={handleOpenNew} size="sm" className="rounded-xl mt-2">
                <Plus className="h-3.5 w-3.5 mr-1" /> Utwórz pierwszą ofertę
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Modal tworzenia / edycji oferty */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingOffer ? `Edytuj ofertę ${editingOffer.number}` : "Nowa oferta handlowa"}
        description="Przygotuj przejrzysty kosztorys dla swojego klienta z możliwością natychmiastowej akceptacji."
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSave} className="font-semibold">
              {editingOffer ? "Zapisz zmiany" : "Zapisz i wygeneruj ofertę"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kontrahent *</Label>
              <Select value={formContractorId} onChange={(e) => setFormContractorId(e.target.value)}>
                <option value="">— wybierz klienta —</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.nip})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Numer oferty *</Label>
              <Input value={formNumber} onChange={(e) => setFormNumber(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tytuł oferty / Zakres wyceny *</Label>
            <Input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="np. Wdrożenie sklepu internetowego i integracja z ERP"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Data wystawienia</Label>
              <Input type="date" value={formIssueDate} onChange={(e) => setFormIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Termin ważności</Label>
              <Input type="date" value={formValidUntil} onChange={(e) => setFormValidUntil(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Waluta</Label>
              <Select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value as Currency)}>
                <option value="PLN">PLN</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </Select>
            </div>
          </div>

          {/* Pozycje oferty */}
          <div className="space-y-2 border-t border-border/50 pt-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Pozycje wyceny</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormLines([
                    ...formLines,
                    { id: uid("ol"), name: "", quantity: 1, unit: "usł.", netPrice: 0, vatRate: "23" },
                  ])
                }
                className="h-7 text-[11px] rounded-lg"
              >
                <Plus className="h-3 w-3 mr-1" /> Dodaj wiersz
              </Button>
            </div>

            <div className="space-y-2">
              {formLines.map((line, idx) => (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6">
                    <Input
                      value={line.name}
                      onChange={(e) =>
                        setFormLines(formLines.map((l, i) => (i === idx ? { ...l, name: e.target.value } : l)))
                      }
                      placeholder="Nazwa usługi / materiału"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={line.quantity}
                      onChange={(e) =>
                        setFormLines(
                          formLines.map((l, i) => (i === idx ? { ...l, quantity: Number(e.target.value) || 1 } : l))
                        )
                      }
                      placeholder="Ilość"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      value={line.netPrice}
                      onChange={(e) =>
                        setFormLines(
                          formLines.map((l, i) => (i === idx ? { ...l, netPrice: Number(e.target.value) || 0 } : l))
                        )
                      }
                      placeholder="Cena netto"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-1 text-right">
                    {formLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFormLines(formLines.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 border-t border-border/50 pt-2">
            <Label>Warunki oferty / Uwagi</Label>
            <Textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              placeholder="np. Czas realizacji, warunki gwarancji, zaliczka..."
            />
          </div>
        </div>
      </Dialog>

      {/* Potwierdzenie usunięcia */}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Usuń ofertę"
        description="Czy na pewno chcesz usunąć tę ofertę? Ta operacja jest nieodwracalna."
        confirmLabel="Usuń ofertę"
        danger={true}
      />
    </div>
  );
}

