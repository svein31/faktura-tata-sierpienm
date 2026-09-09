"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp,
  CloudDownload,
  Copy,
  Download,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore, effectiveStatus, STATUS_META, getContractor } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { buildFa3Xml } from "@/lib/ksef/xmlBuilder";
import { formatDate, formatMoney, invoiceTotals } from "@/lib/format";
import type { EffectiveStatus } from "@/lib/store";
import type { Invoice, InvoiceType } from "@/lib/types";
import { EMPTY_COMPANY } from "@/lib/types";

const STATUS_FILTERS: Array<{ value: "all" | EffectiveStatus; label: string }> = [
  { value: "all", label: "Wszystkie dokumenty" },
  { value: "ksef_active", label: "KSeF Zarejestrowane" },
  { value: "ksef_sent", label: "KSeF w kolejce" },
  { value: "issued", label: "Wystawione" },
  { value: "paid", label: "Opłacone" },
  { value: "overdue", label: "Przeterminowane" },
  { value: "draft", label: "Szkice" },
];

export default function InvoicesPage() {
  const router = useRouter();
  const toast = useToast();
  const { invoices, contractors, setDraft, deleteInvoice, company, ksef } = useAppStore();

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | EffectiveStatus>("all");
  const [typeFilter, setTypeFilter] = React.useState<"all" | InvoiceType>("all");
  const [currencyFilter, setCurrencyFilter] = React.useState<"all" | "PLN" | "EUR" | "USD">("all");
  const [toDelete, setToDelete] = React.useState<string | null>(null);
  const [confirmKsef, setConfirmKsef] = React.useState<string | null>(null);
  const [sendingKsef, setSendingKsef] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...invoices]
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
      .filter((inv) => {
        if (typeFilter !== "all" && inv.type !== typeFilter) return false;
        if (currencyFilter !== "all" && inv.currency !== currencyFilter) return false;
        const s = effectiveStatus(inv);
        if (statusFilter !== "all" && s !== statusFilter) return false;
        if (q) {
          const ctr = getContractor(contractors, inv.contractorId)?.name ?? "";
          const hay = `${inv.number} ${ctr} ${inv.contractorId} ${inv.notes ?? ""} ${inv.ksef?.number ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [invoices, contractors, search, statusFilter, typeFilter, currencyFilter]);

  const hasFilters = search.trim() !== "" || statusFilter !== "all" || typeFilter !== "all" || currencyFilter !== "all";

  const editInvoice = (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;
    setDraft({ ...inv }, false);
    router.push("/invoices/new");
  };

  const duplicateInvoice = (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;
    const copy: Invoice = {
      ...inv,
      number: "",
      status: "draft",
      ksef: undefined,
      createdAt: new Date().toISOString(),
    };
    delete (copy as Partial<Invoice>).id;
    setDraft(copy, true);
    router.push("/invoices/new");
    toast("info", "Duplikat utworzony", "Wypełnij dane i zapisz jako nową fakturę.");
  };

  const sendToKsef = async (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;

    setSendingKsef(true);
    try {
      const state = useAppStore.getState();
      const ctr = getContractor(state.contractors, inv.contractorId);
      const xml = buildFa3Xml({
        invoice: inv,
        seller: state.company ?? EMPTY_COMPANY,
        buyer: ctr,
      });

      const currentEnv = state.ksef?.environment ?? "demo";

      const res = await fetch("/api/ksef/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xml,
          environment: currentEnv,
          invoiceId: inv.id,
          invoiceNumber: inv.number,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.ksefNumber) {
        if (data.invoice) {
          useAppStore.getState().applyInvoice(data.invoice);
        } else {
          useAppStore.getState().setInvoiceKsef(id, {
            number: data.ksefNumber,
            status: data.status ?? "ACTIVE",
            sentAt: data.timestamp ?? new Date().toISOString(),
            environment: currentEnv,
          });
        }
        toast("success", "Faktura wysłana do KSeF (FA(3))!", `${inv.number} → ${data.ksefNumber}`);
      } else {
        toast("error", "KSeF: odrzucono dokument", data.message ?? "Błąd API KSeF.");
      }
    } catch {
      toast("error", "Błąd sieci", "Nie udało się połączyć z bramką KSeF.");
    } finally {
      setSendingKsef(false);
      setConfirmKsef(null);
    }
  };

  const [syncingIncoming, setSyncingIncoming] = React.useState(false);
  const syncIncomingInvoices = async () => {
    setSyncingIncoming(true);
    try {
      const res = await fetch("/api/ksef/sync-incoming", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast("error", "Nie udało się pobrać faktur z KSeF", data.error ?? data.message ?? "Błąd API KSeF.");
        return;
      }

      await useAppStore.getState().revalidate();
      const count = data.importedCount ?? 0;
      toast("success", "Synchronizacja KSeF zakończona", `Pobrano i zaimportowano ${count} faktur zakupowych z KSeF.`);
    } catch {
      toast("error", "Błąd sieci", "Nie udało się pobrać faktur zakupowych z KSeF.");
    } finally {
      setSyncingIncoming(false);
    }
  };

  const handleDownloadUpo = (ksefNumber: string) => {
    window.open(`/api/ksef/invoices/download/${encodeURIComponent(ksefNumber)}?format=upo`, "_blank");
  };

  const selectedForKsef = invoices.find((i) => i.id === confirmKsef);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faktury"
        description="Zarządzaj fakturami sprzedaży (FV) oraz zakupów (FZ) zintegrowanymi z KSeF 2.0."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="subtle"
              onClick={syncIncomingInvoices}
              loading={syncingIncoming}
              className="rounded-xl gap-2 text-xs"
              title="Pobierz faktury zakupowe z KSeF"
            >
              {!syncingIncoming && <CloudDownload className="h-4 w-4 text-primary" />}
              {syncingIncoming ? "Pobieranie z KSeF..." : "Pobierz z KSeF (FZ)"}
            </Button>
            <Button onClick={() => router.push("/invoices/new")} className="rounded-xl gap-2 font-semibold shadow-xs">
              <Plus className="h-4 w-4" /> Wystaw fakturę
            </Button>
          </div>
        }
      />

      {/* Pasek filtrów */}
      <div className="rounded-2xl border border-border/70 bg-card/70 p-3.5 backdrop-blur-xl shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj: numer, kontrahent, NIP, numer KSeF…"
              className="pl-9.5 h-10 rounded-xl text-xs"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | EffectiveStatus)}
            className="w-auto min-w-[170px] h-10 rounded-xl text-xs"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | InvoiceType)}
            className="w-auto h-10 rounded-xl text-xs"
          >
            <option value="all">Wszystkie typy</option>
            <option value="sale">Sprzedaż (FV)</option>
            <option value="purchase">Zakup (FZ)</option>
          </Select>
          <Select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value as "all" | "PLN" | "EUR" | "USD")}
            className="w-auto h-10 rounded-xl text-xs"
          >
            <option value="all">Waluta (wszystkie)</option>
            <option value="PLN">PLN</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setTypeFilter("all");
                setCurrencyFilter("all");
              }}
              className="rounded-xl text-xs gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Wyczyść
            </Button>
          )}
        </div>
      </div>

      {/* Główna tabela dokumentów */}
      <div className="rounded-3xl border border-border/70 bg-card/70 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-primary" />
            Liczba pozycji: <b className="text-foreground">{filtered.length}</b>
          </span>
          <span className="hidden items-center gap-1.5 sm:flex font-mono text-[11px]">
            <ArrowDownUp className="h-3 w-3" /> Data wystawienia (malejąco)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead>
              <tr className="border-b border-border/70 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/20">
                <th className="py-3 px-4">Numer dokumentu</th>
                <th className="py-3 px-3">Kontrahent</th>
                <th className="py-3 px-3">Data wystawienia</th>
                <th className="py-3 px-3">Termin</th>
                <th className="py-3 px-3 text-right">Wartość brutto</th>
                <th className="py-3 px-3">Status płatności</th>
                <th className="py-3 px-3">Status KSeF</th>
                <th className="py-3 px-4 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <AnimatePresence initial={false}>
                {filtered.map((inv) => {
                  const ctr = getContractor(contractors, inv.contractorId);
                  const s = effectiveStatus(inv);
                  const ksefNum = inv.ksef?.number || inv.ksefNumber;
                  const isKsefActive = inv.ksef?.status === "ACTIVE" || inv.status === "ksef_active";

                  return (
                    <motion.tr
                      key={inv.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="py-3.5 px-4">
                        <Link href={`/invoices/${inv.id}`} className="group flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-bold text-[13px] text-foreground group-hover:text-primary transition-colors">
                              {inv.number}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {inv.type === "sale" ? "FV Sprzedaż" : "FZ Zakup"} · {inv.currency}
                            </p>
                          </div>
                        </Link>
                      </td>

                      <td className="py-3.5 px-3">
                        <p className="font-medium text-foreground max-w-[200px] truncate">{ctr?.name || "Klient detaliczny"}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{ctr?.nip || ""}</p>
                      </td>

                      <td className="py-3.5 px-3 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="py-3.5 px-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>

                      <td className="py-3.5 px-3 text-right font-bold tabular-nums text-foreground text-[13px]">
                        {formatMoney(
                          inv.type === "purchase" && inv.ksef && typeof inv.totalGross === "number"
                            ? inv.totalGross
                            : invoiceTotals(inv).gross,
                          inv.currency
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <Badge className={`${STATUS_META[s].color} rounded-lg px-2.5 py-0.5 text-[10.5px]`}>
                          <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${STATUS_META[s].dot}`} />
                          {STATUS_META[s].label}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-3">
                        {ksefNum ? (
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                            <div className="min-w-0">
                              <span className="block font-mono text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[130px]" title={ksefNum}>
                                {ksefNum}
                              </span>
                              <span className="text-[10px] text-muted-foreground uppercase">
                                {isKsefActive ? "Zarejestrowana" : "Wysłana"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-[11px]">— nie wysłano —</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {ksefNum && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadUpo(ksefNum)}
                              title="Pobierz UPO (Urzędowe Poświadczenie Odbioru)"
                              className="h-8 w-8 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {!ksefNum && inv.type === "sale" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirmKsef(inv.id)}
                              title="Wyślij do KSeF (FA(3))"
                              className="h-8 w-8 rounded-lg text-primary hover:bg-primary/10"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => editInvoice(inv.id)}
                            title="Edytuj"
                            className="h-8 w-8 rounded-lg"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => duplicateInvoice(inv.id)}
                            title="Duplikuj"
                            className="h-8 w-8 rounded-lg"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setToDelete(inv.id)}
                            title="Usuń"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-16 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <FileText className="h-6 w-6" />
              </div>
              <p className="text-[14px] font-semibold text-foreground">Brak faktur spełniających kryteria</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Wystaw nową e-Fakturę lub zmień ustawienia filtrów wyszukiwania.
              </p>
              <Button size="sm" onClick={() => router.push("/invoices/new")} className="rounded-xl gap-1.5">
                <Plus className="h-4 w-4" /> Wystaw fakturę
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            void deleteInvoice(toDelete)
              .then(() => toast("success", "Usunięto fakturę"))
              .catch((e: Error) => toast("error", "Nie udało się usunąć", e.message));
          }
        }}
        title="Usunąć fakturę?"
        description="Dokument zostanie trwale usunięty z bazy danych."
      />

      <ConfirmDialog
        open={!!confirmKsef}
        onClose={() => setConfirmKsef(null)}
        onConfirm={() => confirmKsef && sendToKsef(confirmKsef)}
        title="Wysyłka e-Faktury do KSeF"
        description={`Faktura ${selectedForKsef?.number || ""} zostanie przetłumaczona do oficjalnego formatu FA(3), zaszyfrowana (AES-256-CBC) i przesłana do KSeF (${ksef?.environment ?? "demo"}).`}
        confirmLabel={sendingKsef ? "Wysyłanie..." : "Wyślij e-Fakturę"}
        danger={false}
      />
    </div>
  );
}
