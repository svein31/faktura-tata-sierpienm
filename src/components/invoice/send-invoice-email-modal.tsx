"use client";

import * as React from "react";
import {
  Mail,
  Send,
  FileText,
  FileCode2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
  History,
  ShieldCheck,
  ExternalLink,
  Eye,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { formatDateTime, formatMoney, invoiceTotals } from "@/lib/format";
import { isValidEmail, parseEmailList } from "@/lib/email/validation";
import type { CompanyProfile, Contractor, Invoice, InvoiceEmailLog } from "@/lib/types";

export interface SendInvoiceEmailModalProps {
  invoice: Invoice;
  contractor?: Contractor;
  company?: CompanyProfile;
  open: boolean;
  onClose: () => void;
  onSent?: (info: { sentAt: string; sentToEmail: string }) => void;
}

export function SendInvoiceEmailModal({
  invoice,
  contractor,
  company,
  open,
  onClose,
  onSent,
}: SendInvoiceEmailModalProps) {
  const toast = useToast();

  const [activeTab, setActiveTab] = React.useState<"compose" | "history">("compose");
  const [submitting, setSubmitting] = React.useState(false);

  // Status konfiguracji serwera pocztowego z backendu
  const [configStatus, setConfigStatus] = React.useState<{
    configured: boolean;
    provider: "smtp" | "resend" | "none";
    from: string;
    smtpHost?: string | null;
  } | null>(null);
  const [showConfigHelp, setShowConfigHelp] = React.useState(false);

  // Dane formularza
  const initialEmail = contractor?.email || invoice.sentToEmail || "";
  const [recipientEmail, setRecipientEmail] = React.useState(initialEmail);
  const [showCc, setShowCc] = React.useState(false);
  const [cc, setCc] = React.useState("");
  const [showBcc, setShowBcc] = React.useState(false);
  const [bcc, setBcc] = React.useState("");

  const companyName = company?.companyName || company?.name || "Moja Firma";
  const [subject, setSubject] = React.useState(`Faktura VAT nr ${invoice.number} od ${companyName}`);

  const totals = invoiceTotals(invoice);
  const formattedGross = formatMoney(totals.gross, invoice.currency);

  const defaultMessage = React.useMemo(() => {
    return (
      `Dzień dobry,\n\n` +
      `W załączniku przesyłamy fakturę VAT nr ${invoice.number} z dnia ${invoice.issueDate}.\n\n` +
      `• Kwota do zapłaty: ${formattedGross}\n` +
      `• Termin płatności: ${invoice.dueDate}\n` +
      (company?.bankAccount || company?.iban ? `• Rachunek bankowy: ${company.bankAccount || company.iban}\n` : "") +
      (invoice.ksef?.number || invoice.ksefNumber ? `• Identyfikator KSeF: ${invoice.ksef?.number || invoice.ksefNumber}\n` : "") +
      `\nW razie jakichkolwiek pytań pozostajemy do dyspozycji.\n\n` +
      `Z poważaniem,\n${companyName}`
    );
  }, [
    invoice.number,
    invoice.issueDate,
    invoice.dueDate,
    invoice.ksef?.number,
    invoice.ksefNumber,
    formattedGross,
    companyName,
    company?.bankAccount,
    company?.iban,
  ]);

  const [messageBody, setMessageBody] = React.useState(defaultMessage);

  // Załączniki
  const [attachPdf, setAttachPdf] = React.useState(true);
  const [attachXml, setAttachXml] = React.useState(Boolean(invoice.ksef?.number || invoice.ksefNumber));
  const hasUpo = Boolean(invoice.upoXml || (invoice.ksef?.number && invoice.status === "ksef_active"));
  const [attachUpo, setAttachUpo] = React.useState(hasUpo);

  // Opcja auto-wysyłki po KSeF
  const [autoSendOnKsef, setAutoSendOnKsef] = React.useState(Boolean(invoice.autoSendEmailOnKsef));

  // Podgląd wiadomości
  const [showPreview, setShowPreview] = React.useState(false);

  // Historia wysyłek
  const [emailLogs, setEmailLogs] = React.useState<InvoiceEmailLog[]>(invoice.emailLogs || []);
  const [loadingLogs, setLoadingLogs] = React.useState(false);

  // Ostatni znany status
  const lastSentAt = invoice.sentAt;
  const lastSentEmail = invoice.sentToEmail;

  // Inicjalizacja przy otwarciu
  React.useEffect(() => {
    if (open) {
      if (contractor?.email && !recipientEmail) {
        setRecipientEmail(contractor.email);
      }
      // Sprawdzenie statusu konfiguracji poczty
      fetch("/api/invoices/send-email")
        .then((res) => res.json())
        .then((data) => setConfigStatus(data))
        .catch(() => undefined);

      // Załadowanie historii wysyłek
      if (invoice.id) {
        setLoadingLogs(true);
        fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/email-history`)
          .then((res) => res.json())
          .then((data) => {
            if (Array.isArray(data.logs)) {
              setEmailLogs(data.logs);
            }
          })
          .catch(() => undefined)
          .finally(() => setLoadingLogs(false));
      }
    }
  }, [open, invoice.id, contractor?.email]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitting) return;

    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      toast("error", "Nieprawidłowy e-mail odbiorcy", "Podaj poprawny adres e-mail kontrahenta.");
      return;
    }

    if (showCc && cc) {
      const ccList = parseEmailList(cc);
      for (const item of ccList) {
        if (!isValidEmail(item)) {
          toast("error", "Błędny adres DW (Cc)", `Adres "${item}" ma niepoprawny format.`);
          return;
        }
      }
    }

    if (showBcc && bcc) {
      const bccList = parseEmailList(bcc);
      for (const item of bccList) {
        if (!isValidEmail(item)) {
          toast("error", "Błędny adres UDW (Bcc)", `Adres "${item}" ma niepoprawny format.`);
          return;
        }
      }
    }

    if (!subject.trim()) {
      toast("error", "Brak tematu", "Wpisz temat wiadomości e-mail.");
      return;
    }

    if (!attachPdf && !attachXml && !attachUpo) {
      toast("warning", "Brak załączników", "Zaznacz co najmniej jeden załącznik do wysyłki (PDF lub XML).");
      return;
    }

    setSubmitting(true);
    const idempotencyKey = `${invoice.id}_${Date.now()}`;

    try {
      const res = await fetch("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          recipientEmail: recipientEmail.trim(),
          cc: showCc && cc.trim() ? cc.trim() : undefined,
          bcc: showBcc && bcc.trim() ? bcc.trim() : undefined,
          subject: subject.trim(),
          messageBody: messageBody.trim(),
          attachPdf,
          attachXml,
          attachUpo,
          autoSendOnKsef,
          idempotencyKey,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.error === "EMAIL_NOT_CONFIGURED") {
          setShowConfigHelp(true);
          toast(
            "error",
            "Poczta nie jest skonfigurowana",
            "Skonfiguruj SMTP lub Resend w zmiennych środowiskowych serwera."
          );
          return;
        }
        throw new Error(data.message || data.details || "Wystąpił błąd podczas wysyłki.");
      }

      toast(
        "success",
        "Faktura została wysłana!",
        `Wiadomość z fakturą pomyślnie wysłana do: ${recipientEmail}`
      );

      if (data.log) {
        setEmailLogs((prev) => [data.log, ...prev]);
      }

      if (onSent) {
        onSent({ sentAt: data.sentAt, sentToEmail: recipientEmail });
      }

      onClose();
    } catch (err: any) {
      toast("error", "Błąd wysyłki e-mail", err.message || "Nie udało się przesłać wiadomości.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Wysyłka faktury e-mailem: ${invoice.number}`}
      description="Prześlij dokument bezpośrednio do kontrahenta wraz z załącznikami PDF oraz KSeF."
      footer={
        activeTab === "compose" ? (
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5" />
              {showPreview ? "Ukryj podgląd" : "Podgląd wiadomości"}
            </Button>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Anuluj
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSend}
                loading={submitting}
                className="gap-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              >
                <Send className="h-4 w-4" />
                {lastSentAt ? "Wyślij ponownie" : "Wyślij fakturę"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Zamknij
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4 pt-1">
        {/* Przełącznik zakładek (Nowa wysyłka / Historia wysyłek) */}
        <div className="flex items-center gap-2 border-b border-border/70 pb-2.5">
          <button
            type="button"
            onClick={() => setActiveTab("compose")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "compose"
                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            Nowa wiadomość
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "history"
                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Historia wysyłek
            {emailLogs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-muted text-foreground">
                {emailLogs.length}
              </span>
            )}
          </button>
        </div>

        {/* Baner: Informacja o wcześniejszej wysyłce (świadome ponowienie) */}
        {lastSentAt && activeTab === "compose" && (
          <div className="flex items-start gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3 text-xs">
            <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-blue-900 dark:text-blue-300">
                Faktura była już wysyłana e-mailem
              </p>
              <p className="text-muted-foreground mt-0.5">
                Ostatnia wysyłka: <b>{formatDateTime(lastSentAt)}</b> na adres:{" "}
                <b className="font-mono text-foreground">{lastSentEmail}</b>. Możesz świadomie wysłać ją ponownie.
              </p>
            </div>
          </div>
        )}

        {/* Baner ostrzegawczy o braku konfiguracji poczty */}
        {configStatus && !configStatus.configured && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-300 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                Poczta nie jest jeszcze skonfigurowana
              </span>
              <button
                type="button"
                onClick={() => setShowConfigHelp(!showConfigHelp)}
                className="underline text-[11px] font-medium hover:text-foreground"
              >
                {showConfigHelp ? "Zwiń instrukcję" : "Instrukcja dla Netlify (2 minuty)"}
              </button>
            </div>
            <p className="text-[11.5px] leading-relaxed text-amber-800/90 dark:text-amber-200/90">
              Aplikacja na <b>Netlify</b> działa w środowisku Serverless. Aby wysyłać prawdziwe e-maile, dodaj zmienne w panelu:{" "}
              <b>Site configuration → Environment variables</b>, a następnie kliknij <b>Trigger deploy</b>.
            </p>
            {showConfigHelp && (
              <div className="mt-2 rounded-xl bg-card p-3.5 border border-border text-foreground space-y-3">
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5 text-[11.5px] text-blue-900 dark:text-blue-300">
                  <b>💡 Rekomendacja na Netlify (Resend - najszybsze i bezproblemowe):</b>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Działa przez HTTPS REST API (brak blokad portów i limitów czasu w AWS Lambda/Netlify). Do 3000 darmowych maili/miesięcznie.
                  </p>
                  <pre className="mt-1.5 p-2 rounded bg-muted/70 text-[10.5px] font-mono overflow-x-auto text-foreground">
{`RESEND_API_KEY = "re_twoj_klucz_z_resend_com"
EMAIL_FROM     = "FakturaProsto <faktury@twojadomena.pl>"  # lub na start: "FakturaProsto <onboarding@resend.dev>"`}
                  </pre>
                </div>

                <div className="rounded-lg bg-muted/40 border border-border p-2.5 text-[11.5px]">
                  <b>Opcja 2: Własna skrzynka pocztowa (np. CyberFolks SMTP):</b>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Na Netlify używaj wyłącznie portu <b>465 (SSL)</b> lub <b>587 (TLS)</b>. Port 25 jest w chmurze zablokowany.
                  </p>
                  <pre className="mt-1.5 p-2 rounded bg-muted/70 text-[10.5px] font-mono overflow-x-auto text-foreground">
{`SMTP_HOST   = "mail.twojadomena.pl"  # lub sXX.cyberfolks.pl
SMTP_PORT   = 465
SMTP_SECURE = true
SMTP_USER   = "faktury@twojadomena.pl"
SMTP_PASS   = "haslo_do_skrzynki"
EMAIL_FROM  = "FakturaProsto <faktury@twojadomena.pl>"`}
                  </pre>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  👉 Po dodaniu zmiennych w Netlify przejdź do zakładki <b>Deploys → Trigger deploy → Deploy site</b>, aby funkcje załadowały nowe zmienne.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── ZAKŁADKA 1: FORMULARZ WYSYŁKI ── */}
        {activeTab === "compose" && (
          <form onSubmit={handleSend} className="space-y-4">
            {/* Odbiorca (To) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="recipientEmail" className="text-xs font-semibold">
                  Odbiorca (Do) <span className="text-rose-500">*</span>
                </Label>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {!showCc && (
                    <button
                      type="button"
                      onClick={() => setShowCc(true)}
                      className="hover:text-foreground underline"
                    >
                      + DW (Kopia)
                    </button>
                  )}
                  {!showBcc && (
                    <button
                      type="button"
                      onClick={() => setShowBcc(true)}
                      className="hover:text-foreground underline"
                    >
                      + UDW (Ukryta kopia)
                    </button>
                  )}
                </div>
              </div>
              <Input
                id="recipientEmail"
                type="email"
                required
                placeholder="np. księgowość@klient.pl"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Opcjonalne pole DW (Cc) */}
            {showCc && (
              <div className="space-y-1 rounded-xl bg-muted/20 p-2.5 border border-border/60">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ccInput" className="text-[11.5px] font-semibold text-muted-foreground">
                    Kopia (DW / Cc)
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCc(false);
                      setCc("");
                    }}
                    className="text-[11px] text-rose-500 hover:underline"
                  >
                    Usuń DW
                  </button>
                </div>
                <Input
                  id="ccInput"
                  placeholder="adres1@firma.pl, adres2@firma.pl"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {/* Opcjonalne pole UDW (Bcc) */}
            {showBcc && (
              <div className="space-y-1 rounded-xl bg-muted/20 p-2.5 border border-border/60">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bccInput" className="text-[11.5px] font-semibold text-muted-foreground">
                    Ukryta kopia (UDW / Bcc)
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBcc(false);
                      setBcc("");
                    }}
                    className="text-[11px] text-rose-500 hover:underline"
                  >
                    Usuń UDW
                  </button>
                </div>
                <Input
                  id="bccInput"
                  placeholder="np. archiwum@mojafirma.pl"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {/* Temat wiadomości */}
            <div className="space-y-1.5">
              <Label htmlFor="emailSubject" className="text-xs font-semibold">
                Temat wiadomości <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="emailSubject"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Treść wiadomości */}
            <div className="space-y-1.5">
              <Label htmlFor="emailBody" className="text-xs font-semibold">
                Treść wiadomości
              </Label>
              <Textarea
                id="emailBody"
                rows={5}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                className="text-xs font-sans leading-relaxed"
              />
            </div>

            {/* Lista Załączników */}
            <div className="space-y-2 rounded-2xl border border-border/70 bg-card/60 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Załączniki do wiadomości:
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-start gap-2.5 p-2 rounded-xl border border-border/60 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={attachPdf}
                    onChange={(e) => setAttachPdf(e.target.checked)}
                    className="rounded border-border text-blue-600 focus:ring-blue-500 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <FileText className="h-3.5 w-3.5 text-rose-500" /> Faktura PDF
                    </span>
                    <p className="text-[10.5px] text-muted-foreground">
                      Zawiera aktualne dane, kody QR weryfikacji i status KSeF.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 rounded-xl border border-border/60 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={attachXml}
                    onChange={(e) => setAttachXml(e.target.checked)}
                    className="rounded border-border text-blue-600 focus:ring-blue-500 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <FileCode2 className="h-3.5 w-3.5 text-blue-500" /> Plik XML FA(3)
                    </span>
                    <p className="text-[10.5px] text-muted-foreground">
                      Struktura logiczna e-faktury KSeF 2.0.
                    </p>
                  </div>
                </label>

                {hasUpo && (
                  <label className="flex items-start gap-2.5 p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 cursor-pointer hover:bg-emerald-500/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={attachUpo}
                      onChange={(e) => setAttachUpo(e.target.checked)}
                      className="rounded border-border text-emerald-600 focus:ring-emerald-500 mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Urzędowe UPO (XML)
                      </span>
                      <p className="text-[10.5px] text-muted-foreground">
                        Oficjalne poświadczenie odbioru nadane przez Ministerstwo Finansów.
                      </p>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Opcja automatycznej wysyłki po akceptacji przez KSeF */}
            {invoice.type === "sale" && !invoice.ksefNumber && (
              <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-border/70 bg-muted/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSendOnKsef}
                  onChange={(e) => setAutoSendOnKsef(e.target.checked)}
                  className="rounded border-border text-blue-600 focus:ring-blue-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-foreground">
                    Automatycznie wyślij po przyjęciu przez KSeF
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Gdy faktura otrzyma numer KSeF i UPO, system sam wyśle e-mail z finalnym PDF i UPO do kontrahenta.
                  </p>
                </div>
              </label>
            )}

            {/* Podgląd wiadomości e-mail (rozwijany) */}
            {showPreview && (
              <div className="space-y-2 rounded-2xl border border-border/80 bg-slate-50 dark:bg-slate-900/50 p-4">
                <div className="flex items-center justify-between text-xs font-semibold border-b border-border/60 pb-2">
                  <span>Podgląd formatu HTML</span>
                  <Badge tone="outline" className="text-[10px]">
                    Szablon FakturaProsto
                  </Badge>
                </div>
                <div className="text-xs text-foreground space-y-2 bg-white dark:bg-slate-950 p-4 rounded-xl border border-border/70 shadow-xs">
                  <div className="border-b border-border/40 pb-2">
                    <p className="text-primary font-bold text-sm">FAKTURA VAT {invoice.number}</p>
                    <p className="text-muted-foreground text-[11px]">{companyName} · Do zapłaty: {formattedGross}</p>
                  </div>
                  <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700 dark:text-slate-300">
                    {messageBody}
                  </p>
                </div>
              </div>
            )}
          </form>
        )}

        {/* ── ZAKŁADKA 2: HISTORIA WYSYŁEK ── */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {loadingLogs ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2 text-primary" />
                Wczytywanie historii wysyłek…
              </div>
            ) : emailLogs.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="font-semibold text-foreground text-sm">Brak historii wysyłek</p>
                <p className="mt-1">Ten dokument nie był jeszcze wysyłany e-mailem z systemu.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {emailLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-border/70 bg-card p-3.5 text-xs shadow-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {log.status === "failed" ? (
                          <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        )}
                        <span className="font-bold text-foreground font-mono">{log.to}</span>
                        {log.cc && (
                          <span className="text-[11px] text-muted-foreground">
                            DW: <span className="font-mono">{log.cc}</span>
                          </span>
                        )}
                      </div>
                      <Badge
                        tone={log.status === "failed" ? "danger" : "success"}
                        className="text-[10.5px] font-medium"
                      >
                        {log.status === "accepted"
                          ? "Przyjęto przez serwer"
                          : log.status === "sent"
                          ? "Wysłano"
                          : log.status === "delivered"
                          ? "Dostarczono"
                          : "Błąd wysyłki"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>Data: {formatDateTime(log.sentAt)}</span>
                      <span>Dostawca: <b className="uppercase">{log.provider}</b></span>
                      {log.userName && <span>Wysłał: {log.userName}</span>}
                    </div>

                    {log.error && (
                      <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-[11px]">
                        Błąd: {log.error}
                      </div>
                    )}

                    {Array.isArray(log.attachments) && log.attachments.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50 text-[10.5px]">
                        <span className="text-muted-foreground">Załączniki:</span>
                        {log.attachments.map((att, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-lg bg-muted/60 font-mono">
                            {att.filename}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
