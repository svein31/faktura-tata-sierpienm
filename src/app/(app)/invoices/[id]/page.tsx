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
      const { buildFa3Xml } = await import("@/lib/ksef/index");
      const xml = buildFa3Xml({ invoice, seller: companySafe, buyer: contractor });
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
        toast("success", "Wysłano do KSeF (FA(3))", `${invoice.number} → ${data.ksefNumber}`);
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/invoices")}
            aria-label="Wróć"
            className="rounded-xl hover:bg-muted/60"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[18px] font-bold tracking-tight text-foreground">{invoice.number}</h2>
              <Badge className={STATUS_META[status].color}>
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`} />
                {STATUS_META[status].label}
              </Badge>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {invoice.type === "sale" ? "Faktura sprzedaży" : "Faktura zakupowa"} ·{" "}
              {formatDateTime(invoice.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={exports.exportPdf} className="rounded-xl">
            <Printer className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportHtml} className="rounded-xl">
            <FileDown className="h-3.5 w-3.5" /> HTML
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportXml} className="rounded-xl">
            <FileCode2 className="h-3.5 w-3.5" /> XML FA(2)
          </Button>
          <Button variant="outline" size="sm" onClick={exports.exportJson} className="rounded-xl">
            <FileJson2 className="h-3.5 w-3.5" /> JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleEdit} className="rounded-xl">
            <Pencil className="h-3.5 w-3.5" /> Edytuj
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => {
              const el = document.getElementById("send-email-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Mail className="h-3.5 w-3.5" /> Wyślij e-mail
          </Button>
          {status !== "paid" && status !== "draft" && (
            <Button variant="subtle" size="sm" onClick={handleMarkPaid} className="rounded-xl">
              <CheckCircle2 className="h-3.5 w-3.5" /> Oznacz opłaconą
            </Button>
          )}
          {!invoice.ksef && (
            <Button variant="subtle" size="sm" onClick={handleSendKsef} loading={sending} className="rounded-xl">
              <Send className="h-3.5 w-3.5" /> Wyślij do KSeF (demo)
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="rounded-xl text-muted-foreground hover:text-rose-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* KSeF info */}
      {invoice.ksef && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="no-print mb-4">
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-500 ring-1 ring-emerald-500/20">
                  <BadgeCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">
                    Dokument w KSeF · numer:{" "}
                    <span className="font-mono text-emerald-500">{invoice.ksef.number}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Status: {invoice.ksef.status} · wysłano: {formatDateTime(invoice.ksef.sentAt)} ·{" "}
                    środowisko: {invoice.ksef.environment}
                  </p>
                </div>
              </div>
              <Badge tone="success">KSeF {invoice.ksef.status}</Badge>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="print-area">
        <InvoicePreview invoice={invoice} contractor={contractor} company={companySafe} />
      </div>

      <div className="no-print mt-4 grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl border border-border/60 bg-card/70">
          <CardContent className="p-5 text-center">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Netto</p>
            <p className="mt-1.5 text-[18px] font-bold tabular-nums text-foreground">{formatMoney(totals.net, invoice.currency)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border/60 bg-card/70">
          <CardContent className="p-5 text-center">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">VAT</p>
            <p className="mt-1.5 text-[18px] font-bold tabular-nums text-foreground">{formatMoney(totals.vat, invoice.currency)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-primary/30 bg-primary/5">
          <CardContent className="p-5 text-center">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-primary/70">Brutto</p>
            <p className="mt-1.5 text-[18px] font-bold tabular-nums text-primary">{formatMoney(totals.gross, invoice.currency)}</p>
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
