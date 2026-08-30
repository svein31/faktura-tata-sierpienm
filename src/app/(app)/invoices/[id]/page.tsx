"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  FileCode2,
  FileJson2,
  Pencil,
  Printer,
  Send,
  Trash2,
  FileDown,
  Mail,
} from "lucide-react";
import { useAppStore, effectiveStatus, STATUS_META, getContractor } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { InvoicePreview } from "@/components/invoice/invoice-preview";
import { SendInvoiceEmailCard } from "@/components/invoice/send-invoice-email-card";
import { useInvoiceExports } from "@/lib/invoice-actions";
import { formatDateTime, invoiceTotals, formatMoney } from "@/lib/format";
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

  const companySafe = company ?? EMPTY_COMPANY;
  const ksefEnv = ksef?.environment ?? "demo";
  const contractor = getContractor(contractors, invoice.contractorId);
  const exports = useInvoiceExports(invoice, contractor, companySafe);
  const status = effectiveStatus(invoice);
  const totals = invoiceTotals(invoice);

  const handleMarkPaid = () => {
    void updateInvoice(invoice.id, { status: "paid" })
      .then(() => toast("success", "Oznaczono jako opłaconą", invoice.number))
      .catch((e: Error) => toast("error", "Nie udało się zapisać", e.message));
  };

  const handleSendKsef = async () => {
    setSending(true);
    try {
      const { buildFaVatXml } = await import("@/lib/xml");
      const xml = buildFaVatXml(invoice, companySafe);
      const res = await fetch("/api/ksef/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml, environment: ksefEnv, invoiceId: invoice.id, invoiceNumber: invoice.number }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.ksefNumber) {
        if (data.invoice) {
          useAppStore.getState().applyInvoice(data.invoice);
        } else {
          setInvoiceKsef(invoice.id, {
            number: data.ksefNumber,
            status: data.status ?? "SENT",
            sentAt: data.timestamp ?? new Date().toISOString(),
            environment: ksefEnv,
          });
        }
        toast("success", "Wysłano do KSeF", `${invoice.number} → ${data.ksefNumber}`);
      } else {
        toast("error", "KSeF: odrzucono dokument", data.message ?? "Błąd wysyłki do KSeF.");
      }
    } catch {
      toast("error", "Błąd sieci", "Nie udało się wysłać do KSeF.");
    } finally {
      setSending(false);
    }
  };

  const handleEdit = () => {
    setDraft({ ...invoice }, false);
    router.push("/invoices/new");
  };

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/invoices")} aria-label="Wróć">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">{invoice.number}</h2>
              <Badge className={STATUS_META[status].color}>{STATUS_META[status].label}</Badge>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {invoice.type === "sale" ? "Faktura sprzedaży" : "Faktura zakupowa"} ·{" "}
              {formatDateTime(invoice.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={exports.exportPdf}>
            <Printer className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportHtml}>
            <FileDown className="h-3.5 w-3.5" /> HTML
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportXml}>
            <FileCode2 className="h-3.5 w-3.5" /> XML FA(2)
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportJson}>
            <FileJson2 className="h-3.5 w-3.5" /> JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edytuj
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const el = document.getElementById("send-email-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Mail className="h-3.5 w-3.5" /> Wyślij e-mail
          </Button>
          {status !== "paid" && status !== "draft" && (
            <Button variant="subtle" size="sm" onClick={handleMarkPaid}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Oznacz opłaconą
            </Button>
          )}
          {!invoice.ksef && (
            <Button variant="subtle" size="sm" onClick={handleSendKsef} loading={sending}>
              <Send className="h-3.5 w-3.5" /> Wyślij do KSeF (demo)
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="text-muted-foreground hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* KSeF info */}
      {invoice.ksef && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="no-print mb-4">
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <BadgeCheck className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-[13.5px] font-semibold">
                    Dokument w KSeF · numer:{" "}
                    <span className="font-mono text-accent">{invoice.ksef.number}</span>
                  </p>
                  <p className="text-[11.5px] text-muted-foreground">
                    Status: {invoice.ksef.status} · wysłano: {formatDateTime(invoice.ksef.sentAt)} ·{" "}
                    środowisko: {invoice.ksef.environment}
                  </p>
                </div>
              </div>
              <Badge tone="accent">KSeF {invoice.ksef.status}</Badge>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="print-area">
        <InvoicePreview invoice={invoice} contractor={contractor} company={companySafe} />
      </div>

      <div className="no-print mt-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-[11px] text-muted-foreground">Netto</p>
            <p className="text-[16px] font-bold tabular-nums">{formatMoney(totals.net, invoice.currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-[11px] text-muted-foreground">VAT</p>
            <p className="text-[16px] font-bold tabular-nums">{formatMoney(totals.vat, invoice.currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-[11px] text-primary">Brutto</p>
            <p className="text-[16px] font-bold tabular-nums text-primary">{formatMoney(totals.gross, invoice.currency)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sekcja wysyłki faktury e-mailem */}
      <div id="send-email-section" className="no-print mt-6">
        <SendInvoiceEmailCard
          invoice={invoice}
          contractor={contractor}
          company={companySafe}
          onSent={(info) => {
            updateInvoice(invoice.id, {
              sentAt: info.sentAt,
              sentToEmail: info.sentToEmail,
              emailStatus: "SENT",
              status: invoice.status === "draft" ? "sent" : invoice.status,
            });
          }}
        />
      </div>

      <p className="no-print mt-6 text-center text-[12px] text-muted-foreground">
        <Link href="/invoices" className="underline-offset-4 hover:underline">
          ← Wszystkie faktury
        </Link>
      </p>

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
        description={`Dokument ${invoice.number} zostanie trwale usunięty.`}
      />
    </div>
  );
}
