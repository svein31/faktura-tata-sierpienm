"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Download,
  FileCode2,
  FileDown,
  FileJson2,
  FileText,
  Mail,
  Pencil,
  Printer,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  History,
} from "lucide-react";
import { InvoiceHistoryTab } from "@/components/invoice/invoice-history-tab";
import { useAppStore, effectiveStatus, STATUS_META, getContractor } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { InvoicePreview } from "@/components/invoice/invoice-preview";
import { useInvoiceExports } from "@/lib/invoice-actions";
import { formatDateTime, invoiceTotals, formatMoney } from "@/lib/format";
import { buildFa3Xml } from "@/lib/ksef/xmlBuilder";
import { SendInvoiceEmailModal } from "@/components/invoice/send-invoice-email-modal";
import { EMPTY_COMPANY } from "@/lib/types";
import type { Invoice } from "@/lib/types";

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const invoices = useAppStore((s) => s.invoices);
  const invoice = invoices.find((i) => i.id === params.id);

  if (!invoice) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-lg font-semibold">Nie znaleziono faktury</p>
        <p className="max-w-md text-[13px] text-muted-foreground">
          Dokument o identyfikatorze <code className="rounded bg-muted px-1.5 py-0.5">{params.id}</code>{" "}
          nie istnieje lub został usunięty.
        </p>
        <Button onClick={() => router.push("/invoices")}>
          <ArrowLeft className="h-4 w-4" /> Wróć do listy
        </Button>
      </div>
    );
  }

  return <InvoiceDetailView invoice={invoice} />;
}

function InvoiceDetailView({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const toast = useToast();
  const { contractors, company, setDraft, deleteInvoice, updateInvoice, setInvoiceKsef, ksef } =
    useAppStore();

  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [checkingStatus, setCheckingStatus] = React.useState(false);
  const [approving, setApproving] = React.useState(false);
  const [emailModalOpen, setEmailModalOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"preview" | "history">("preview");

  const handleToggleApproval = async (targetStatus: "approved" | "pending") => {
    setApproving(true);
    try {
      const res = await fetch("/api/invoices/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceIds: [invoice.id],
          status: targetStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd aktualizacji");
      await useAppStore.getState().revalidate();
      toast(
        targetStatus === "approved" ? "success" : "info",
        targetStatus === "approved" ? "Zatwierdzono fakturę dla księgowości" : "Cofnięto akceptację",
        invoice.number
      );
    } catch (e: any) {
      toast("error", "Błąd", e?.message);
    } finally {
      setApproving(false);
    }
  };

  const companies = useAppStore((s) => s.companies);
  const matchedCompany = invoice.sellerCompanyId
    ? companies.find((c) => c.id === invoice.sellerCompanyId)
    : null;
  const companySafe = matchedCompany ?? company ?? EMPTY_COMPANY;
  const ksefEnv = ksef?.environment ?? "demo";
  const contractor = getContractor(contractors, invoice.contractorId);
  const exports = useInvoiceExports(invoice, contractor, companySafe);
  const status = effectiveStatus(invoice);
  const totals = invoiceTotals(invoice);

  const handleMarkPaid = () => {
    if (invoice.type === 'purchase') return;
    void updateInvoice(invoice.id, { status: "paid" })
      .then(() => toast("success", "Oznaczono jako opłaconą", invoice.number))
      .catch((e: Error) => toast("error", "Nie udało się zapisać", e.message));
  };

  const handleSendKsef = async () => {
    setSending(true);
    try {
      const xml = buildFa3Xml({ invoice, seller: companySafe, buyer: contractor });
      const res = await fetch("/api/ksef/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xml,
          environment: ksefEnv,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.ksefNumber) {
        if (data.invoice) {
          useAppStore.getState().applyInvoice(data.invoice);
        } else {
          setInvoiceKsef(invoice.id, {
            number: data.ksefNumber,
            status: data.status ?? "ACTIVE",
            sentAt: data.timestamp ?? new Date().toISOString(),
            environment: ksefEnv,
          });
        }
        toast("success", "Faktura wysłana do KSeF (FA(3))!", `${invoice.number} → ${data.ksefNumber}`);
      } else {
        toast("error", "KSeF: odrzucono dokument", data.message ?? "Błąd wysyłki do KSeF.");
      }
    } catch {
      toast("error", "Błąd sieci", "Nie udało się przesłać dokumentu do KSeF.");
    } finally {
      setSending(false);
    }
  };

  const handleCheckKsefStatus = async () => {
    const ref = invoice.referenceNumber || invoice.ksefNumber || invoice.id;
    setCheckingStatus(true);
    try {
      const res = await fetch(`/api/ksef/status/${encodeURIComponent(ref)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        await useAppStore.getState().revalidate();
        toast("success", "Status KSeF zaktualizowany", `Status: ${data.status} · ${data.processingDescription}`);
      } else {
        toast("error", "Nie udało się pobrać statusu", data.message);
      }
    } catch {
      toast("error", "Błąd sieci", "Nie udało się sprawdzić statusu w KSeF.");
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleDownloadUpo = (ksefNumber: string) => {
    window.open(`/api/ksef/invoices/download/${encodeURIComponent(ksefNumber)}?format=upo`, "_blank");
  };

  const handleDownloadXml = (ksefNumber: string) => {
    window.open(`/api/ksef/invoices/download/${encodeURIComponent(ksefNumber)}?format=xml`, "_blank");
  };

  const handleEdit = () => {
    if (invoice.type === 'purchase') return;
    setDraft({ ...invoice }, false);
    router.push("/invoices/new");
  };

  const ksefNum = invoice.ksef?.number || invoice.ksefNumber;
  const isKsefActive = invoice.ksef?.status === "ACTIVE" || invoice.status === "ksef_active";

  return (
    <div className="space-y-6">
      {/* Pasek nawigacji i akcji */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/invoices")}
            aria-label="Wróć"
            className="rounded-xl hover:bg-muted/60 h-10 w-10"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-foreground break-all">
                {invoice.number}
              </h1>
              <Badge className={`${STATUS_META[status].color} shrink-0 whitespace-nowrap rounded-lg px-2.5 py-0.5 text-xs`}>
                <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${STATUS_META[status].dot}`} />
                {STATUS_META[status].label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {invoice.type === "sale" ? "Faktura sprzedaży (FV)" : "Faktura zakupowa (FZ)"} ·{" "}
              {formatDateTime(invoice.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEmailModalOpen(true)}
            className="rounded-xl gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/10 shadow-2xs"
          >
            <Mail className="h-3.5 w-3.5" /> Wyślij e-mailem
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportPdf} className="rounded-xl gap-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" /> Drukuj / PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportXml} className="rounded-xl gap-1.5 text-xs">
            <FileCode2 className="h-3.5 w-3.5" /> Pobierz FA(3)
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportHtml} className="rounded-xl gap-1.5 text-xs">
            <FileDown className="h-3.5 w-3.5" /> HTML
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportJson} className="rounded-xl gap-1.5 text-xs">
            <FileJson2 className="h-3.5 w-3.5" /> JSON
          </Button>
          {invoice.type !== "purchase" && (<Button variant="outline" size="sm" onClick={handleEdit} className="rounded-xl gap-1.5 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Edytuj
          </Button>)}

          {invoice.type !== "purchase" && status !== "paid" && status !== "draft" && (
            <Button variant="subtle" size="sm" onClick={handleMarkPaid} className="rounded-xl gap-1.5 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> Oznacz opłaconą
            </Button>
          )}

          {invoice.type === "purchase" && (
            invoice.approvalStatus === "approved" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleApproval("pending")}
                loading={approving}
                className="rounded-xl gap-1.5 text-xs text-muted-foreground"
              >
                Cofnij akceptację
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleToggleApproval("approved")}
                loading={approving}
                className="rounded-xl gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Zatwierdź dla księgowości
              </Button>
            )
          )}

          {!ksefNum && invoice.type === "sale" && (
            <Button
              variant="subtle"
              size="sm"
              onClick={handleSendKsef}
              loading={sending}
              className="rounded-xl gap-1.5 text-xs font-semibold"
            >
              <Send className="h-3.5 w-3.5" /> Wyślij do KSeF ({ksefEnv})
            </Button>
          )}

          {invoice.type !== "purchase" && (<Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmDelete(true)}
            className="rounded-xl text-muted-foreground hover:text-rose-500 h-9 w-9"
          >
            <Trash2 className="h-4 w-4" />
          </Button>)}
        </div>
      </div>

      {/* Przełącznik zakładek: Dokument vs Historia Audytu */}
      <div className="no-print flex items-center gap-2 border-b border-border/60 pb-3">
        <Button
          type="button"
          variant={activeTab === "preview" ? "subtle" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("preview")}
          className="rounded-xl gap-2 text-xs font-semibold"
        >
          <FileText className="h-3.5 w-3.5" />
          Podgląd dokumentu
        </Button>
        <Button
          type="button"
          variant={activeTab === "history" ? "subtle" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("history")}
          className="rounded-xl gap-2 text-xs font-semibold"
        >
          <History className="h-3.5 w-3.5" />
          Historia i audyt zmian (Audit Log)
        </Button>
      </div>

      {activeTab === "history" ? (
        <InvoiceHistoryTab invoiceId={invoice.id} />
      ) : (
        <>
      {/* Karta Akceptacji Księgowej dla Faktur Zakupowych */}
      {invoice.type === "purchase" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="no-print">
          <Card className={`rounded-3xl border shadow-xs overflow-hidden ${
            invoice.approvalStatus === "approved"
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}>
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                  invoice.approvalStatus === "approved"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30"
                }`}>
                  {invoice.approvalStatus === "approved" ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <Clock className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground">
                      {invoice.approvalStatus === "approved"
                        ? "Faktura zaakceptowana dla księgowości"
                        : "Oczekuje na akceptację merytoryczno-księgową"}
                    </p>
                    <Badge tone={invoice.approvalStatus === "approved" ? "success" : "warning"} className="text-[10px]">
                      {invoice.approvalStatus === "approved" ? "Zatwierdzona" : "Do akceptacji"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {invoice.approvalStatus === "approved"
                      ? `Zaakceptowano: ${invoice.approvedAt ? formatDateTime(invoice.approvedAt) : "Tak"} · Użytkownik: ${invoice.approvedBy || "Administrator"}`
                      : "Faktura zakupowa wymaga weryfikacji i akceptacji przed ujęciem w deklaracjach i KPiR/JPK."}
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                {invoice.approvalStatus === "approved" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleApproval("pending")}
                    loading={approving}
                    className="rounded-xl gap-1.5 text-xs"
                  >
                    Cofnij zatwierdzenie
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleToggleApproval("approved")}
                    loading={approving}
                    className="rounded-xl gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Zatwierdź dokument
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Dedykowana Karta Transmisji KSeF */}
      {ksefNum ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="no-print">
          <Card className="rounded-3xl border-emerald-500/30 bg-emerald-500/5 shadow-xs overflow-hidden">
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-foreground">
                      Dokument zarejestrowany w KSeF
                    </p>
                    <Badge tone="success" className="text-[10px]">
                      {isKsefActive ? "Aktywny / UPO pobrane" : "Wysłano"}
                    </Badge>
                    <Badge tone="outline" className="text-[10px] uppercase font-mono">
                      {invoice.ksef?.environment || "demo"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 break-all">
                    Numer KSeF: {ksefNum}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Data przyjęcia: {formatDateTime(invoice.ksef?.sentAt || invoice.sentAt || invoice.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckKsefStatus}
                  loading={checkingStatus}
                  className="rounded-xl gap-1.5 text-xs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? "animate-spin" : ""}`} />
                  Odśwież status
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => handleDownloadUpo(ksefNum)}
                  className="rounded-xl gap-1.5 text-xs font-semibold"
                >
                  <Download className="h-3.5 w-3.5" />
                  Pobierz UPO (XML)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadXml(ksefNum)}
                  className="rounded-xl gap-1.5 text-xs"
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                  Pobierz XML
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : invoice.type === "sale" ? (
        <Card className="no-print rounded-3xl border-border/70 bg-card/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                Faktura nie została jeszcze przekazana do KSeF
              </p>
              <p className="text-[11px] text-muted-foreground">
                Możesz przesłać dokument w formacie FA(3) bezpośrednio do serwerów Ministerstwa Finansów ({ksefEnv}).
              </p>
            </div>
          </div>
          <Button
            onClick={handleSendKsef}
            loading={sending}
            size="sm"
            className="rounded-xl gap-1.5 text-xs font-semibold shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            Wyślij do KSeF ({ksefEnv})
          </Button>
        </Card>
      ) : null}

      {/* Wizualny podgląd arkusza faktury */}
      <div className="print-area">
        <InvoicePreview invoice={invoice} contractor={contractor} company={companySafe} />
      </div>

      {/* Podsumowanie kwot */}
      <div className="no-print grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl border border-border/70 bg-card/70 shadow-xs">
          <CardContent className="p-4 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Wartość Netto</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatMoney(totals.net, invoice.currency)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border/70 bg-card/70 shadow-xs">
          <CardContent className="p-4 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Podatek VAT</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatMoney(totals.vat, invoice.currency)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-primary/30 bg-primary/5 shadow-xs">
          <CardContent className="p-4 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wider text-primary/80">Wartość Brutto</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-primary">{formatMoney(totals.gross, invoice.currency)}</p>
          </CardContent>
        </Card>
      </div>
      </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          void deleteInvoice(invoice.id)
            .then(() => {
              toast("success", "Usunięto fakturę", invoice.number);
              router.push("/invoices");
            })
            .catch((e: Error) => toast("error", "Nie udało się usunąć", e.message));
        }}
        title="Usunąć fakturę?"
        description={`Dokument ${invoice.number} zostanie trwale usunięty z systemu.`}
      />

      <SendInvoiceEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        invoice={invoice}
        contractor={contractor}
        company={companySafe}
        onSent={() => void useAppStore.getState().revalidate()}
      />
    </div>
  );
}
