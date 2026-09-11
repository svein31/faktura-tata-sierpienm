"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatMoney,
  invoiceTotals,
  lineGross,
  lineNet,
  lineVat,
  vatRateLabel,
} from "@/lib/format";
import { invoiceLabels, paymentMethodLabel } from "@/lib/i18n";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";
import { QRCodeSVG } from "qrcode.react";
export function buildQrPayload(invoice: Invoice, contractor: Contractor | undefined, company: CompanyProfile): string {
  const t = invoiceTotals(invoice);
  const iban = (invoice.type === "sale" ? (company.bankAccount || company.iban) : contractor?.iban) ?? "";
  const recipient = invoice.type === "sale" ? (company.companyName || company.name || "") : (contractor?.name ?? "");
  return [
    "SPL",
    "PL",
    "TRANSFER",
    iban.replace(/\s/g, ""),
    t.gross.toFixed(2),
    invoice.currency,
    invoice.number,
    recipient,
  ].join("|");
}

export function InvoicePreview({
  invoice,
  contractor,
  company,
  className,
}: {
  invoice: Invoice;
  contractor: Contractor | undefined;
  company: CompanyProfile;
  className?: string;
}) {
  const L = invoiceLabels[invoice.language];
  const t = invoiceTotals(invoice);

  const compName = company.companyName || company.name || "—";
  const seller = invoice.type === "sale" ? company : contractor;
  const buyer = invoice.type === "sale" ? contractor : company;
  const streetPart = [company.street, company.buildingNumber].filter(Boolean).join(" ");
  const compStreet = company.flatNumber ? `${streetPart}/${company.flatNumber}` : (streetPart || company.street || "");
  const compCity = company.city || "";
  const compPostal = company.postalCode || company.postal || "";
  const compCountry = company.country || "PL";
  const compIban = company.bankAccount || company.iban || "";

  const sellerName = invoice.type === "sale" ? compName : (contractor?.name ?? "—");
  const buyerName = invoice.type === "sale" ? (contractor?.name ?? "—") : compName;
  const sellerAddr =
    invoice.type === "sale"
      ? { street: compStreet, city: compCity, postal: compPostal, country: compCountry }
      : contractor?.address;
  const buyerAddr =
    invoice.type === "sale"
      ? contractor?.address
      : { street: compStreet, city: compCity, postal: compPostal, country: compCountry };
  const sellerNip = invoice.type === "sale" ? company.nip : (contractor?.nip ?? "—");
  const buyerNip = invoice.type === "sale" ? (contractor?.nip ?? "—") : company.nip;
  const sellerRegon = invoice.type === "sale" ? (company.regon ?? "") : (contractor?.regon ?? "");
  const buyerRegon = invoice.type === "sale" ? (contractor?.regon ?? "") : (company.regon ?? "");

  const showQr =
    invoice.paymentMethod === "transfer" &&
    (invoice.type === "sale" ? compIban : contractor?.iban);

  const logoUrl = invoice.type === "sale" ? company.logoUrl : undefined;

  return (
    <div className={cn("invoice-paper overflow-hidden p-6 sm:p-8", className)}>
      {/* Nagłówek */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            <div className="flex shrink-0 items-center justify-center rounded-xl border border-border/60 bg-white p-2 max-w-[170px] max-h-[75px] shadow-xs">
              <img
                src={logoUrl}
                alt={sellerName}
                className="max-h-14 max-w-full object-contain"
              />
            </div>
          ) : null}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-gradient">
                {invoice.isCorrection
                  ? "FAKTURA KORYGUJĄCA (KOR)"
                  : invoice.isProforma
                    ? "FAKTURA PROFORMA"
                    : invoice.type === "purchase"
                      ? L.purchaseDoc
                      : L.saleDoc}
              </span>
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {invoice.isProforma ? "DOKUMENT PŁATNICZY" : L.originals}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {L.invoiceNo}: <span className="font-semibold text-foreground">{invoice.number}</span>
            </p>

            {invoice.isCorrection && (
              <div className="mt-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-900 dark:text-rose-200">
                <p className="font-bold">Korekta do faktury: {invoice.originalInvoiceNumber || "FA/ORYG"} z dnia {invoice.originalIssueDate || invoice.issueDate}</p>
                <p className="mt-0.5 text-muted-foreground">Przyczyna: {invoice.correctionReason || "Korekta pozycji faktury"}</p>
                {invoice.originalKsefNumber && (
                  <p className="font-mono text-[11px] text-muted-foreground">Nr KSeF oryginału: {invoice.originalKsefNumber}</p>
                )}
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">{L.issueDate}: </span>
                <span className="font-medium">{formatDate(invoice.issueDate)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{L.saleDate}: </span>
                <span className="font-medium">{formatDate(invoice.saleDate)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{L.dueDate}: </span>
                <span className="font-medium">{formatDate(invoice.dueDate)}</span>
              </div>
            </div>
            {(invoice.ksefNumber || invoice.ksef?.number) && (
              <p className="mt-1.5 text-[11px] text-muted-foreground font-mono">
                Numer w KSeF: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{invoice.ksefNumber || invoice.ksef?.number}</span>
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[12px] font-semibold text-foreground">{L.currency}: {invoice.currency}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {L.paymentMethod}: {paymentMethodLabel(invoice.paymentMethod, invoice.language)}
            <span className="ml-1 text-muted-foreground/70">({invoice.paymentTermDays} dni)</span>
          </p>
        </div>
      </div>

      {/* Sprzedawca / Nabywca */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-accent">{L.seller}</p>
          <p className="text-[13.5px] font-semibold">{sellerName}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            {sellerAddr?.street}
            <br />
            {sellerAddr?.postal} {sellerAddr?.city}
            <br />
            {sellerAddr?.country}
          </p>
          <p className="mt-1.5 text-[12px]">
            {L.nip}: <span className="font-medium">{sellerNip}</span>
            {sellerRegon && <span className="ml-2 text-muted-foreground">{L.regon}: {sellerRegon}</span>}
          </p>
          {seller && "email" in seller && seller.email && (
            <p className="text-[12px] text-muted-foreground">{seller.email}</p>
          )}
        </div>
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">{L.buyer}</p>
          <p className="text-[13.5px] font-semibold">{buyerName}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            {buyerAddr?.street}
            <br />
            {buyerAddr?.postal} {buyerAddr?.city}
            <br />
            {buyerAddr?.country}
          </p>
          <p className="mt-1.5 text-[12px]">
            {L.nip}: <span className="font-medium">{buyerNip}</span>
            {buyerRegon && <span className="ml-2 text-muted-foreground">{L.regon}: {buyerRegon}</span>}
          </p>
          {contractor?.isVatPayer !== undefined && invoice.type === "sale" && (
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {L.payerVatPayer}: {contractor.isVatPayer ? L.vatPayer : L.vatNonPayer}
            </p>
          )}
        </div>
      </div>

      {/* Pozycje */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">{L.item}</th>
              <th className="py-2 pr-2 text-center">{L.qty}</th>
              <th className="py-2 pr-2 text-center">{L.unit}</th>
              <th className="py-2 pr-2 text-right">{L.net}</th>
              <th className="py-2 pr-2 text-center">{L.vatRate}</th>
              <th className="py-2 pr-2 text-right">{L.vatAmount}</th>
              <th className="py-2 text-right">{L.gross}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={line.id} className="border-b border-border/60">
                <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                <td className="py-2 pr-2 font-medium">{line.name}</td>
                <td className="py-2 pr-2 text-center">{line.quantity}</td>
                <td className="py-2 pr-2 text-center text-muted-foreground">{line.unit}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(lineNet(line), invoice.currency)}</td>
                <td className="py-2 pr-2 text-center">{vatRateLabel(line.vatRate)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(lineVat(line), invoice.currency)}</td>
                <td className="py-2 text-right font-medium tabular-nums">{formatMoney(lineGross(line), invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sumy */}
      <div className="mt-4 flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {invoice.notes && (
            <div className="mt-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{L.notes}</p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{invoice.notes}</p>
            </div>
          )}
          <div className="mt-4 rounded-lg border border-border/80 bg-muted/30 p-3.5 text-[12px]">
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {L.paymentMethod}: {paymentMethodLabel(invoice.paymentMethod, invoice.language)}
            </p>
            {invoice.paymentMethod === "transfer" && (
              <>
                <p>
                  {L.account}: <span className="font-mono font-medium">{invoice.type === "sale" ? compIban : (contractor?.iban ?? "—")}</span>
                </p>
                {invoice.type === "sale" && (
                  <p className="text-muted-foreground">
                    {L.bank}: {company.bankName}
                  </p>
                )}
              </>
            )}
            <p className="mt-1 text-muted-foreground">
              {L.invoiceNo}: {invoice.number} · {L.dueDate}: {formatDate(invoice.dueDate)}
            </p>
          </div>
          <p className="mt-5 text-center text-[11px] italic text-muted-foreground">
            {L.signature}: ___________________________
          </p>
        </div>

        <div className="w-full shrink-0 sm:w-64">
          <div className="space-y-1.5 rounded-lg border border-border p-3.5 text-[12.5px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{L.totalNet}</span>
              <span className="font-medium tabular-nums">{formatMoney(t.net, invoice.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{L.totalVat}</span>
              <span className="font-medium tabular-nums">{formatMoney(t.vat, invoice.currency)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 text-[13.5px] font-bold">
              <span>{L.totalGross}</span>
              <span className="tabular-nums">{formatMoney(t.gross, invoice.currency)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-primary/10 px-2 py-1.5 text-[13px] font-bold text-primary">
              <span>{L.toPay}</span>
              <span className="tabular-nums">{formatMoney(t.gross, invoice.currency)}</span>
            </div>
          </div>
          {showQr && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-border p-3">
              <QRCodeSVG
                value={buildQrPayload(invoice, contractor, company)}
                size={72}
                bgColor="transparent"
                fgColor="currentColor"
                level="M"
              />
              <div className="text-[11px] leading-snug text-muted-foreground">
                <p className="font-semibold text-foreground">QR — płatność</p>
                <p>Skanuj, aby zapłacić przelewem (format SPL, demo).</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 border-t border-border pt-3 text-center text-[10.5px] text-muted-foreground">
        Fakturo · {L.invoice} {invoice.number} · {L.currency}: {invoice.currency} ·{" "}
        {new Date().toLocaleDateString("pl-PL")}
      </p>
    </div>
  );
}
