"use client";

import { SummaryCurrency } from "@/components/summary-currency";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Briefcase,
  Plus,
  Search,
  Trash2,
  Pencil,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Layers,
  ListFilter,
  DollarSign,
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
import type { Order, Currency } from "@/lib/types";

type OrderStatus = Order["status"];

const ORDER_STATUSES: Array<{
  id: OrderStatus;
  label: string;
  tone: "neutral" | "warning" | "outline" | "success" | "danger";
}> = [
  { id: "in_progress", label: "W realizacji", tone: "warning" },
  { id: "completed", label: "Zakończone", tone: "success" },
  { id: "billed", label: "Rozliczone / Faktura", tone: "outline" },
  { id: "cancelled", label: "Anulowane", tone: "danger" },
];

export default function OrdersPage() {
  const router = useRouter();
  const toast = useToast();
  const selectedCompanyId = useAppStore(s => s.selectedCompanyId);
  const [summaryCurrency, setSummaryCurrency] = React.useState("PLN");
  const [legacy, setLegacy] = React.useState(false);
  React.useEffect(() => { setLegacy(false); }, [selectedCompanyId]);
  const scope = legacy ? "legacy" : selectedCompanyId || "legacy";
  const scopeRef = React.useRef(scope);
  scopeRef.current = scope;
  React.useEffect(() => { setModalOpen(false); setToDelete(null); setLogTimeOrder(null); }, [scope]);
  const { contractors: allContractors } = useAppStore();
  const contractors = allContractors.filter(c => !c.companyId || c.companyId === scope);

  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | OrderStatus>("all");
  const [viewMode, setViewMode] = React.useState<"kanban" | "table">("kanban");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<string | null>(null);
  const [editingOrder, setEditingOrder] = React.useState<Order | null>(null);

  // Time logging modal
  const [logTimeOrder, setLogTimeOrder] = React.useState<Order | null>(null);
  const [hoursToAdd, setHoursToAdd] = React.useState("1");

  // Formularz zlecenia
  const [formContractorId, setFormContractorId] = React.useState("");
  const [formTitle, setFormTitle] = React.useState("");
  const [formNumber, setFormNumber] = React.useState("");
  const [formStatus, setFormStatus] = React.useState<OrderStatus>("in_progress");
  const [formTotalGross, setFormTotalGross] = React.useState("5000");
  const [formHourlyRate, setFormHourlyRate] = React.useState("150");
  const [formCurrency, setFormCurrency] = React.useState<Currency>("PLN");
  const [formNotes, setFormNotes] = React.useState("");

  const loadOrders = React.useCallback(async () => {
    try {
      setOrders([]);
      setLoading(true);
      const res = await fetch(`/api/orders?companyId=${scope}`);
      if (!res.ok) throw new Error("Nie udało się pobrać danych.");
      if (scopeRef.current !== scope) return;
      if (res.ok) {
        const data = await res.json();
        if (scopeRef.current !== scope) return;
        setOrders(data.orders || []);
      }
    } catch {
      toast("error", "Błąd ładowania zleceń", "Nie udało się pobrać listy zleceń.");
    } finally {
      setLoading(false);
    }
  }, [toast, scope]);

  React.useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const resetForm = () => {
    setEditingOrder(null);
    setFormContractorId(contractors[0]?.id || "");
    setFormTitle("Realizacja zlecenia programistycznego");
    setFormNumber(`ZL/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`);
    setFormStatus("in_progress");
    setFormTotalGross("5000");
    setFormHourlyRate("150");
    setFormCurrency("PLN");
    setFormNotes("");
  };

  const handleOpenNew = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setFormContractorId(order.contractorId || "");
    setFormTitle(order.title);
    setFormNumber(order.number);
    setFormStatus(order.status);
    setFormTotalGross(order.totalGross ? String(order.totalGross) : "0");
    setFormHourlyRate(order.hourlyRate ? String(order.hourlyRate) : "0");
    setFormCurrency(order.currency);
    setFormNotes(order.notes || "");
    setModalOpen(true);
  };

  const [savingForm, setSavingForm] = React.useState(false);
  const savingFormRef = React.useRef(false);
  const handleSave = async () => {
    if (savingFormRef.current) return;
    if (!formContractorId) {
      toast("error", "Błąd walidacji", "Wybierz kontrahenta.");
      return;
    }
    if (!formTitle.trim()) {
      toast("error", "Błąd walidacji", "Podaj tytuł zlecenia.");
      return;
    }

    const payload = {
      contractorId: formContractorId,
      title: formTitle,
      number: formNumber,
      status: formStatus,
      totalGross: Number(formTotalGross) || 0,
      hourlyRate: Number(formHourlyRate) || 0,
      currency: formCurrency,
      notes: formNotes,
    };

    const savedScope = scope;
    savingFormRef.current = true;
    setSavingForm(true);
    try {
      const url = editingOrder ? `/api/orders/${editingOrder.id}` : "/api/orders";
      const method = editingOrder ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, companyId: scope === "legacy" ? null : scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Nie udało się zapisać zlecenia.");
      if (!data.order?.id) throw new Error("Serwer nie potwierdził zapisu zlecenia.");
      if (scopeRef.current !== savedScope) return;
      setOrders((previous) => editingOrder
        ? previous.map((order) => order.id === data.order.id ? data.order as Order : order)
        : [data.order as Order, ...previous]);
      toast("success", editingOrder ? "Zaktualizowano zlecenie" : "Utworzono zlecenie", formNumber);
      setModalOpen(false);
    } catch (error) {
      if (scopeRef.current === savedScope) {
        toast("error", "Błąd zapisu", error instanceof Error ? error.message : "Wystąpił problem z połączeniem.");
      }
    } finally {
      savingFormRef.current = false;
      setSavingForm(false);
    }
  };

  const handleStatusChange = async (orderId: string, status: OrderStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
        toast("info", "Zmieniono status", `Nowy status: ${ORDER_STATUSES.find((s) => s.id === status)?.label}`);
      } else {
        const error = await res.json();
        toast("error", "Błąd aktualizacji", error.error || "Nie udało się zmienić statusu.");
      }
    } catch {
      toast("error", "Błąd aktualizacji", "Nie udało się zmienić statusu.");
    }
  };

  const loggingTimeRef = React.useRef(false);
  const handleLogTime = async () => {
    if (!logTimeOrder || loggingTimeRef.current) return;
    const addedHours = Number(hoursToAdd);
    const rawMinutes = addedHours * 60;
    const addedMinutes = Math.round(rawMinutes);
    if (!Number.isFinite(addedHours) || addedMinutes <= 0 || Math.abs(rawMinutes - addedMinutes) > 1e-7) {
      toast("error", "Błąd walidacji", "Podaj dodatni czas w pełnych minutach.");
      return;
    }
    const savedScope = scope;
    loggingTimeRef.current = true;
    try {
      const res = await fetch(`/api/orders/${logTimeOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackedHours: addedMinutes / 60 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Nie udało się zapisać czasu.");
      if (!data.order?.id) throw new Error("Serwer nie potwierdził zapisu czasu.");
      if (scopeRef.current !== savedScope) return;
      setOrders((previous) => previous.map((order) => order.id === data.order.id ? data.order as Order : order));
      toast("success", "Zalogowano czas pracy", `+${addedMinutes} min. Łącznie: ${data.order.trackedMinutes} min.`);
      setLogTimeOrder(null);
    } catch (error) {
      if (scopeRef.current === savedScope) {
        toast("error", "Błąd zapisu czasu", error instanceof Error ? error.message : "Nie udało się zaktualizować czasu.");
      }
    } finally {
      loggingTimeRef.current = false;
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      const res = await fetch(`/api/orders/${toDelete}`, { method: "DELETE" });
      if (res.ok) {
        toast("info", "Usunięto zlecenie", "Zlecenie zostało pomyślnie usunięte.");
        loadOrders();
      } else {
        const error = await res.json();
        toast("error", "Błąd operacji", error.error || "Nie udało się usunąć zlecenia.");
      }
    } catch {
      toast("error", "Błąd usuwania", "Nie udało się usunąć zlecenia.");
    } finally {
      setToDelete(null);
    }
  };

  const handleConvertToInvoice = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/convert`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast("success", "Utworzono fakturę VAT", `Faktura nr ${data.invoice.number}`);
        router.push(`/invoices/${data.invoice.id}`);
      } else {
        toast("error", "Błąd konwersji", data.error || "Nie udało się wygenerować faktury.");
      }
    } catch {
      toast("error", "Błąd konwersji", "Wystąpił problem z połączeniem.");
    }
  };

  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${o.number} ${o.title} ${o.contractorName}`.toLowerCase().includes(q);
  });

  const totalTrackedMinutes = orders.reduce((sum, o) => sum + (o.trackedMinutes || 0), 0);
  const totalValueActive = orders.filter(o => o.currency === summaryCurrency)
    .filter((o) => o.status === "in_progress")
    .reduce((sum, o) => sum + (o.totalGross || 0), 0);

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={legacy} onChange={e => setLegacy(e.target.checked)} />Dokumenty bez przypisanej firmy (archiwum)</label>
      <SummaryCurrency value={summaryCurrency} currencies={orders.map(o => o.currency)} onChange={setSummaryCurrency} />
      <PageHeader
        title="Zlecenia i Realizacje"
        description="Tablica postępu prac, rozliczanie przepracowanych godzin i wystawianie faktur rozliczeniowych 1 kliknięciem."
        actions={
          <Button onClick={handleOpenNew} className="rounded-xl gap-2 shadow-xs">
            <Plus className="h-4 w-4" /> Nowe zlecenie
          </Button>
        }
      />

      {/* Karty podsumowujące */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 bg-card/60 backdrop-blur-md border-border/70">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Wszystkie zlecenia</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{orders.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Aktywne i archiwalne projekty</p>
        </Card>
        <Card className="p-4 bg-primary/5 border-primary/20">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Przepracowany czas</p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {Math.floor(totalTrackedMinutes / 60)}h {totalTrackedMinutes % 60}m
          </p>
          <p className="text-xs text-muted-foreground mt-1">Zalogowany czas pracy w projektach</p>
        </Card>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Wartość zleceń w toku
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalValueActive, summaryCurrency)}
          </p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-1">Projekty do rozliczenia</p>
        </Card>
      </div>

      {/* Pasek filtrowania i widoku */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/70 p-3.5 backdrop-blur-md">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj zlecenia, numeru, klienta…"
            className="pl-9.5 h-10 rounded-xl text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-muted/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Tablica
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListFilter className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
        </div>
      </div>

      {/* Widok KANBAN */}
      {viewMode === "kanban" ? (
        <div className="grid gap-4 md:grid-cols-4 items-start">
          {ORDER_STATUSES.map((statusObj) => {
            const statusOrders = filtered.filter((o) => o.status === statusObj.id);
            return (
              <div
                key={statusObj.id}
                className="rounded-2xl border border-border/70 bg-card/50 backdrop-blur-md p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-foreground">{statusObj.label}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
                      {statusOrders.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 min-h-[150px]">
                  {statusOrders.map((order) => (
                    <Card
                      key={order.id}
                      className="p-3.5 hover:shadow-md transition-shadow bg-card/90 border-border/80 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <span className="text-[10.5px] font-mono text-muted-foreground">{order.number}</span>
                          <h4 className="font-semibold text-xs text-foreground line-clamp-2">{order.title}</h4>
                        </div>
                        <Badge tone={statusObj.tone} className="text-[10px] shrink-0">
                          {statusObj.label}
                        </Badge>
                      </div>

                      <p className="text-[11px] text-muted-foreground truncate">{order.contractorName}</p>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                        <span className="font-semibold text-foreground">
                          {formatMoney(order.totalGross, order.currency)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {Math.floor((order.trackedMinutes || 0) / 60)}h {(order.trackedMinutes || 0) % 60}m
                        </span>
                      </div>

                      {/* Akcje karty */}
                      <div className="flex items-center justify-between pt-1 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={Boolean(order.billedInvoiceId)}
                          onClick={() => setLogTimeOrder(order)}
                          className="h-7 text-[10.5px] px-2 text-primary hover:bg-primary/10"
                          title="Zaloguj czas pracy"
                        >
                          <Clock className="h-3 w-3 mr-1" /> +Czas
                        </Button>

                        <div className="flex items-center gap-1">
                          {order.status !== "billed" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConvertToInvoice(order.id)}
                              className="h-7 text-[10.5px] px-2 rounded-lg font-medium text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              title="Wystaw fakturę ze zlecenia"
                            >
                              Faktura
                            </Button>
                          ) : (
                            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                              <CheckCircle2 className="h-3 w-3" /> Rozliczone
                            </span>
                          )}

                          <Select
                            disabled={Boolean(order.billedInvoiceId)}
                            value={order.status}
                            onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                            className="h-7 text-[10.5px] w-auto py-0 px-1.5"
                          >
                            {ORDER_STATUSES.map((s) => (
                              <option key={s.id} value={s.id}>
                                → {s.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    </Card>
                  ))}

                  {statusOrders.length === 0 && (
                    <div className="py-8 text-center text-xs text-muted-foreground/60">Brak zleceń</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Widok tabeli */
        <Card className="overflow-hidden border-border/70 bg-card/70 backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 px-4">Numer & Tytuł</th>
                  <th className="py-3 px-4">Klient</th>
                  <th className="py-3 px-4 text-right">Wartość brutto</th>
                  <th className="py-3 px-4 text-center">Zalogowany czas</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map((order) => {
                  const statusObj = ORDER_STATUSES.find((s) => s.id === order.status);
                  return (
                    <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-medium">
                        <p className="font-bold text-[13px] text-foreground">{order.number}</p>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{order.title}</p>
                      </td>
                      <td className="py-3 px-4">{order.contractorName || "—"}</td>
                      <td className="py-3 px-4 text-right font-bold tabular-nums">
                        {formatMoney(order.totalGross, order.currency)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        {Math.floor((order.trackedMinutes || 0) / 60)}h {(order.trackedMinutes || 0) % 60}m
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge tone={statusObj?.tone || "neutral"}>{statusObj?.label || order.status}</Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {order.status !== "billed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConvertToInvoice(order.id)}
                              className="h-8 px-2 text-xs text-primary border-primary/30"
                            >
                              <ArrowRight className="h-3 w-3 mr-1" /> Faktura
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" disabled={Boolean(order.billedInvoiceId)}
                          onClick={() => handleEdit(order)} className="h-8 w-8">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={Boolean(order.billedInvoiceId)}
                          onClick={() => setToDelete(order.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-rose-500"
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
          </div>
        </Card>
      )}

      {/* Modal dodania / edycji zlecenia */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingOrder ? `Edycja zlecenia ${editingOrder.number}` : "Nowe zlecenie"}
        description="Wprowadź parametry realizacji, budżet i stawkę."
        size="md"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={savingForm} className="font-semibold">
              {editingOrder ? "Zapisz zmiany" : "Utwórz zlecenie"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5 py-2 text-xs">
          <div className="space-y-1.5">
            <Label>Klient *</Label>
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
            <Label>Tytuł zlecenia *</Label>
            <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Numer zlecenia</Label>
              <Input value={formNumber} onChange={(e) => setFormNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={formStatus} onChange={(e) => setFormStatus(e.target.value as OrderStatus)}>
                {ORDER_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Wycena brutto</Label>
              <Input
                type="number"
                value={formTotalGross}
                onChange={(e) => setFormTotalGross(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stawka za h (opcjonalnie)</Label>
              <Input
                type="number"
                value={formHourlyRate}
                onChange={(e) => setFormHourlyRate(e.target.value)}
              />
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

          <div className="space-y-1.5">
            <Label>Notatki / Wytyczne</Label>
            <Textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              placeholder="np. Zakres prac, repozytorium kodu, harmonogram..."
            />
          </div>
        </div>
      </Dialog>

      {/* Modal logowania godzin */}
      <Dialog
        open={Boolean(logTimeOrder)}
        onClose={() => setLogTimeOrder(null)}
        title="Zaloguj czas pracy"
        description={`Dodaj przepracowane godziny do zlecenia: ${logTimeOrder?.title}`}
        size="sm"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button variant="ghost" onClick={() => setLogTimeOrder(null)}>
              Anuluj
            </Button>
            <Button onClick={handleLogTime}>Zapisz czas</Button>
          </div>
        }
      >
        <div className="space-y-3 py-2 text-xs">
          <div className="space-y-1.5">
            <Label>Liczba godzin do dodania</Label>
            <Input
              type="number"
              step="0.5"
              value={hoursToAdd}
              onChange={(e) => setHoursToAdd(e.target.value)}
            />
          </div>
          <p className="text-muted-foreground text-[11px]">
            Obecny stan: <b>{Math.floor((logTimeOrder?.trackedMinutes || 0) / 60)}h {(logTimeOrder?.trackedMinutes || 0) % 60}m</b>
          </p>
        </div>
      </Dialog>

      {/* Potwierdzenie usunięcia */}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Usuń zlecenie"
        description="Czy na pewno chcesz usunąć to zlecenie? Ta operacja jest nieodwracalna."
        confirmLabel="Usuń zlecenie"
        danger={true}
      />
    </div>
  );
}

