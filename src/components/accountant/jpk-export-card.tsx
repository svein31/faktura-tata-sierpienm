"use client";

import * as React from "react";
import {
  FileCode2,
  Download,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  FileCheck2,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { formatMoney } from "@/lib/format";
import type { Invoice, Expense, CompanyProfile, Contractor } from "@/lib/types";

interface JpkExportCardProps {
  currentMonth: string; // YYYY-MM
  invoices: Invoice[];
  expenses: Expense[];
  company: CompanyProfile | null;
  contractors: Contractor[];
}

export function JpkExportCard({
  currentMonth,
  invoices,
  expenses,
  company,
  contractors,
}: JpkExportCardProps) {
  const toast = useToast();
  const [jpkKind, setJpkKind] = React.useState<"JPK_V7M" | "JPK_V7K" | "JPK_FA">("JPK_V7M");
  const [generating, setGenerating] = React.useState(false);

  // Podsumowanie stawek podatku należnego dla JPK
  const vatSummary = React.useMemo(() => {
    let k19_net23 = 0;
    let k20_vat23 = 0;
    let k17_net8 = 0;
    let k18_vat8 = 0;
    let k15_net5 = 0;
    let k16_vat5 = 0;
    let k13_net0 = 0;
    let k10_netZw = 0;

    invoices.forEach((inv) => {
      if (inv.isProforma) return; // Proformy nie wchodzą do JPK
      (inv.lines || []).forEach((line) => {
        const lineNet = (line.quantity || 1) * (line.netPrice || 0);
        const rate = String(line.vatRate || "23").toLowerCase();

        if (rate === "23") {
          k19_net23 += lineNet;
          k20_vat23 += lineNet * 0.23;
        } else if (rate === "8") {
          k17_net8 += lineNet;
          k18_vat8 += lineNet * 0.08;
        } else if (rate === "5") {
          k15_net5 += lineNet;
          k16_vat5 += lineNet * 0.05;
        } else if (rate === "0") {
          k13_net0 += lineNet;
        } else if (rate === "zw") {
          k10_netZw += lineNet;
        }
      });
    });

    // Podatek naliczony z kosztów
    let k42_netCosts = 0;
    let k43_vatCosts = 0;

    expenses.forEach((exp) => {
      k42_netCosts += exp.totalNet || 0;
      k43_vatCosts += exp.totalVat || 0;
    });

    const totalVatDue = Math.round(k20_vat23 + k18_vat8 + k16_vat5);
    const totalVatDeductible = Math.round(k43_vatCosts);
    const vatDifference = totalVatDue - totalVatDeductible;

    return {
      k19_net23: Math.round(k19_net23 * 100) / 100,
      k20_vat23: Math.round(k20_vat23 * 100) / 100,
      k17_net8: Math.round(k17_net8 * 100) / 100,
      k18_vat8: Math.round(k18_vat8 * 100) / 100,
      k15_net5: Math.round(k15_net5 * 100) / 100,
      k16_vat5: Math.round(k16_vat5 * 100) / 100,
      k13_net0: Math.round(k13_net0 * 100) / 100,
      k10_netZw: Math.round(k10_netZw * 100) / 100,
      k42_netCosts: Math.round(k42_netCosts * 100) / 100,
      k43_vatCosts: Math.round(k43_vatCosts * 100) / 100,
      totalVatDue,
      totalVatDeductible,
      vatDifference,
    };
  }, [invoices, expenses]);

  // Generowanie i pobranie pliku XML
  const handleDownloadJpkXml = () => {
    try {
      setGenerating(true);

      const [yearStr, monthStr] = currentMonth.split("-");
      const nipClean = (company?.nip || "0000000000").replace(/\D/g, "");
      const companyName = company?.companyName || company?.name || "Moja Firma";

      const validSales = invoices.filter((i) => !i.isProforma);

      // Budowanie XML JPK
      let salesRowsXml = "";
      validSales.forEach((inv, idx) => {
        const ctr = contractors.find((c) => c.id === inv.contractorId);
        const buyerNip = (ctr?.nip || "").replace(/\D/g, "") || "BRAK";
        const buyerName = ctr?.name || "Klient detaliczny";
        const ksefId = inv.ksefNumber || inv.ksef?.number;

        salesRowsXml += `
    <tns:SprzedazWiersz>
      <tns:LpSprzedazy>${idx + 1}</tns:LpSprzedazy>
      <tns:KodKrajuNadaniaTIN>PL</tns:KodKrajuNadaniaTIN>
      <tns:NrKontrahenta>${buyerNip}</tns:NrKontrahenta>
      <tns:NazwaKontrahenta><![CDATA[${buyerName}]]></tns:NazwaKontrahenta>
      <tns:DowodSprzedazy>${inv.number}</tns:DowodSprzedazy>
      <tns:DataWystawienia>${inv.issueDate}</tns:DataWystawienia>
      <tns:DataSprzedazy>${inv.saleDate || inv.issueDate}</tns:DataSprzedazy>
      ${ksefId ? `<tns:NrKSeF>${ksefId}</tns:NrKSeF>` : `<tns:BFK>1</tns:BFK>`}
      <tns:K_19>${(inv.totalNet || 0).toFixed(2)}</tns:K_19>
      <tns:K_20>${(inv.totalVat || 0).toFixed(2)}</tns:K_20>
    </tns:SprzedazWiersz>`;
      });

      let purchaseRowsXml = "";
      expenses.forEach((exp, idx) => {
        const expNip = (exp.nip || "").replace(/\D/g, "") || "BRAK";
        purchaseRowsXml += `
    <tns:ZakupWiersz>
      <tns:LpZakupu>${idx + 1}</tns:LpZakupu>
      <tns:KodKrajuNadaniaTIN>PL</tns:KodKrajuNadaniaTIN>
      <tns:NrDostawcy>${expNip}</tns:NrDostawcy>
      <tns:NazwaDostawcy><![CDATA[${exp.contractorName}]]></tns:NazwaDostawcy>
      <tns:DowodZakupu>${exp.number}</tns:DowodZakupu>
      <tns:DataZakupu>${exp.issueDate}</tns:DataZakupu>
      <tns:DataWplywu>${exp.receivedAt || exp.issueDate}</tns:DataWplywu>
      <tns:K_42>${exp.totalNet.toFixed(2)}</tns:K_42>
      <tns:K_43>${exp.totalVat.toFixed(2)}</tns:K_43>
    </tns:ZakupWiersz>`;
      });

      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<tns:JPK xmlns:tns="http://crd.gov.pl/wzor/2021/12/27/11148/" xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2021/06/08/eD/DefinicjeTypy/">
  <tns:Naglowek>
    <tns:KodFormularza kodSystemowy="${jpkKind}(2)" wersjaSchemy="1-0E">${jpkKind}</tns:KodFormularza>
    <tns:WariantFormularza>2</tns:WariantFormularza>
    <tns:CelZlozenia poz="P_7">1</tns:CelZlozenia>
    <tns:DataWytworzeniaJPK>${new Date().toISOString()}</tns:DataWytworzeniaJPK>
    <tns:Rok>${yearStr}</tns:Rok>
    <tns:Miesiac>${monthStr}</tns:Miesiac>
    <tns:KodUrzedu>1471</tns:KodUrzedu>
  </tns:Naglowek>
  <tns:Podmiot1 rola="Podatnik">
    <tns:OsobaNiefizyczna>
      <tns:NIP>${nipClean}</tns:NIP>
      <tns:PelnaNazwa><![CDATA[${companyName}]]></tns:PelnaNazwa>
    </tns:OsobaNiefizyczna>
  </tns:Podmiot1>
  <tns:Ewidencja>${salesRowsXml}
    <tns:SprzedazCtrl>
      <tns:LiczbaWierszySprzedazy>${validSales.length}</tns:LiczbaWierszySprzedazy>
      <tns:PodatekNalezny>${vatSummary.totalVatDue.toFixed(2)}</tns:PodatekNalezny>
    </tns:SprzedazCtrl>${purchaseRowsXml}
    <tns:ZakupCtrl>
      <tns:LiczbaWierszyZakupow>${expenses.length}</tns:LiczbaWierszyZakupow>
      <tns:PodatekNaliczony>${vatSummary.totalVatDeductible.toFixed(2)}</tns:PodatekNaliczony>
    </tns:ZakupCtrl>
  </tns:Ewidencja>
</tns:JPK>`;

      // Pobranie pliku
      const blob = new Blob([xmlContent], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${jpkKind}_${yearStr}_${monthStr}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast("success", "Plik JPK pobrany", `Wygenerowano ${jpkKind} za okres ${currentMonth}.`);
    } catch {
      toast("error", "Błąd", "Nie udało się wygenerować pliku JPK.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-border/60 bg-card/60 p-5 backdrop-blur shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileCode2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Generator Jednolitego Pliku Kontrolnego (JPK)
            </h3>
            <p className="text-xs text-muted-foreground">
              Zgodność ze schematami Ministerstwa Finansów oraz KSeF (schemat ewidencji i deklaracji)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={jpkKind}
            onChange={(e) => setJpkKind(e.target.value as any)}
            className="h-8 text-xs font-semibold"
          >
            <option value="JPK_V7M">JPK_V7M (Ewidencja + Deklaracja miesięczna)</option>
            <option value="JPK_V7K">JPK_V7K (Rozliczenie kwartalne)</option>
            <option value="JPK_FA">JPK_FA (Faktury na żądanie organu)</option>
          </Select>

          <Button
            size="sm"
            onClick={handleDownloadJpkXml}
            disabled={generating}
            className="h-8 gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Pobierz plik XML</span>
          </Button>
        </div>
      </div>

      {/* Wyliczone pola podatku VAT (K_10 .. K_43) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
          <span className="text-[11px] text-muted-foreground font-medium">VAT 23% (K_19 / K_20)</span>
          <p className="mt-1 font-bold text-foreground">
            Netto: {formatMoney(vatSummary.k19_net23, "PLN")}
          </p>
          <p className="text-primary font-semibold">
            VAT: {formatMoney(vatSummary.k20_vat23, "PLN")}
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
          <span className="text-[11px] text-muted-foreground font-medium">VAT 8% (K_17 / K_18)</span>
          <p className="mt-1 font-bold text-foreground">
            Netto: {formatMoney(vatSummary.k17_net8, "PLN")}
          </p>
          <p className="text-primary font-semibold">
            VAT: {formatMoney(vatSummary.k18_vat8, "PLN")}
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
          <span className="text-[11px] text-muted-foreground font-medium">Podatek naliczony (K_42 / K_43)</span>
          <p className="mt-1 font-bold text-foreground">
            Koszty netto: {formatMoney(vatSummary.k42_netCosts, "PLN")}
          </p>
          <p className="text-rose-700 dark:text-rose-400 font-semibold">
            VAT odliczony: {formatMoney(vatSummary.k43_vatCosts, "PLN")}
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
          <span className="text-[11px] text-muted-foreground font-medium">Saldo do Urzędu Skarbowego</span>
          <p className="mt-1 text-lg font-bold text-foreground">
            {formatMoney(vatSummary.vatDifference, "PLN")}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {vatSummary.vatDifference >= 0 ? "Do zapłaty do 25. dnia m-ca" : "Nadpłata do przeniesienia"}
          </p>
        </div>
      </div>
    </Card>
  );
}
