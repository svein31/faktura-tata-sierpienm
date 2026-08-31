"use client";

import * as React from "react";
import { Mail, CheckCircle2, Clock, Send, FileText, FileCode2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { formatMoney, invoiceTotals } from "@/lib/format";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";

export interface SendInvoiceEmailCardProps {
  invoice: Invoice;
  contractor?: Contractor;
  company?: CompanyProfile;
  onSent?: (info: { sentAt: string; sentToEmail: string }) => void;
  className?: string;
  defaultExpanded?: boolean;
}

export function SendInvoiceEmailCard({
  invoice,
  contractor,
  company,
  onSent,
  className,
  defaultExpanded = true,
}: SendInvoiceEmailCardProps) {
  const toast = useToast();
  const [loading, setLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  // Dane domyślne
  const initialEmail = contractor?.email || invoice.sentToEmail || "";
  const [recipientEmail, setRecipientEmail] = React.useState(initialEmail);

  const companyName = company?.companyName || company?.name || "Moja Firma";
  const [subject, setSubject] = React.useState(`Faktura ${invoice.number} od ${companyName}`);

  const totals = invoiceTotals(invoice);
  const formattedGross = formatMoney(totals.gross, invoice.currency);

  const defaultMessage = React.useMemo(() => {
    return (
      `Dzień dobry,\n\n` +
      `W załączniku przesyłamy fakturę VAT nr ${invoice.number} z dnia ${invoice.issueDate}.\n\n` +
      `• Kwota do zapłaty: ${formattedGross}\n` +
      `• Termin płatności: ${invoice.dueDate}\n` +
      (company?.bankAccount || company?.iban ? `• Numer konta: ${company.bankAccount || company.iban}\n` : "") +
      (invoice.ksef?.number ? `• Numer referencyjny KSeF: ${invoice.ksef.number}\n` : "") +
      `\nW razie pytań prosimy o kontakt.\n\n` +
      `Z poważaniem,\n${companyName}`
    );
  }, [invoice.number, invoice.issueDate, invoice.dueDate, invoice.ksef?.number, formattedGross, companyName, company?.bankAccount, company?.iban]);

  const [messageBody, setMessageBody] = React.useState(defaultMessage);
  const [attachPdf, setAttachPdf] = React.useState(true);
  const [attachXml, setAttachXml] = React.useState(Boolean(invoice.ksef?.number));

  // Ostatni status wysyłki
  const [lastSentAt, setLastSentAt] = React.useState<string | null>(invoice.sentAt || null);
  const [lastSentEmail, setLastSentEmail] = React.useState<string | null>(invoice.sentToEmail || null);

  // Aktualizacja e-maila kontrahenta, gdy zmieni się kontrahent w propsach
  React.useEffect(() => {
    if (contractor?.email && !recipientEmail) {
      setRecipientEmail(contractor.email);
    }
  }, [contractor?.email]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipientEmail || !recipientEmail.includes("@")) {
      toast("error", "Nieprawidłowy e-mail", "Podaj poprawny adres e-mail kontrahenta.");
      return;
    }

    if (!subject.trim()) {
      toast("error", "Brak tematu", "Wpisz temat wiadomości.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id || undefined,
          invoice: !invoice.id ? invoice : undefined,
          recipientEmail: recipientEmail.trim(),
          subject: subject.trim(),
          messageBody: messageBody.trim(),
          attachPdf,
          attachXml,
          sellerCompany: company,
          contractor,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errMsg = data.details || data.message || data.error || "Wystąpił błąd podczas wysyłki.";
        throw new Error(errMsg);
      }

      if (data.isDemo) {
        toast(
          "warning",
          "Tryb demonstracyjny",
          "Brak konfiguracji SMTP. Ustaw RESEND_API_KEY lub SMTP_HOST w zmiennych środowiskowych."
        );
      } else {
        toast(
          "success",
          "Faktura wysłana!",
          `Wysłano na: ${recipientEmail}${data.attachmentCount ? ` · ${data.attachmentCount} załącznik(i)` : ""}`
        );
      }

      const sentTime = data.sentAt || new Date().toISOString();
      setLastSentAt(sentTime);
      setLastSentEmail(recipientEmail);

      if (onSent) {
        onSent({ sentAt: sentTime, sentToEmail: recipientEmail });
      }
    } catch (err: any) {
      toast("error", "Błąd wysyłki", err.message || "Nie udało się wysłać wiadomości.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Wysyłka faktury e-mailem
                {lastSentAt && (
                  <Badge tone="success" className="text-[11px] font-normal">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Wysłano
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Wyślij fakturę bezpośrednio do kontrahenta w załączniku PDF (lub XML KSeF)
              </CardDescription>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground"
          >
            {expanded ? "Zwiń" : "Rozwiń"}
          </Button>
        </div>

        {lastSentAt && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Ostatnia wysyłka: <b>{new Date(lastSentAt).toLocaleString("pl-PL")}</b> na adres:{" "}
              <b>{lastSentEmail}</b>
            </span>
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent>
          <form onSubmit={handleSend} className="space-y-3.5">
            {/* Adresat */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="email-to" className="text-xs font-semibold">
                  E-mail odbiorcy: <span className="text-destructive">*</span>
                </Label>
                {contractor?.email && contractor.email !== recipientEmail && (
                  <button
                    type="button"
                    onClick={() => setRecipientEmail(contractor.email || "")}
                    className="text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Użyj e-mail kontrahenta ({contractor.email})
                  </button>
                )}
              </div>
              <Input
                id="email-to"
                type="email"
                required
                placeholder="np. ksiegowosc@klient.pl"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Temat */}
            <div>
              <Label htmlFor="email-subject" className="text-xs font-semibold mb-1 block">
                Temat wiadomości: <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email-subject"
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Treść */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="email-body" className="text-xs font-semibold">
                  Treść wiadomości:
                </Label>
                <button
                  type="button"
                  onClick={() => setMessageBody(defaultMessage)}
                  className="text-[11px] text-muted-foreground hover:underline"
                >
                  Przywróć domyślny szablon
                </button>
              </div>
              <Textarea
                id="email-body"
                rows={4}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                className="text-xs font-mono leading-relaxed"
              />
            </div>

            {/* Opcje załączników */}
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
              <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-blue-500" /> Załączniki do wiadomości:
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={attachPdf}
                    onChange={(e) => setAttachPdf(e.target.checked)}
                    className="rounded border-input text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span>Dołącz plik PDF faktury</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={attachXml}
                    onChange={(e) => setAttachXml(e.target.checked)}
                    className="rounded border-input text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span className="flex items-center gap-1">
                    <FileCode2 className="h-3.5 w-3.5 text-amber-500" /> Dołącz plik XML KSeF / FA(3)
                  </span>
                </label>
              </div>
            </div>

            {/* Przycisk wysyłki */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="submit"
                loading={loading}
                className="w-full sm:w-auto min-w-[160px]"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {loading ? "Wysyłanie..." : "Wyślij fakturę"}
              </Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
