"use client";
import { csvCell } from "@/lib/accountant-summary";
import { useInvoiceSearch } from "@/lib/use-invoice-search";

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
  Mail,
  Pencil,
  Plus,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  X,
  Check,
  CheckCircle2,
  Clock,
  FileCheck2,
  Repeat,
} from "lucide-react";
import { useAppStore, effectiveStatus, STATUS_META, getContractor } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { SavedInvoiceViews } from "@/components/saved-invoice-views";
import { PageHeader } from "@/components/page-header";
import { buildFa3Xml } from "@/lib/ksef/xmlBuilder";
import { SendInvoiceEmailModal } from "@/components/invoice/send-invoice-email-modal";
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
  const { contractors, setDraft, deleteInvoice, company, ksef, approveInvoices } = useAppStore();
  const [showUnassigned, setShowUnassigned] = React.useState(false);

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | EffectiveStatus>("all");
  const [typeFilter, setTypeFilter] = React.useState<"all" | "sale" | "purchase" | "proforma">("all");
  const [approvalFilter, setApprovalFilter] = React.useState<"all" | "pending" | "approved">("all");
  const [currencyFilter, setCurrencyFilter] = React.useState<"all" | "PLN" | "EUR" | "USD">("all");
  const [toDelete, setToDelete] = React.useState<string | null>(null);
  const [confirmKsef, setConfirmKsef] = React.useState<string | null>(null);
  const [sendingKsef, setSendingKsef] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [approving, setApproving] = React.useState(false);
  const [selectedForEmail, setSelectedForEmail] = React.useState<Invoice | null>(null);

  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  React.useEffect(() => {
    setShowUnassigned(false); setSelectedIds([]); setToDelete(null); setConfirmKsef(null); setSelectedForEmail(null);
  }, [selectedCompanyId]);

  const results = useInvoiceSearch({ companyId: showUnassigned || !selectedCompanyId ? "unassigned" : selectedCompanyId, search, status: statusFilter, type: typeFilter, approval: approvalFilter, currency: currencyFilter });
  const invoices = results.invoices, filtered = invoices;
  React.useEffect(() => { setSelectedIds([]); }, [results.key]);

  const hasFilters = search.trim() !== "" || statusFilter !== "all" || typeFilter !== "all" || approvalFilter !== "all" || currencyFilter !== "all";

  const handleBulkApprove = async (status: "approved" | "pending" = "approved") => {
    if (selectedIds.length === 0) return;
    setApproving(true);
    try {
      await approveInvoices(selectedIds.filter((id) => invoices.some((i) => i.id === id && i.type === "purchase")), status);
      toast(
        "success",
        status === "approved" ? "Zaakceptowano zaznaczone faktury" : "Cofnięto akceptację",
        `Zaktualizowano ${selectedIds.length} dokumentów.`
      );
      setSelectedIds([]);
    } catch (e) {
      toast("error", "Błąd", e instanceof Error ? e.message : undefined);
    } finally {
      setApproving(false);
    }
  };

  const handleSingleApprove = async (id: string, status: "approved" | "pending") => {
    try {
      await approveInvoices([id], status);
      toast("success", status === "approved" ? "Faktura zaakceptowana dla księgowości" : "Cofnięto akceptację");
    } catch (e) {
      toast("error", "Błąd", e instanceof Error ? e.message : undefined);
    }
  };

  const [bulkSendingKsef, setBulkSendingKsef] = React.useState(false);

  const handleBulkSendKsef = async () => {
    const eligible = invoices.filter(
      (i) => selectedIds.includes(i.id) && i.type === "sale" && !i.isProforma && !i.ksefNumber && !i.ksef?.number
    );
    if (eligible.length === 0) {
      toast("info", "Brak faktur do wysłania", "Zaznaczone faktury są już zarejestrowane w KSeF, są proformami lub fakturami zakupowymi.");
      return;
    }

    setBulkSendingKsef(true);
    let successCount = 0;
    let failCount = 0;

    const state = useAppStore.getState();
    const currentEnv = state.ksef?.environment ?? "demo";

    for (const inv of eligible) {
      try {
        const ctr = getContractor(state.contractors, inv.contractorId);
        const xml = buildFa3Xml({
          invoice: inv,
          seller: state.company ?? EMPTY_COMPANY,
          buyer: ctr,
        });

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
            useAppStore.getState().setInvoiceKsef(inv.id, {
              number: data.ksefNumber,
              status: data.status ?? "ACTIVE",
              sentAt: data.timestamp ?? new Date().toISOString(),
              environment: currentEnv,
            });
          }
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setBulkSendingKsef(false);
    if (successCount > 0) {
      toast("success", "Zbiorcza wysyłka KSeF zakończona", `Pomyślnie wysłano ${successCount} faktur${failCount > 0 ? `, ${failCount} z błędami` : ""}.`);
    } else {
      toast("error", "Błąd wysyłki KSeF", "Nie udało się przesłać zaznaczonych dokumentów do bramki KSeF.");
    }
    setSelectedIds([]); results.reload();
  };

  const handleBulkExportCsv = () => {
    const selectedInvoices = invoices.filter((i) => selectedIds.includes(i.id));
    if (selectedInvoices.length === 0) return;

    const headers = [
      "Typ",
      "Numer",
      "Data wystawienia",
      "Termin platnosci",
      "Kontrahent",
      "NIP",
      "Waluta",
      "Wartosc Netto",
      "Wartosc VAT",
      "Wartosc Brutto",
      "Status platnosci",
      "Numer KSeF",
    ];

    const rows = selectedInvoices.map((inv) => {
      const ctr = getContractor(contractors, inv.contractorId);
      const t = invoiceTotals(inv);
      return [
        inv.isProforma ? "Proforma" : inv.type === "purchase" ? "Zakup" : "Sprzedaz",
        inv.number,
        inv.issueDate,
        inv.dueDate,
        ctr?.name || "",
        ctr?.nip || "",
        inv.currency,
        (inv.totalNet ?? t.net).toFixed(2),
        (inv.totalVat ?? t.vat).toFixed(2),
        (inv.totalGross ?? t.gross).toFixed(2),
        inv.paymentStatus === "paid" || inv.status === "paid" ? "Oplacona" : "Nieoplacona",
        inv.ksefNumber || inv.ksef?.number || "",
      ].map(csvCell).join(";");
    });

    const csv = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Faktury_Eksport_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast("success", "Wyeksportowano faktury", `Pobrano zestawienie CSV z ${selectedInvoices.length} dokumentami.`);
  };

  const handleBulkMarkPaid = async () => {
    const selectedInvoices = invoices.filter(
      (i) => selectedIds.includes(i.id) && i.type === "sale" && i.status !== "paid"
    );
    if (selectedInvoices.length === 0) {
      toast("info", "Brak faktur do oznaczenia", "Wszystkie zaznaczone faktury sprzedaży są już opłacone.");
      return;
    }

    for (const inv of selectedInvoices) {
      try {
        await useAppStore.getState().updateInvoice(inv.id, { status: "paid" });
      } catch {}
    }
    toast("success", "Oznaczono jako opłacone", `Zaktualizowano status ${selectedInvoices.length} dokumentów.`);
    setSelectedIds([]); results.reload();
  };

  const editInvoice = (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv || inv.type === "purchase") return;
    if (inv.ksefNumber || inv.ksef?.number) {
      toast("info", "Faktura zarejestrowana w KSeF", "Dokument posiada status KSeF — edycja pól fiskalnych jest zablokowana.");
    }
    setDraft({ ...inv }, false);
    router.push("/invoices/new");
  };

  const duplicateInvoice = (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv || inv.type === "purchase") return;
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

  const handleConvertProformaToVat = (proforma: Invoice) => {
    const copy: Invoice = {
      ...proforma,
      number: "",
      type: "sale",
      isProforma: false,
      status: "draft",
      notes: proforma.notes
        ? `${proforma.notes}\nWystawiono na podstawie proformy ${proforma.number}`
        : `Wystawiono na podstawie proformy ${proforma.number}`,
      issueDate: new Date().toISOString().slice(0, 10),
      saleDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + (proforma.paymentTermDays || 14) * 86400000).toISOString().slice(0, 10),
      ksef: undefined,
      ksefNumber: null,
      createdAt: new Date().toISOString(),
    };
    delete (copy as Partial<Invoice>).id;
    setDraft(copy, false);
    router.push("/invoices/new");
    toast("info", "Konwersja proformy", `Tworzenie faktury VAT na podstawie proformy ${proforma.number}.`);
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
      const res = await fetch("/api/ksef/sync-incoming?companyId=" + encodeURIComponent(useAppStore.getState().selectedCompanyId || ""), { method: "POST" });
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
      <div className="flex flex-wrap items-center gap-2" aria-label="Stronicowanie faktur">
        <Button variant="subtle" disabled={results.page === 1 || results.loading} onClick={results.previous}>Poprzednia</Button>
        <span role="status" className="text-sm">Strona {results.page} · {results.total} wyników{results.loading ? " · Ładowanie…" : ""}</span>
        <Button variant="subtle" disabled={!results.nextCursor || results.loading} onClick={results.next}>Następna</Button>
        <Button variant="subtle" onClick={results.first}>Pierwsza strona</Button>
      </div>
      {results.error && <div role="alert" className="text-destructive">{results.error} <Button onClick={results.reload}>Spróbuj ponownie</Button></div>}
      <SavedInvoiceViews companyId={selectedCompanyId} filters={{ search, statusFilter, typeFilter, approvalFilter, currencyFilter }} apply={f => {
        setSearch(typeof f.search === "string" ? f.search : "");
        if (["all", "sale", "purchase", "proforma"].includes(f.typeFilter)) setTypeFilter(f.typeFilter as typeof typeFilter);
        if (["all", "pending", "approved"].includes(f.approvalFilter)) setApprovalFilter(f.approvalFilter as typeof approvalFilter);
        if (["all", "PLN", "EUR", "USD"].includes(f.currencyFilter)) setCurrencyFilter(f.currencyFilter as typeof currencyFilter);
        if (["all", "draft", "issued", "paid", "overdue", "ksef_queued", "ksef_sent", "ksef_active", "ksef_rejected"].includes(f.statusFilter)) setStatusFilter(f.statusFilter as typeof statusFilter);
        setSelectedIds([]);
      }} />
      <PageHeader
        title="Faktury"
        description="Zarządzaj fakturami sprzedaży (FV) oraz zakupów (FZ) zintegrowanymi z KSeF 2.0."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {<Button variant="subtle" onClick={() => setShowUnassigned((v) => !v)}>{showUnassigned ? "Faktury wybranej firmy" : "Faktury bez przypisanej firmy"}</Button>}
            <Link href="/invoices/recurring">
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs border-border/70">
                <Repeat className="h-3.5 w-3.5 text-purple-400" />
                <span>Cykliczne (MRR)</span>
              </Button>
            </Link>
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

      {/* ── Nowoczesne, profesjonalne zakładki kategorii dokumentów ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-border/70 pb-3.5">
          {/* Główne zakładki typów faktur */}
          <div className="inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-muted/40 border border-border/70 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setTypeFilter("all");
                setApprovalFilter("all");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                typeFilter === "all"
                  ? "bg-background text-foreground shadow-xs ring-1 ring-border/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Wszystkie dokumenty</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                typeFilter === "all" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {results.counts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTypeFilter("sale");
                setApprovalFilter("all");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                typeFilter === "sale"
                  ? "bg-background text-primary shadow-xs ring-1 ring-border/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <FileCheck2 className="h-3.5 w-3.5 text-primary" />
              <span>Sprzedaż (FV)</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                typeFilter === "sale" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {results.counts.sale}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTypeFilter("purchase")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                typeFilter === "purchase"
                  ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-border/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <CloudDownload className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Wydatki / Zakupy (FZ)</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                typeFilter === "purchase" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {results.counts.purchase}
              </span>
              {(results.counts.purchase > results.counts.approved) && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              )}
            </button>

            {/* Zakładka Proformy */}
            <button
              type="button"
              onClick={() => {
                setTypeFilter("proforma");
                setApprovalFilter("all");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                typeFilter === "proforma"
                  ? "bg-background text-amber-500 shadow-xs ring-1 ring-border/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-amber-500" />
              <span>Proformy</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                typeFilter === "proforma" ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {results.counts.proforma}
              </span>
            </button>
          </div>

          {/* Pod-zakładki akceptacji księgowej dla FZ */}
          {typeFilter === "purchase" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-muted/30 border border-border/60 shadow-2xs"
            >
              <span className="text-[11px] font-semibold text-muted-foreground px-2 uppercase tracking-wider">
                Status księgowy:
              </span>
              <button
                type="button"
                onClick={() => setApprovalFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  approvalFilter === "all"
                    ? "bg-background text-foreground shadow-xs ring-1 ring-border/80"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                Wszystkie ({results.counts.purchase})
              </button>
              <button
                type="button"
                onClick={() => setApprovalFilter("pending")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  approvalFilter === "pending"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 shadow-xs ring-1 ring-amber-500/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span>Do akceptacji</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  {(results.counts.purchase - results.counts.approved)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setApprovalFilter("approved")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  approvalFilter === "approved"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Zaakceptowane</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  {results.counts.approved}
                </span>
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Pasek masowych operacji */}
      {selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3 px-4 shadow-sm"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <span>
              Zaznaczono: <b>{selectedIds.length}</b> z {filtered.length} dokumentów
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Wyślij do KSeF dla sprzedaży */}
            {invoices.some((i) => selectedIds.includes(i.id) && i.type === "sale" && !i.isProforma && !i.ksefNumber && !i.ksef?.number) && (
              <Button
                size="sm"
                onClick={handleBulkSendKsef}
                loading={bulkSendingKsef}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs gap-1.5 h-8 font-semibold shadow-xs"
                title="Prześlij zaznaczone faktury sprzedaży do KSeF"
              >
                <Send className="h-3.5 w-3.5" /> Wyślij do KSeF
              </Button>
            )}

            {/* Eksport CSV */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkExportCsv}
              className="rounded-xl text-xs h-8 gap-1.5 font-medium shadow-2xs"
              title="Pobierz zestawienie zaznaczonych dokumentów w formacie CSV"
            >
              <Download className="h-3.5 w-3.5" /> Eksport CSV
            </Button>

            {/* Oznacz jako opłacone */}
            {invoices.some((i) => selectedIds.includes(i.id) && i.type === "sale" && i.status !== "paid") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkMarkPaid}
                className="rounded-xl text-xs h-8 gap-1.5 font-medium text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 shadow-2xs"
                title="Oznacz zaznaczone faktury jako opłacone"
              >
                <Check className="h-3.5 w-3.5" /> Oznacz opłacone
              </Button>
            )}

            {/* Akceptacja dla księgowości (faktury zakupowe) */}
            {invoices.some((i) => selectedIds.includes(i.id) && i.type === "purchase") && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleBulkApprove("approved")}
                  loading={approving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs gap-1.5 h-8 font-semibold shadow-xs"
                >
                  <Check className="h-3.5 w-3.5" /> Akceptuj FZ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkApprove("pending")}
                  loading={approving}
                  className="rounded-xl text-xs h-8 text-muted-foreground hover:text-foreground"
                >
                  Cofnij akceptację
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="rounded-xl text-xs h-8 text-muted-foreground hover:text-foreground"
            >
              Odznacz
            </Button>
          </div>
        </motion.div>
      )}

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
                setApprovalFilter("all");
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
            Wyniki: <b className="text-foreground">{results.total}</b> · na stronie {filtered.length}
          </span>
          <span className="hidden items-center gap-1.5 sm:flex font-mono text-[11px]">
            <ArrowDownUp className="h-3 w-3" /> Data wystawienia (malejąco)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead>
              <tr className="border-b border-border/70 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/20">
                <th className="py-3 px-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(filtered.map((i) => i.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                </th>
                <th className="py-3 px-3">Numer dokumentu</th>
                <th className="py-3 px-3">Kontrahent</th>
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3 text-right">Wartość brutto</th>
                <th className="py-3 px-3">Płatność</th>
                <th className="py-3 px-3">Status KSeF</th>
                <th className="py-3 px-3">Księgowość</th>
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
                  const isSelected = selectedIds.includes(inv.id);
                  const isApproved = inv.approvalStatus === "approved";

                  return (
                    <motion.tr
                      key={inv.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`transition-colors hover:bg-muted/30 ${isSelected ? "bg-primary/5" : ""}`}
                    >
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => [...prev, inv.id]);
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== inv.id));
                            }
                          }}
                          className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                      </td>

                      <td className="py-3.5 px-3">
                        <Link href={`/invoices/${inv.id}`} className="group flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-bold text-[13px] text-foreground group-hover:text-primary transition-colors">
                              {inv.number}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {inv.isProforma ? "PRO Proforma" : inv.type === "sale" ? "FV Sprzedaż" : "FZ Zakup"} · {inv.currency}
                            </p>
                          </div>
                        </Link>
                      </td>

                      <td className="py-3.5 px-3">
                        <p className="font-medium text-foreground max-w-[180px] truncate">{ctr?.name || "Klient detaliczny"}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{ctr?.nip || ""}</p>
                      </td>

                      <td className="py-3.5 px-3 text-muted-foreground">
                        <p>{formatDate(inv.issueDate)}</p>
                        <p className="text-[10.5px] opacity-75">termin: {formatDate(inv.dueDate)}</p>
                      </td>

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
                              <span className="block font-mono text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[120px]" title={ksefNum}>
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

                      {/* Status akceptacji księgowej (na wzór wFirma — Screen 4) */}
                      <td className="py-3.5 px-3">
                        {inv.type === "purchase" ? (
                          isApproved ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                              title="Faktura zatwierdzona do księgowości"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Zaakceptowana
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                              title="Wersja robocza — oczekuje na ręczne zatwierdzenie"
                            >
                              <Clock className="h-3.5 w-3.5 text-amber-500" /> Do akceptacji
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground/40 text-[11px]">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Przycisk akceptacji dla faktur zakupowych (dokładnie jak na screen 4) */}
                          {inv.type === "purchase" && !isApproved && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSingleApprove(inv.id, "approved")}
                              title="Zatwierdź dla księgowości"
                              className="h-8 px-2.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10 gap-1 rounded-xl font-medium"
                            >
                              <Check className="h-3 w-3" /> Akceptuj
                            </Button>
                          )}

                          {inv.type === "purchase" && isApproved && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSingleApprove(inv.id, "pending")}
                              title="Cofnij zatwierdzenie"
                              className="h-8 px-2 text-[11px] text-muted-foreground hover:text-foreground rounded-lg"
                            >
                              Cofnij
                            </Button>
                          )}

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

                          {/* Konwersja proformy na fakturę VAT */}
                          {inv.isProforma && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConvertProformaToVat(inv)}
                              title="Wystaw Fakturę VAT na podstawie proformy"
                              className="h-8 px-2 text-xs text-amber-500 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/10 gap-1 rounded-xl font-medium"
                            >
                              <FileCheck2 className="h-3.5 w-3.5" />
                              <span>Wystaw VAT</span>
                            </Button>
                          )}

                          {!ksefNum && inv.type === "sale" && !inv.isProforma && (
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
                            onClick={() => setSelectedForEmail(inv)}
                            title="Wyślij fakturę e-mailem"
                            className="h-8 w-8 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </Button>

                          {inv.type !== "purchase" && (<Button
                            variant="ghost"
                            size="icon"
                            onClick={() => editInvoice(inv.id)}
                            title="Edytuj"
                            className="h-8 w-8 rounded-lg"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>)}

                          {inv.type !== "purchase" && (<Button
                            variant="ghost"
                            size="icon"
                            onClick={() => duplicateInvoice(inv.id)}
                            title="Duplikuj"
                            className="h-8 w-8 rounded-lg"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>)}

                          {inv.type !== "purchase" && (<Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setToDelete(inv.id)}
                            title="Usuń"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>)}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>

          {!results.loading && !results.error && filtered.length === 0 && (
            <EmptyState
              icon={FileText}
              title="Brak faktur spełniających kryteria"
              description="Wystaw nową e-Fakturę lub zmień ustawienia filtrów wyszukiwania dokumentów."
              action={
                <Button size="sm" onClick={() => router.push("/invoices/new")} className="rounded-xl gap-1.5 font-medium shadow-xs">
                  <Plus className="h-4 w-4" /> Wystaw fakturę
                </Button>
              }
              className="py-14"
            />
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

      {selectedForEmail && (
        <SendInvoiceEmailModal
          open={Boolean(selectedForEmail)}
          onClose={() => setSelectedForEmail(null)}
          invoice={selectedForEmail}
          contractor={getContractor(contractors, selectedForEmail.contractorId)}
          company={
            (selectedForEmail.sellerCompanyId
              ? useAppStore.getState().companies.find((c) => c.id === selectedForEmail.sellerCompanyId)
              : null) ?? company ?? EMPTY_COMPANY
          }
          onSent={() => void useAppStore.getState().revalidate()}
        />
      )}
    </div>
  );
}

