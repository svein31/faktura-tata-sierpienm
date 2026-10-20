"use client";
import { useInvoiceView } from "@/lib/use-invoice-view";
import { useInvoiceColumns } from "@/lib/use-invoice-columns";
import { useInvoicePreview } from "@/lib/use-invoice-preview";
import { INVOICE_COLUMNS, type InvoiceColumnId } from "@/lib/invoice-columns";
import { invoiceSelectionTotals } from "@/lib/invoice-selection-totals";
import { InvoiceColumnsMenu } from "@/components/invoice/invoice-columns-menu";
import { InvoiceSelectionSummary } from "@/components/invoice/invoice-selection-summary";
import { isKsefUiPending, ksefPresentation } from "@/lib/ksef/presentation";
import { KsefStatusBadge } from "@/components/invoice/ksef-status-badge";
import { invoicePaymentPresentation } from "@/lib/invoice-payment-presentation";
import { csvCell } from "@/lib/accountant-summary";
import { useInvoiceSearch } from "@/lib/use-invoice-search";
import type { InitialInvoiceSearch } from "@/lib/use-invoice-search";

import * as React from "react";
import { useKsefStatusPolling } from "@/lib/use-ksef-status-polling";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  CloudDownload,
  Copy,
  Download,
  FileText,
  FilePenLine,
  Filter,
  Mail,
  Pencil,
  Plus,
  Search,
  Send,
  Shield,
  Trash2,
  X,
  Check,
  CheckCircle2,
  Clock,
  FileCheck2,
  Repeat,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { useAppStore, getContractor } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { LoadingReveal } from "@/components/ui/loading-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreatedInvoiceHighlight } from "@/components/invoice/invoice-created-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { formatDate, formatMoney, invoiceTotals } from "@/lib/format";
import type { EffectiveStatus } from "@/lib/store";
import type { Invoice, InvoiceType } from "@/lib/types";
import { EMPTY_COMPANY } from "@/lib/types";
import { isCorrectableInvoiceSource } from "@/lib/invoice-correction-eligibility";

// These panels are not needed to display the invoice list. Keep their modules
// (including dialog animations and email delivery UI) out of its initial load.
const EmptyState = React.lazy(() => import("@/components/ui/empty-state").then((module) => ({ default: module.EmptyState })));
const ConfirmDialog = React.lazy(() => import("@/components/ui/dialog").then((module) => ({ default: module.ConfirmDialog })));
const SavedInvoiceViews = React.lazy(() => import("@/components/saved-invoice-views").then((module) => ({ default: module.SavedInvoiceViews })));
const SendInvoiceEmailModal = React.lazy(() => import("@/components/invoice/send-invoice-email-modal").then((module) => ({ default: module.SendInvoiceEmailModal })));
const InvoiceQuickPreview = React.lazy(() => import("@/components/invoice/invoice-quick-preview").then((module) => ({ default: module.InvoiceQuickPreview })));

const STATUS_FILTERS: Array<{ value: "all" | EffectiveStatus; label: string }> = [
  { value: "all", label: "Wszystkie dokumenty" },
  { value: "ksef_active", label: "KSeF Zarejestrowane" },
  { value: "ksef_queued", label: "KSeF · w kolejce" },
  { value: "ksef_sent", label: "KSeF · wysłane / weryfikowane" },
  { value: "ksef_rejected", label: "KSeF · odrzucone" },
  { value: "issued", label: "Wystawione" },
  { value: "paid", label: "Opłacone" },
  { value: "overdue", label: "Przeterminowane" },
  { value: "draft", label: "Szkice" },
];

/** Mount actions on demand in a floating panel, outside the scrolling table. */
function InvoiceRowActions({ number, children }: { number: string; children: React.ReactNode }) {
  return <DropdownMenu label={`Działania dla faktury ${number}`} align="end" trigger={
    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Więcej działań dla faktury ${number}`} title="Więcej działań">
      <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
    </Button>
  }>{children}</DropdownMenu>;
}

function InvoiceRowsSkeleton() {
  return <div role="status" aria-label="Wczytywanie faktur" className="divide-y divide-border/50">
    {[0, 1, 2, 3].map(row => <div key={row} className="flex min-h-32 items-center justify-between gap-4 p-4 md:min-h-20">
      <div className="flex min-w-0 items-center gap-3"><Skeleton className="size-8 shrink-0 rounded-xl" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div>
      <Skeleton className="hidden h-4 w-36 lg:block" /><Skeleton className="h-5 w-20 rounded-md" /><Skeleton className="hidden h-9 w-24 rounded-xl md:block" />
    </div>)}
    <span className="sr-only">Wczytywanie faktur…</span>
  </div>;
}

export default function InvoicesClient({ initialSearch }: { initialSearch?: InitialInvoiceSearch }) {
  const router = useRouter();
  const toast = useToast();
  const contractors = useAppStore((state) => state.contractors);
  const setDraft = useAppStore((state) => state.setDraft);
  const deleteInvoice = useAppStore((state) => state.deleteInvoice);
  const company = useAppStore((state) => state.company);
  const ksefEnvironment = useAppStore((state) => state.ksef?.environment ?? "demo");
  const approveInvoices = useAppStore((state) => state.approveInvoices);
  const [showUnassigned, setShowUnassigned] = React.useState(false);
  const [savedViewsOpened, setSavedViewsOpened] = React.useState(false);

  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const { value: view, update: updateView } = useInvoiceView(showUnassigned ? null : selectedCompanyId);
  const columnSettings = useInvoiceColumns(showUnassigned ? null : selectedCompanyId);
  const activeColumns = INVOICE_COLUMNS.filter(column=>columnSettings.columns.includes(column.id));
  const { search, statusFilter, typeFilter, approvalFilter, currencyFilter, sortOrder, density } = view;
  const setSearch = (search: string) => updateView({ search });
  const setStatusFilter = (statusFilter: typeof view.statusFilter) => updateView({ statusFilter });
  const setTypeFilter = (typeFilter: typeof view.typeFilter) => updateView({ typeFilter });
  const setApprovalFilter = (approvalFilter: typeof view.approvalFilter) => updateView({ approvalFilter });
  const setCurrencyFilter = (currencyFilter: typeof view.currencyFilter) => updateView({ currencyFilter });
  const [toDelete, setToDelete] = React.useState<string | null>(null);
  const [confirmKsef, setConfirmKsef] = React.useState<string | null>(null);
  const [sendingKsef, setSendingKsef] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [approving, setApproving] = React.useState(false);
  const [markingPaid, setMarkingPaid] = React.useState(false);
  const [confirmBulkPayment, setConfirmBulkPayment] = React.useState(false);
  const [selectedForEmail, setSelectedForEmail] = React.useState<Invoice | null>(null);

  React.useEffect(() => {
    setShowUnassigned(false); setSelectedIds([]); setToDelete(null); setConfirmKsef(null); setSelectedForEmail(null);
  }, [selectedCompanyId]);

  const results = useInvoiceSearch({ companyId: showUnassigned || !selectedCompanyId ? "unassigned" : selectedCompanyId, search, status: statusFilter, type: typeFilter, approval: approvalFilter, currency: currencyFilter, ...(sortOrder === "date_asc" ? { sort: sortOrder } : {}) }, true, initialSearch);
  const invoices = results.invoices, filtered = invoices;
  const preview = useInvoicePreview(results,()=>toast("error","Dostęp do dokumentów wygasł","Odśwież listę, aby sprawdzić aktualne uprawnienia."));
  const previewInvoice = preview.invoice;
  const selectionTotals = React.useMemo(()=>invoiceSelectionTotals(invoices,selectedIds),[invoices,selectedIds]);
  const openPreview = (event: React.MouseEvent, invoice: Invoice) => {
    // Keep native link behavior for new tabs/windows and ordinary text selection.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || window.getSelection()?.toString()) return;
    event.preventDefault();
    preview.open(invoice);
  };
  const highlightedId = useCreatedInvoiceHighlight(showUnassigned ? null : selectedCompanyId, filtered.map(invoice => invoice.id));
  useKsefStatusPolling(invoices, results.reload);
  const permissions = company?.currentUserPermissions;
  const canSendKsef = !!selectedCompanyId && !showUnassigned && permissions?.canSendKsef === true;
  const canRecordPayments = !!selectedCompanyId && !showUnassigned && permissions?.canRecordPayments === true;
  const canApprove = !!selectedCompanyId && !showUnassigned && (company?.currentUserRole === "owner" || company?.currentUserRole === "accountant");
  const canCreateCorrections = !!selectedCompanyId && !showUnassigned && permissions?.canCreateCorrections === true;
  const createCorrection = (invoice: Invoice) => {
    setDraft(null, true);
    router.push(`/invoices/new?correctionFrom=${encodeURIComponent(invoice.id)}`);
  };
  const canExport = !!selectedCompanyId && !showUnassigned && permissions?.canExport === true;
  const payableSelected = invoices.filter(i => selectedIds.includes(i.id) && i.type === "sale" && !i.isProforma && i.status !== "draft" && i.documentStatus !== "draft" && i.status !== "paid" && i.paymentStatus !== "paid");
  React.useEffect(() => { setSelectedIds([]); }, [results.key]);

  const hasFilters = search.trim() !== "" || statusFilter !== "all" || typeFilter !== "all" || approvalFilter !== "all" || currencyFilter !== "all";
  const clearFilters = () => updateView({search: "", statusFilter: "all", typeFilter: "all", approvalFilter: "all", currencyFilter: "all"});

  const handleBulkApprove = async (status: "approved" | "pending" = "approved") => {
    if (selectedIds.length === 0) return;
    setApproving(true);
    try {
      const ids = selectedIds.filter((id) => invoices.some((i) => i.id === id && i.type === "purchase"));
      if (!ids.length) return;
      await approveInvoices(ids, status);
      toast(
        "success",
        status === "approved" ? "Zaakceptowano zaznaczone faktury" : "Cofnięto akceptację",
        `Zaktualizowano ${ids.length} dokumentów.`
      );
      setSelectedIds([]); results.reload();
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
      (i) => selectedIds.includes(i.id) && i.type === "sale" && i.status !== "draft" && !i.isProforma && !i.ksefNumber && !i.ksef?.number && !isKsefUiPending(i)
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
        const { buildFa3Xml } = await import("@/lib/ksef/xmlBuilder");
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
        if (res.ok && data.success) {
          if (data.invoice) {
            useAppStore.getState().applyInvoice(data.invoice);
          } else if (data.ksefNumber) {
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
    if (!canRecordPayments || !payableSelected.length) return;
    setMarkingPaid(true);
    try {
      const response = await fetch("/api/invoices/bulk/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: selectedCompanyId, invoices: payableSelected.map(invoice => ({ id: invoice.id, version: invoice.version ?? 1 })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nie udało się zarejestrować wpłat.");
      toast("success", "Wpłaty zarejestrowane", `Rozliczono ${data.count} faktur.`);
      setSelectedIds([]); results.reload(); void useAppStore.getState().revalidate();
    } catch (error) { toast("error", "Nie zarejestrowano wpłat", error instanceof Error ? error.message : undefined); }
    finally { setMarkingPaid(false); setConfirmBulkPayment(false); }
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
      const { buildFa3Xml } = await import("@/lib/ksef/xmlBuilder");
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
      {results.error && <div role="alert" className="text-destructive">{results.error} <Button onClick={results.reload}>Spróbuj ponownie</Button></div>}
      <PageHeader
        title="Faktury"
        description="Zarządzaj fakturami sprzedaży (FV) oraz zakupów (FZ) zintegrowanymi z KSeF 2.0."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {<Button variant="subtle" onClick={() => setShowUnassigned((v) => !v)}>{showUnassigned ? "Faktury wybranej firmy" : "Faktury bez przypisanej firmy"}</Button>}
            <Link prefetch={false} href="/invoices/recurring">
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs border-border/70">
                <Repeat className="h-3.5 w-3.5 text-primary" />
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
            <Button onClick={() => { setDraft(null, true); router.push("/invoices/new"); }} className="rounded-xl gap-2 font-semibold shadow-xs">
              <Plus className="h-4 w-4" /> Wystaw fakturę
            </Button>
          </div>
        }
      />

      <details className="rounded-xl border bg-card px-3 pt-2 text-xs" onToggle={(event) => { if (event.currentTarget.open) setSavedViewsOpened(true); }}><summary className="cursor-pointer pb-2 font-medium">Zapisane filtry</summary>{savedViewsOpened && <React.Suspense fallback={<p role="status" className="pb-2 text-muted-foreground">Ładowanie zapisanych filtrów…</p>}><SavedInvoiceViews companyId={showUnassigned ? null : selectedCompanyId} filters={{ search, statusFilter, typeFilter, approvalFilter, currencyFilter, sortOrder, density, columns: columnSettings.columns.join(",") }} apply={f => {
        setSearch(typeof f.search === "string" ? f.search : "");
        if (["all", "sale", "purchase", "proforma"].includes(f.typeFilter)) setTypeFilter(f.typeFilter as typeof typeFilter);
        if (["all", "pending", "approved"].includes(f.approvalFilter)) setApprovalFilter(f.approvalFilter as typeof approvalFilter);
        if (["all", "PLN", "EUR", "USD"].includes(f.currencyFilter)) setCurrencyFilter(f.currencyFilter as typeof currencyFilter);
        if (["all", "draft", "issued", "paid", "overdue", "ksef_queued", "ksef_sent", "ksef_active", "ksef_rejected"].includes(f.statusFilter)) setStatusFilter(f.statusFilter as typeof statusFilter);
        if (["date_desc", "date_asc"].includes(f.sortOrder)) updateView({sortOrder: f.sortOrder as typeof sortOrder});
        if (["comfortable", "compact"].includes(f.density)) updateView({density: f.density as typeof density});
        if (typeof f.columns === "string") columnSettings.update(f.columns ? f.columns.split(",") : []);
        setSelectedIds([]);
      }} /></React.Suspense>}</details>

      {/* ── Nowoczesne, profesjonalne zakładki kategorii dokumentów ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-border/70 pb-3.5">
          {/* Główne zakładki typów faktur */}
          <div className="inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-muted/40 border border-border/70 shadow-xs">
            <button
              type="button"
              aria-pressed={typeFilter === "all"}
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
              aria-pressed={typeFilter === "sale"}
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
              aria-pressed={typeFilter === "purchase"}
              onClick={() => setTypeFilter("purchase")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                typeFilter === "purchase"
                  ? "bg-background text-success dark:text-success shadow-xs ring-1 ring-border/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <CloudDownload className="h-3.5 w-3.5 text-success dark:text-success" />
              <span>Wydatki / Zakupy (FZ)</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                typeFilter === "purchase" ? "bg-muted text-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {results.counts.purchase}
              </span>
              {(results.counts.purchase > results.counts.approved) && (
                <span className="relative flex h-2 w-2">

                  <span className="relative inline-flex rounded-full h-2 w-2 bg-warning"></span>
                </span>
              )}
            </button>

            {/* Zakładka Proformy */}
            <button
              type="button"
              aria-pressed={typeFilter === "proforma"}
              onClick={() => {
                setTypeFilter("proforma");
                setApprovalFilter("all");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                typeFilter === "proforma"
                  ? "bg-background text-warning shadow-xs ring-1 ring-border/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-warning" />
              <span>Proformy</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                typeFilter === "proforma" ? "bg-muted text-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {results.counts.proforma}
              </span>
            </button>
          </div>

          {/* Pod-zakładki akceptacji księgowej dla FZ */}
          {typeFilter === "purchase" && (
            <div
              className="inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-muted/30 border border-border/60 shadow-2xs motion-safe:animate-fade-in"
            >
              <span className="text-[11px] font-semibold text-muted-foreground px-2 uppercase tracking-wider">
                Status księgowy:
              </span>
              <button
                type="button"
                aria-pressed={approvalFilter === "all"}
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
                aria-pressed={approvalFilter === "pending"}
                onClick={() => setApprovalFilter("pending")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  approvalFilter === "pending"
                    ? "bg-warning/15 text-warning dark:text-warning shadow-xs ring-1 ring-warning/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <Clock className="h-3.5 w-3.5 text-warning" />
                <span>Do akceptacji</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-warning/20 text-warning dark:text-warning">
                  {(results.counts.purchase - results.counts.approved)}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={approvalFilter === "approved"}
                onClick={() => setApprovalFilter("approved")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  approvalFilter === "approved"
                    ? "bg-success/15 text-success dark:text-success shadow-xs ring-1 ring-success/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span>Zaakceptowane</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-success/20 text-success dark:text-success">
                  {results.counts.approved}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pasek masowych operacji */}
      {selectionTotals.length > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 px-4 shadow-sm motion-safe:animate-slide-in-up"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <span>
              Zaznaczono: <b>{selectedIds.length}</b> z {filtered.length} dokumentów
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Wyślij do KSeF dla sprzedaży */}
            {canSendKsef && invoices.some((i) => selectedIds.includes(i.id) && i.type === "sale" && i.status !== "draft" && !i.isProforma && !i.ksefNumber && !i.ksef?.number && !isKsefUiPending(i)) && (
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
            {canExport && <Button
              variant="outline"
              size="sm"
              onClick={handleBulkExportCsv}
              className="rounded-xl text-xs h-8 gap-1.5 font-medium shadow-2xs"
              title="Pobierz zestawienie zaznaczonych dokumentów w formacie CSV"
            >
              <Download className="h-3.5 w-3.5" /> Eksport CSV
            </Button>}

            {/* Oznacz jako opłacone */}
            {canRecordPayments && payableSelected.length > 0 && payableSelected.length === selectedIds.length && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmBulkPayment(true)}
                loading={markingPaid}
                className="rounded-xl text-xs h-8 gap-1.5 font-medium text-success dark:text-success border-success/30 hover:bg-success/10 shadow-2xs"
                title="Oznacz zaznaczone faktury jako opłacone"
              >
                <Check className="h-3.5 w-3.5" /> Oznacz opłacone
              </Button>
            )}

            {/* Akceptacja dla księgowości (faktury zakupowe) */}
            {canApprove && invoices.some((i) => selectedIds.includes(i.id) && i.type === "purchase") && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleBulkApprove("approved")}
                  loading={approving}
                  className="bg-success hover:bg-success/90 text-success-foreground rounded-xl text-xs gap-1.5 h-8 font-semibold shadow-xs"
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
          <InvoiceSelectionSummary totals={selectionTotals} />
        </div>
      )}

      {/* Pasek filtrów */}
      <div className="rounded-xl border border-border/70 bg-card p-3.5  shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-0 basis-full xl:basis-auto xl:min-w-[240px] flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              aria-label="Szukaj faktur"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj: numer, kontrahent, NIP, numer KSeF…"
              className="pl-10 h-10 rounded-xl text-sm"
            />
          </div>
          <Select
            aria-label="Status dokumentu"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | EffectiveStatus)}
            className="w-full sm:w-[220px] h-10 rounded-xl text-sm"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Waluta faktury"
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value as "all" | "PLN" | "EUR" | "USD")}
            className="w-full sm:w-[160px] h-10 rounded-xl text-sm"
          >
            <option value="all">Waluta (wszystkie)</option>
            <option value="PLN">PLN</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </Select>
          <Select aria-label="Kolejność faktur" value={sortOrder} onChange={event => updateView({sortOrder: event.target.value as typeof sortOrder})} className="w-full sm:w-[200px]">
            <option value="date_desc">Najnowsze najpierw</option><option value="date_asc">Najstarsze najpierw</option>
          </Select>
          <Select aria-label="Gęstość tabeli" value={density} onChange={event => updateView({density: event.target.value as typeof density})} className="w-full sm:w-[180px]">
            <option value="comfortable">Widok wygodny</option><option value="compact">Widok kompaktowy</option>
          </Select>
          <InvoiceColumnsMenu columns={columnSettings.columns} toggle={columnSettings.toggle} reset={columnSettings.reset} />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="rounded-xl text-xs gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Wyczyść
            </Button>
          )}
        </div>
      </div>

      {/* Główna tabela dokumentów */}
      <div data-invoice-density={density} className="rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-primary" />
            Wyniki: <b className="text-foreground">{results.total}</b> · na stronie {filtered.length}
          </span>
          <span className="hidden items-center gap-1.5 sm:flex text-xs">
            <ArrowDownUp className="h-3 w-3" /> {sortOrder === "date_asc" ? "Najstarsze najpierw" : "Najnowsze najpierw"}
          </span>
        </div>

        <LoadingReveal key={results.key} loading={results.loading && filtered.length === 0 && !results.error} fallback={<InvoiceRowsSkeleton />}>
        <div className="divide-y divide-border/50 md:hidden">
          {filtered.map(inv => {
            const contractor = getContractor(contractors, inv.contractorId);
            const status = invoicePaymentPresentation(inv);
            return <article key={inv.id} data-invoice-id={inv.id} data-preview-active={previewInvoice?.id === inv.id || undefined} data-new-invoice={highlightedId === inv.id || undefined} className="ui-invoice-row p-4 space-y-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={`Zaznacz fakturę ${inv.number}`} checked={selectedIds.includes(inv.id)} onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, inv.id] : ids.filter(id => id !== inv.id))} className="mt-2 h-5 w-5 accent-primary" />
                <div className="min-w-0 flex-1">
                  <Link prefetch={false} href={`/invoices/${inv.id}`} onClick={event => openPreview(event, inv)} aria-haspopup="dialog" className="block min-h-11 font-semibold text-primary break-words py-1">{inv.number}</Link>
                  <p className="text-xs text-muted-foreground break-words">{contractor?.name || "Klient detaliczny"}</p>
                </div>
                <span className="shrink-0 text-xs font-medium">{inv.currency}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{formatDate(inv.issueDate)} · termin {formatDate(inv.dueDate)}</span>
                <strong className="text-sm tabular-nums text-foreground">{formatMoney(inv.totalGross ?? invoiceTotals(inv).gross, inv.currency)}</strong>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <KsefStatusBadge invoice={inv} />
                <Badge className={status.color}>{status.label}</Badge>
                {canCreateCorrections && isCorrectableInvoiceSource(inv) && <button type="button" className="invoice-correction-action" onClick={() => createCorrection(inv)} aria-label={`Koryguj fakturę ${inv.number}`}><FilePenLine />Koryguj</button>}
                <Button variant="ghost" onClick={event => openPreview(event, inv)} aria-label={`Podgląd faktury ${inv.number}`}><Eye className="size-4" aria-hidden="true" />Podgląd</Button>
              </div>
            </article>;
          })}
        </div>
        <div className="ui-invoice-scroll hidden md:block" role="region" aria-label="Tabela faktur — przewijana lista" tabIndex={0}>
          <table className="ui-invoice-table w-full text-left text-[13px] leading-5" style={{minWidth:456+activeColumns.reduce((width,column)=>width+column.width,0)}}>
            <caption className="sr-only">Lista faktur. Numer dokumentu i akcje pozostają widoczne podczas przewijania. Kliknij numer, aby otworzyć szybki podgląd.</caption>
            <colgroup><col style={{width:244}} />{activeColumns.map(column=><col key={column.id} style={{width:column.width}} />)}<col style={{width:212}} /></colgroup>
            <thead><tr>
              <th scope="col" data-invoice-column="document" className="px-3 py-3"><div className="flex items-center gap-3">
                <input type="checkbox" aria-label="Zaznacz wszystkie widoczne faktury" ref={element=>{if(element)element.indeterminate=filtered.some(invoice=>selectedIds.includes(invoice.id))&&!filtered.every(invoice=>selectedIds.includes(invoice.id));}}
                  checked={filtered.length>0&&filtered.every(invoice=>selectedIds.includes(invoice.id))} onChange={event=>setSelectedIds(event.target.checked?filtered.map(invoice=>invoice.id):[])} className="size-4 shrink-0 accent-primary" />
                <span>Dokument</span>
              </div></th>
              {activeColumns.map(column=><th key={column.id} scope="col" data-invoice-column={column.id} className={`px-3 py-3 ${column.id==='gross'?'text-right':''}`}>{column.label}</th>)}
              <th scope="col" data-invoice-column="actions" className="px-3 py-3 text-right">Akcje</th>
            </tr></thead>
            <tbody>
              {filtered.map(inv=>{
                const ctr=getContractor(contractors,inv.contractorId), payment=invoicePaymentPresentation(inv);
                const ksefNum=inv.ksef?.number||inv.ksefNumber, isSelected=selectedIds.includes(inv.id), isApproved=inv.approvalStatus==='approved';
                const cells:Record<InvoiceColumnId,React.ReactNode>={
                  contractor:<><p className="max-w-[176px] truncate font-medium text-foreground" title={ctr?.name||'Klient detaliczny'}>{ctr?.name||'Klient detaliczny'}</p><p className="text-xs tabular-nums text-muted-foreground">{ctr?.nip||''}</p></>,
                  issueDate:<time dateTime={inv.issueDate} className="tabular-nums text-muted-foreground">{formatDate(inv.issueDate)}</time>,
                  dueDate:<time dateTime={inv.dueDate} className="tabular-nums text-muted-foreground">{formatDate(inv.dueDate)}</time>,
                  gross:<span className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatMoney(inv.totalGross??invoiceTotals(inv).gross,inv.currency)}</span>,
                  payment:<Badge className={`${payment.color} rounded-lg px-2.5 py-1 text-xs`}><span aria-hidden="true" className={`mr-1.5 size-1.5 shrink-0 rounded-full ${payment.dot}`} />{payment.label}</Badge>,
                  ksef:<KsefStatusBadge invoice={inv} />,
                  currency:<span className="text-xs font-medium">{inv.currency}</span>,
                  approval:inv.type==='purchase'?<Badge className={isApproved?'border border-success/25 bg-success/10 text-success dark:text-success':'border border-warning/25 bg-warning/10 text-warning dark:text-warning'}>{isApproved?<CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" />:<Clock className="mr-1 size-3.5" aria-hidden="true" />}{isApproved?'Zaakceptowana':'Do akceptacji'}</Badge>:<span className="text-muted-foreground">—</span>,
                };
                return <tr key={inv.id} data-invoice-id={inv.id} data-preview-active={previewInvoice?.id===inv.id||undefined} data-selected={isSelected||undefined} data-new-invoice={highlightedId===inv.id||undefined}
                  onClick={event=>{if(event.currentTarget.contains(event.target as Node)&&!(event.target as HTMLElement).closest('a,button,input,label,[role="menuitem"],[role="menuitemcheckbox"]'))openPreview(event,inv);}} className="ui-invoice-row cursor-pointer transition-colors">
                  <td data-invoice-column="document" className="px-3 py-3.5"><div className="flex items-center gap-3">
                    <input type="checkbox" aria-label={`Zaznacz fakturę ${inv.number}`} checked={isSelected} onChange={event=>setSelectedIds(ids=>event.target.checked?[...ids,inv.id]:ids.filter(id=>id!==inv.id))} className="size-4 shrink-0 accent-primary" />
                    <Link prefetch={false} href={`/invoices/${inv.id}`} onClick={event=>openPreview(event,inv)} aria-haspopup="dialog" className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-3.5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block max-w-36 truncate font-semibold text-foreground group-hover:text-primary" title={inv.number}>{inv.number}</span><span className="block text-xs text-muted-foreground">{inv.isProforma?'PRO Proforma':inv.type==='sale'?'FV Sprzedaż':'FZ Zakup'} · {inv.currency}</span></span>
                    </Link>
                  </div></td>
                  {activeColumns.map(column=><td key={column.id} data-invoice-column={column.id} className={`px-3 py-3.5 ${column.id==='gross'?'text-right':''}`}>{cells[column.id]}</td>)}
                      <td data-invoice-column="actions" className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="ghost" size="icon" onClick={event => openPreview(event, inv)} aria-label={`Podgląd faktury ${inv.number}`} title="Szybki podgląd" className="h-9 w-9"><Eye className="size-4" aria-hidden="true" /></Button>
                          {canCreateCorrections && isCorrectableInvoiceSource(inv) && <button type="button" className="invoice-correction-action" onClick={() => createCorrection(inv)} aria-label={`Koryguj fakturę ${inv.number}`}><FilePenLine />Koryguj</button>}
                          <InvoiceRowActions number={inv.number}>
                            <Link prefetch={false} href={`/invoices/${inv.id}`}><FileText className="size-4" /> Szczegóły dokumentu</Link>
                            {canApprove && inv.type === "purchase" && <button type="button" onClick={() => handleSingleApprove(inv.id, isApproved ? "pending" : "approved")}><CheckCircle2 className="size-4" />{isApproved ? "Cofnij akceptację" : "Akceptuj dla księgowości"}</button>}
                            {inv.isProforma && <button type="button" onClick={() => handleConvertProformaToVat(inv)}><FileCheck2 className="size-4" /> Wystaw fakturę VAT</button>}
                            {canSendKsef && !ksefNum && inv.type === "sale" && !inv.isProforma && inv.status !== "draft" && inv.documentStatus !== "draft" && !isKsefUiPending(inv) && <button type="button" onClick={() => setConfirmKsef(inv.id)}><Send className="size-4" /> Wyślij do KSeF</button>}
                            <button type="button" onClick={() => setSelectedForEmail(inv)}><Mail className="size-4" /> Wyślij e-mailem</button>
                            {ksefNum && (inv.hasUpo || inv.upoXml) && <button type="button" onClick={() => handleDownloadUpo(ksefNum)}><Download className="size-4" />{ksefPresentation(inv).simulated ? "Potwierdzenie demo" : "Pobierz UPO"}</button>}
                            {inv.type !== "purchase" && <>
                              <button type="button" onClick={() => editInvoice(inv.id)}><Pencil className="size-4" /> Edytuj</button>
                              <button type="button" onClick={() => duplicateInvoice(inv.id)}><Copy className="size-4" /> Duplikuj</button>
                              <div role="separator" className="my-1 border-t border-border/60" />
                              <button type="button" className="text-destructive" onClick={() => setToDelete(inv.id)}><Trash2 className="size-4" /> Usuń</button>
                            </>}
                          </InvoiceRowActions>
                        </div>
                      </td>
                </tr>;
              })}
            </tbody>
          </table>

        </div>
        {!results.loading && !results.error && filtered.length === 0 && <React.Suspense fallback={<p role="status" className="py-14 text-center text-sm text-muted-foreground">Ładowanie wskazówek…</p>}>
          <EmptyState icon={hasFilters ? Search : FileText}
            title={hasFilters ? "Brak wyników wyszukiwania" : showUnassigned ? "Brak faktur bez przypisanej firmy" : "Tutaj pojawią się Twoje faktury"}
            description={hasFilters ? "Zmień wpisaną frazę lub wyczyść filtry, aby ponownie zobaczyć dokumenty." : showUnassigned ? "Wróć do wybranej firmy, aby przeglądać jej dokumenty." : "Wystaw pierwszą fakturę. Możesz zacząć od szkicu i wrócić do niego później."}
            action={hasFilters ? <Button onClick={clearFilters}><X className="size-4" aria-hidden="true" />Wyczyść filtry</Button> : showUnassigned ? <Button onClick={() => setShowUnassigned(false)}>Faktury wybranej firmy</Button> : <Button onClick={() => { setDraft(null, true); router.push("/invoices/new"); }}><Plus className="size-4" aria-hidden="true" />Wystaw pierwszą fakturę</Button>}
            className="py-16" />
        </React.Suspense>}
        </LoadingReveal>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Stronicowanie faktur">
        <Button variant="subtle" className="order-2 sm:order-1" disabled={results.page === 1 || results.loading} onClick={results.previous}>Poprzednia</Button>
        <span role="status" className="order-1 min-w-0 basis-full break-words text-sm sm:order-2 sm:basis-auto">Strona {results.page} · {results.total} {results.total === 1 ? "wynik" : results.total % 10 >= 2 && results.total % 10 <= 4 && (results.total % 100 < 12 || results.total % 100 > 14) ? "wyniki" : "wyników"}{results.loading ? " · Ładowanie…" : ""}</span>
        <Button variant="subtle" className="order-3" disabled={!results.nextCursor || results.loading} onClick={results.next}>Następna</Button>
        <Button variant="subtle" className="order-4" onClick={results.first}>Pierwsza strona</Button>
      </div>

      {previewInvoice && <React.Suspense fallback={<span role="status" className="sr-only">Otwieranie podglądu faktury…</span>}><InvoiceQuickPreview invoice={previewInvoice} contractor={getContractor(contractors, previewInvoice.contractorId)} onClose={preview.close} navigation={{...preview,move:direction=>void preview.move(direction),retry:()=>void preview.retry()}} /></React.Suspense>}

      {confirmBulkPayment && <React.Suspense fallback={<span role="status" className="sr-only">Ładowanie potwierdzenia…</span>}><ConfirmDialog
        open
        onClose={() => setConfirmBulkPayment(false)}
        onConfirm={() => void handleBulkMarkPaid()}
        title="Zarejestrować wpłaty?"
        description={`Dla ${payableSelected.length} faktur zostaną zapisane wpłaty na pozostałą kwotę. Operacja obejmuje tylko wybraną firmę.`}
        confirmLabel={markingPaid ? "Zapisywanie…" : "Zarejestruj wpłaty"}
      /></React.Suspense>}

      {toDelete && <React.Suspense fallback={<span role="status" className="sr-only">Ładowanie potwierdzenia…</span>}><ConfirmDialog
        open
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
      /></React.Suspense>}

      {confirmKsef && <React.Suspense fallback={<span role="status" className="sr-only">Ładowanie potwierdzenia…</span>}><ConfirmDialog
        open
        onClose={() => setConfirmKsef(null)}
        onConfirm={() => confirmKsef && sendToKsef(confirmKsef)}
        title="Wysyłka e-Faktury do KSeF"
        description={`Faktura ${selectedForKsef?.number || ""} zostanie przetłumaczona do oficjalnego formatu FA(3), zaszyfrowana (AES-256-CBC) i przesłana do KSeF (${ksefEnvironment}).`}
        confirmLabel={sendingKsef ? "Wysyłanie..." : "Wyślij e-Fakturę"}
        danger={false}
      /></React.Suspense>}

      {selectedForEmail && (
        <React.Suspense fallback={<span role="status" className="sr-only">Ładowanie wysyłki e-mail…</span>}>
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
        </React.Suspense>
      )}
    </div>
  );
}
