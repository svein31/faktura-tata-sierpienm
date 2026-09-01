"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp,
  CloudDownload,
  Copy,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  Send,
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
import { InfoTooltip } from "@/components/ui/tooltip";
import { formatDate, formatMoney, invoiceTotals } from "@/lib/format";
import type { EffectiveStatus } from "@/lib/store";
import type { Invoice, InvoiceType } from "@/lib/types";
import { EMPTY_COMPANY } from "@/lib/types";

const STATUS_FILTERS: Array<{ value: "all" | EffectiveStatus; label: string }> = [
  { value: "all", label: "Wszystkie" },
  { value: "draft", label: "Szkice" },
  { value: "issued", label: "Wystawione" },
  { value: "ksef_sent", label: "Wysłane do KSeF" },
  { value: "ksef_active", label: "KSeF aktywne" },
  { value: "paid", label: "Opłacone" },
  { value: "overdue", label: "Przeterminowane" },
];

export default function InvoicesPage() {
  const router = useRouter();
  const toast = useToast();
  const { invoices, contractors, setDraft, deleteInvoice } = useAppStore();

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | EffectiveStatus>("all");
  const [typeFilter, setTypeFilter] = React.useState<"all" | InvoiceType>("all");
  const [currencyFilter, setCurrencyFilter] = React.useState<"all" | "PLN" | "EUR" | "USD">("all");
  const [toDelete, setToDelete] = React.useState<string | null>(null);
  const [confirmKsef, setConfirmKsef] = React.useState<string | null>(null);

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
          const hay = `${inv.number} ${ctr} ${inv.contractorId} ${inv.notes ?? ""}`.toLowerCase();
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
    const { buildFaVatXml } = await import("@/lib/xml");
    const state = useAppStore.getState();
    const xml = buildFaVatXml(inv, state.company ?? EMPTY_COMPANY);
    const res = await fetch("/api/ksef/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        xml,
        environment: state.ksef?.environment ?? "demo",
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
          status: data.status ?? "SENT",
          sentAt: data.timestamp ?? new Date().toISOString(),
          environment: state.ksef?.environment ?? "demo",
        });
      }
      toast("success", "Wysłano do KSeF", `${inv.number} → ${data.ksefNumber}`);
    } else {
      toast("error", "KSeF: odrzucono", data.message ?? "Błąd API KSeF.");
    }
    setConfirmKsef(null);
  };

  const [syncingIncoming, setSyncingIncoming] = React.useState(false);
  const syncIncomingInvoices = async () => {
    setSyncingIncoming(true);
    try {
      const res = await fetch("/api/ksef/sync-incoming", { method: "POST" });
      const data = (await res.json()) as {
        success?: boolean;
        importedCount?: number;
        error?: string;
      };
      if (!res.ok || !data.success) {
        toast("error", "Nie udało się pobrać faktur z KSeF", data.error ?? "Błąd API KSeF.");
        return;
      }

      await useAppStore.getState().revalidate();
      const count = data.importedCount ?? 0;
      toast("success", "Synchronizacja KSeF zakończona", `Pobrano i zaimportowano ${count} nowych faktur zakupowych z KSeF.`);
    } catch {
      toast("error", "Błąd sieci", "Nie udało się pobrać faktur zakupowych z KSeF.");
    } finally {
      setSyncingIncoming(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Faktury"
        description="Lista dokumentów sprzedaży (FV) i zakupów (FZ) z filtrami i statusem KSeF."
        actions={
          <>
            <Button
              variant="subtle"
              onClick={syncIncomingInvoices}
              loading={syncingIncoming}
              title="Pobierz faktury zakupowe z KSeF"
              aria-label={syncingIncoming ? "Pobieranie faktur z KSeF" : "Pobierz faktury zakupowe z KSeF"}
            >
              {!syncingIncoming && <CloudDownload className="h-4 w-4" />}
              {syncingIncoming ? "Pobieranie faktur z KSeF..." : "Pobierz z KSeF (FZ)"}
            </Button>
            <Button onClick={() => router.push("/invoices/new")}>
              <Plus className="h-4 w-4" /> Nowa faktura
            </Button>
          </>
        }
      />

      {/* Filtry */}
      <div className="mb-4 rounded-2xl border border-border/60 bg-card/70 p-3 backdrop-blur-md shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj: numer, kontrahent, NIP…"
              className="pl-9 h-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | EffectiveStatus)}
            className="w-auto min-w-[150px] h-9"
            aria-label="Filtr statusu"
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
            className="w-auto h-9"
            aria-label="Filtr typu"
          >
            <option value="all">Sprzedaż + zakup</option>
            <option value="sale">Sprzedaż (FV)</option>
            <option value="purchase">Zakup (FZ)</option>
          </Select>
          <Select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value as "all" | "PLN" | "EUR" | "USD")}
            className="w-auto h-9"
            aria-label="Filtr waluty"
          >
            <option value="all">Wszystkie waluty</option>
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
            >
              <X className="h-3.5 w-3.5" /> Wyczyść
            </Button>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-md shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            Znaleziono: <b className="text-foreground">{filtered.length}</b>{" "}
            {filtered.length === 1 ? "dokument" : "dokumentów"}
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <ArrowDownUp className="h-3 w-3" /> sortowanie: data wystawienia (malejąco)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Dokument</th>
                <th className="px-3 py-2.5">Kontrahent</th>
                <th className="px-3 py-2.5">Data wyst.</th>
                <th className="px-3 py-2.5">Termin</th>
                <th className="px-3 py-2.5 text-right">Wartość brutto</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-center">KSeF</th>
                <th className="px-3 py-2.5 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((inv) => {
                  const ctr = getContractor(contractors, inv.contractorId);
                  const s = effectiveStatus(inv);
                  return (
                    <motion.tr
                      key={inv.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="group flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold">{inv.number}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {inv.type === "sale" ? "FV" : "FZ"} · {inv.currency} ·{" "}
                              {inv.language === "PL" ? "PL" : "EN"}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <p className="max-w-[220px] truncate font-medium">{ctr?.name ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{ctr?.nip ?? ""}</p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">
                        {formatMoney(
                          inv.type === "purchase" && inv.ksef && typeof inv.totalGross === "number"
                            ? inv.totalGross
                            : invoiceTotals(inv).gross,
                          inv.currency
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge className={STATUS_META[s].color}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s].dot}`} />
                          {STATUS_META[s].label}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {inv.ksef ? (
                          <Badge tone="info" className="font-mono text-[10px]">
                            {inv.ksef.number}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" onClick={() => editInvoice(inv.id)} title="Edytuj">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => duplicateInvoice(inv.id)} title="Duplikuj">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {!inv.ksef && inv.type === "sale" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirmKsef(inv.id)}
                              title="Wyślij do KSeF (demo)"
                              className="text-accent"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setToDelete(inv.id)}
                            title="Usuń"
                            className="text-muted-foreground hover:text-red-500"
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
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="relative flex h-14 w-14 items-center justify-center">
                <div className="absolute inset-0 rounded-2xl bg-primary/8 blur-xl" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <FileText className="h-6 w-6" />
                </div>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-foreground">
                  {invoices.length === 0 ? "Brak wystawionych faktur" : "Brak faktur spełniających kryteria"}
                </p>
                <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground leading-relaxed">
                  {invoices.length === 0
                    ? "Wystaw pierwszy dokument sprzedaży w formacie FA(3) z bezpośredną wysyłką do KSeF."
                    : "Zmień parametry wyszukiwania lub filtry statusu/waluty."}
                </p>
              </div>
              <Button size="sm" onClick={() => router.push("/invoices/new")} className="mt-2 gap-1.5 rounded-xl">
                <Plus className="h-3.5 w-3.5" /> Wystaw pierwszą fakturę
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
        description="Dokument zostanie trwale usunięty z systemu."
      />
      <ConfirmDialog
        open={!!confirmKsef}
        onClose={() => setConfirmKsef(null)}
        onConfirm={() => confirmKsef && sendToKsef(confirmKsef)}
        title="Wysłać fakturę do KSeF?"
        description="Dokument w formacie FA(3) zostanie zaszyfrowany (AES-256-CBC) i przesłany do serwerów Ministerstwa Finansów."
        confirmLabel="Wyślij do KSeF"
        danger={false}
      />
    </div>
  );
}
