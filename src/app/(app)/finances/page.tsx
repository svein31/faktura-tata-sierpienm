"use client";
import { PendingTransactions } from "@/components/banking/pending-transactions";
import { TransferPack } from "@/components/banking/transfer-pack";
import { isAccountingInvoice } from "@/lib/accountant-summary";

import { useCompanyInvoices } from "@/lib/use-company-invoices";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Upload,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Check,
  Search,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/page-header";
import { formatDate, formatMoney } from "@/lib/format";
import type { BankStatementTransaction, Invoice } from "@/lib/types";

export default function FinancesPage() {
  const toast = useToast();
  const { contractors, revalidate, selectedCompanyId } = useAppStore();
  const invoices = useCompanyInvoices();

  const [importModalOpen, setImportModalOpen] = React.useState(false);
  const [csvContent, setCsvContent] = React.useState("");
  const [bankFormat, setBankFormat] = React.useState("generic");
  const [importing, setImporting] = React.useState(false);
  const [matchedTransactions, setMatchedTransactions] = React.useState<BankStatementTransaction[]>([]);
  React.useEffect(() => { setImportModalOpen(false); setMatchedTransactions([]); setCsvContent(""); setStep("upload"); }, [selectedCompanyId]);
  const [step, setStep] = React.useState<"upload" | "preview">("upload");

  // Wyliczenie Aging (starzenie należności)
  const now = new Date();
  const aging = React.useMemo(() => {
    let current = { count: 0, sum: 0 };
    let days1to30 = { count: 0, sum: 0 };
    let days31to60 = { count: 0, sum: 0 };
    let daysOver60 = { count: 0, sum: 0 };

    const unpaidSales = invoices.filter(
      (i) => isAccountingInvoice(i) && i.currency === "PLN" && i.type === "sale" && (i.paymentStatus === "unpaid" || i.paymentStatus === "partially_paid")
    );

    for (const inv of unpaidSales) {
      const gross = inv.totalGross || 0;
      const unpaid = Math.max(0, gross - (inv.paidAmount || 0));
      const dueDate = new Date(inv.dueDate);
      const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);

      if (diffDays <= 0) {
        current.count++;
        current.sum += unpaid;
      } else if (diffDays <= 30) {
        days1to30.count++;
        days1to30.sum += unpaid;
      } else if (diffDays <= 60) {
        days31to60.count++;
        days31to60.sum += unpaid;
      } else {
        daysOver60.count++;
        daysOver60.sum += unpaid;
      }
    }

    return { current, days1to30, days31to60, daysOver60 };
  }, [invoices, now]);

  // Przychody i wydatki bieżącego miesiąca
  const currentMonth = now.toISOString().slice(0, 7);
  const monthlyRevenue = invoices
    .filter((i) => isAccountingInvoice(i) && i.currency === "PLN" && i.type === "sale" && i.issueDate.startsWith(currentMonth))
    .reduce((sum, i) => sum + (i.totalGross || 0), 0);

  const monthlyCosts = invoices
    .filter((i) => isAccountingInvoice(i) && i.currency === "PLN" && i.type === "purchase" && i.issueDate.startsWith(currentMonth))
    .reduce((sum, i) => sum + (i.totalGross || 0), 0);

  const monthlyBalance = monthlyRevenue - monthlyCosts;

  const handleParseCsv = async () => {
    if (!selectedCompanyId) { toast("error", "Wybierz firmę", "Import wyciągu wymaga wskazania firmy."); return; }
    if (!csvContent.trim()) {
      toast("error", "Błąd", "Wklej treść pliku CSV lub wybierz plik.");
      return;
    }

    const importCompanyId = selectedCompanyId;
    setImporting(true);
    try {
      const res = await fetch("/api/banking/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvContent,
          bankFormat,
          companyId: selectedCompanyId,
          applyPayments: false,
        }),
      });

      const data = await res.json();
      if (useAppStore.getState().selectedCompanyId !== importCompanyId) return;
      if (res.ok && data.transactions) {
        setMatchedTransactions(data.transactions);
        setStep("preview");
        toast("info", "Rozpoznano transakcje", `Dopasowano ${data.matchedCount} z ${data.rowCount} operacji.`);
      } else {
        toast("error", "Błąd importu", data.error || "Nie udało się sparsować pliku.");
      }
    } catch {
      toast("error", "Błąd", "Wystąpił problem z połączeniem.");
    } finally {
      setImporting(false);
    }
  };

  const handleApplyPayments = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/banking/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvContent,
          bankFormat,
          companyId: selectedCompanyId,
          applyPayments: true,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast(
          "success",
          "Zaksięgowano wpłaty",
          `Rozliczono ${data.appliedCount} płatności. Pominięto wcześniej zapisane operacje: ${data.skippedCount || 0}.`
        );
        setImportModalOpen(false);
        setStep("upload");
        setCsvContent("");
        if (revalidate) revalidate();
      } else {
        toast("error", "Błąd księgowania", data.error || "Nie udało się zaksięgować wpłat.");
      }
    } catch {
      toast("error", "Błąd", "Wystąpił problem z połączeniem.");
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
    };
    reader.readAsText(file, "UTF-8");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanse i Rozliczenia"
        description="Analiza starzenia należności (Aging), bilans przepływów pieniężnych oraz rozliczenie wyciągów CSV, MT940 i camt.053. Podsumowania poniżej dotyczą dokumentów PLN."
        actions={
          <Button onClick={() => setImportModalOpen(true)} className="rounded-xl gap-2 shadow-xs">
            <Upload className="h-4 w-4" /> Importuj wyciąg
          </Button>
        }
      />

      {/* Podsumowanie finansowe (Bieżący miesiąc) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Przychody ({now.toLocaleDateString("pl-PL", { month: "long" })})
            </p>
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {formatMoney(monthlyRevenue, "PLN")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Faktury sprzedaży wystawione w tym miesiącu</p>
        </Card>

        <Card className="p-4 bg-rose-500/5 border-rose-500/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
              Koszty ({now.toLocaleDateString("pl-PL", { month: "long" })})
            </p>
            <ArrowDownLeft className="h-4 w-4 text-rose-500" />
          </div>
          <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-400">
            {formatMoney(monthlyCosts, "PLN")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Faktury zakupowe i wydatki firmowe</p>
        </Card>

        <Card className="p-4 bg-card/60 backdrop-blur-md border-border/70">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Różnica brutto</p>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <p className={`mt-1 text-2xl font-bold ${monthlyBalance >= 0 ? "text-foreground" : "text-rose-700"}`}>
            {formatMoney(monthlyBalance, "PLN")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Różnica brutto między sprzedażą a zakupami</p>
        </Card>
      </div>

      {/* Raport starzenia należności (Aging Raport) */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Analiza starzenia należności (Aging Report)</h3>
          <p className="text-xs text-muted-foreground">Monitoruj przeterminowane płatności od kontrahentów wg przedziałów czasowych</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Card className="p-3.5 bg-emerald-500/5 border-emerald-500/25">
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Przed terminem (bieżące)</p>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
              {formatMoney(aging.current.sum, "PLN")}
            </p>
            <p className="text-[10.5px] text-muted-foreground">{aging.current.count} faktur z nieprzekroczonym terminem</p>
          </Card>

          <Card className="p-3.5 bg-amber-500/5 border-amber-500/25">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">1 – 30 dni po terminie</p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-300 mt-0.5">
              {formatMoney(aging.days1to30.sum, "PLN")}
            </p>
            <p className="text-[10.5px] text-muted-foreground">{aging.days1to30.count} faktur wymagających upomnienia</p>
          </Card>

          <Card className="p-3.5 bg-orange-500/5 border-orange-500/25">
            <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-300">31 – 60 dni po terminie</p>
            <p className="text-lg font-bold text-orange-700 dark:text-orange-300 mt-0.5">
              {formatMoney(aging.days31to60.sum, "PLN")}
            </p>
            <p className="text-[10.5px] text-muted-foreground">{aging.days31to60.count} faktur – wezwanie do zapłaty</p>
          </Card>

          <Card className="p-3.5 bg-rose-500/5 border-rose-500/25">
            <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">&gt; 60 dni po terminie</p>
            <p className="text-lg font-bold text-rose-700 dark:text-rose-300 mt-0.5">
              {formatMoney(aging.daysOver60.sum, "PLN")}
            </p>
            <p className="text-[10.5px] text-muted-foreground">{aging.daysOver60.count} faktur krytycznych</p>
          </Card>
        </div>
      </div>

      {/* Lista nieopłaconych faktur sprzedaży */}
      <Card className="p-4 border-border/70 bg-card/70 backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-xs text-foreground">Oczekujące należności od klientów</h4>
            <p className="text-[11px] text-muted-foreground">Faktury sprzedaży o statusie nieopłacone lub opłacone częściowo</p>
          </div>
          <Link prefetch={false} href="/invoices">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Wszystkie faktury →
            </Button>
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2.5 px-3">Faktura</th>
                <th className="py-2.5 px-3">Kontrahent</th>
                <th className="py-2.5 px-3">Termin płatności</th>
                <th className="py-2.5 px-3 text-right">Do zapłaty</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {invoices
                .filter((i) => i.type === "sale" && i.paymentStatus !== "paid")
                .slice(0, 8)
                .map((inv) => {
                  const ctr = contractors.find((c) => c.id === inv.contractorId);
                  const remaining = Math.max(0, (inv.totalGross || 0) - (inv.paidAmount || 0));
                  const isOverdue = new Date(inv.dueDate) < now;
                  return (
                    <tr key={inv.id} className="hover:bg-muted/20">
                      <td className="py-2.5 px-3 font-semibold">
                        <Link prefetch={false} href={`/invoices/${inv.id}`} className="hover:underline text-primary">
                          {inv.number}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3">{ctr?.name || "Klient"}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        <span className={isOverdue ? "text-rose-700 font-semibold" : ""}>
                          {formatDate(inv.dueDate)} {isOverdue ? "(po terminie)" : ""}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                        {formatMoney(remaining, inv.currency)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge tone={isOverdue ? "danger" : "warning"} className="text-[10px]">
                          {isOverdue ? "Zaległa" : "Oczekuje"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link prefetch={false} href={`/invoices/${inv.id}`}>
                          <Button variant="outline" size="sm" className="h-7 text-[11px] px-2">
                            Szczegóły / Wpłata
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <TransferPack />
      <PendingTransactions />
      {/* Modal importu wyciągu bankowego CSV */}
      <Dialog
        open={importModalOpen}
        onClose={() => {
          setImportModalOpen(false);
          setStep("upload");
          setCsvContent("");
        }}
        title="Import wyciągu bankowego"
        description="Wczytaj wyciąg bankowy ze swojego banku, a system automatycznie połączy wpłaty z wystawionymi fakturami."
        size="lg"
        footer={
          step === "upload" ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={() => setImportModalOpen(false)}>
                Anuluj
              </Button>
              <Button onClick={handleParseCsv} loading={importing} className="gap-2 font-semibold">
                Dalej: Rozpoznaj transakcje →
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("upload")}>
                ← Wróć do pliku
              </Button>
              <Button onClick={handleApplyPayments} loading={importing} className="gap-2 font-semibold">
                Zaksięguj dopasowane wpłaty ({matchedTransactions.filter((t) => t.matchedInvoiceId || t.matchedExpenseId).length})
              </Button>
            </div>
          )
        }
      >
        {step === "upload" ? (
          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label>Wybierz bank (lub uniwersalny CSV)</Label>
              <Select value={bankFormat} onChange={(e) => setBankFormat(e.target.value)}>
                <option value="mt940">MT940 / SWIFT</option><option value="camt053">ISO 20022 camt.053 (XML)</option><option value="generic">Uniwersalny format CSV (automatyczne wykrywanie)</option>
                <option value="mbank">mBank (CSV z historii operacji)</option>
                <option value="pko">PKO BP / Inteligo (CSV)</option>
                <option value="ing">ING Bank Śląski (CSV)</option>
                <option value="santander">Santander Bank Polska (CSV)</option>
                <option value="millennium">Bank Millennium (CSV)</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Wczytaj plik CSV, MT940 lub XML</Label>
              <Input type="file" accept=".csv,.sta,.mt940,.xml,text/csv,application/xml" onChange={handleFileUpload} className="h-9 cursor-pointer" />
            </div>

            <div className="space-y-1.5">
              <Label>Lub wklej zawartość CSV bezpośrednio</Label>
              <Textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder="Wklej wiersze wyciągu CSV..."
                rows={6}
                className="font-mono text-[11px]"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-xs">
            <div className="flex items-center justify-between bg-primary/10 rounded-xl p-3 text-foreground">
              <span>
                Wykryto operacje: <b>{matchedTransactions.length}</b>. Dopasowano do faktur:{" "}
                <b className="text-emerald-700 dark:text-emerald-400">
                  {matchedTransactions.filter((t) => t.matchedInvoiceId || t.matchedExpenseId).length}
                </b>
              </span>
            </div>

            <div className="max-h-[340px] overflow-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[620px] text-left text-[11.5px]">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-md">
                  <tr className="border-b border-border/60 text-muted-foreground uppercase text-[10px]">
                    <th className="p-2.5">Data</th>
                    <th className="p-2.5">Nadawca & Tytuł</th>
                    <th className="p-2.5 text-right">Kwota</th>
                    <th className="p-2.5 text-right">Dopasowana faktura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {matchedTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/20">
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">{tx.date}</td>
                      <td className="p-2.5">
                        <p className="font-semibold text-foreground truncate max-w-[200px]">{tx.senderName || "—"}</p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[240px]">{tx.title}</p>
                      </td>
                      <td className="p-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatMoney(tx.amount, tx.currency || "PLN")}
                      </td>
                      <td className="p-2.5 text-right">
                        {tx.matchedInvoiceNumber ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <Check className="h-3 w-3" /> {tx.matchedInvoiceNumber}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10.5px] italic">Brak dopasowania</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-muted-foreground">Po potwierdzeniu zapiszesz operacje i rozliczysz jednoznaczne dopasowania. Niejednoznaczne transakcje pozostaną nierozliczone.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
