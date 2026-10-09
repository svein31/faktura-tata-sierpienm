"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Repeat,
  Plus,
  Play,
  Pause,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Mail,
  Send,
  Calendar,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { useCompanyInvoices } from "@/lib/use-company-invoices";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useToast } from "@/components/toast";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

const INTERVAL_LABELS: Record<string, string> = {
  weekly: "Co tydzień",
  monthly: "Co miesiąc (MRR)",
  quarterly: "Co kwartał",
  yearly: "Co rok (ARR)",
};

export default function RecurringInvoicesPage() {
  const router = useRouter();
  const toast = useToast();
  const { contractors, applyInvoice, selectedCompanyId } = useAppStore();
  const allInvoices = useCompanyInvoices();

  const [processingId, setProcessingId] = React.useState<string | null>(null);

  // Filtrujemy tylko szablony cykliczne
  const recurringTemplates = React.useMemo(() => {
    return allInvoices.filter((inv) => inv.isRecurring);
  }, [allInvoices]);

  // Statystyki cykli
  const stats = React.useMemo(() => {
    let activeCount = 0;
    let pausedCount = 0;
    let monthlyVolume = 0;

    recurringTemplates.forEach((t) => {
      const gross = t.totalGross || 0;
      if (t.recurringPaused) {
        pausedCount++;
      } else {
        activeCount++;
        if (t.recurringInterval === "monthly" || !t.recurringInterval) {
          monthlyVolume += gross;
        } else if (t.recurringInterval === "quarterly") {
          monthlyVolume += gross / 3;
        } else if (t.recurringInterval === "yearly") {
          monthlyVolume += gross / 12;
        } else if (t.recurringInterval === "weekly") {
          monthlyVolume += gross * 4.33;
        }
      }
    });

    return {
      total: recurringTemplates.length,
      activeCount,
      pausedCount,
      monthlyVolume,
    };
  }, [recurringTemplates]);

  // Wstrzymanie / Wznowienie cyklu
  const handleTogglePause = async (template: Invoice) => {
    const newPaused = !template.recurringPaused;
    setProcessingId(template.id);
    try {
      const res = await fetch(`/api/invoices/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...template,
          recurringPaused: newPaused,
        }),
      });

      if (!res.ok) throw new Error("Błąd zapisu statusu cyklu");
      const updated = await res.json();

      // Aktualizacja store
      applyInvoice(updated);

      toast(
        "success",
        newPaused ? "Cykl wstrzymany" : "Cykl wznowiony",
        `Szablon ${template.number} został ${newPaused ? "wstrzymany" : "aktywowany"}.`
      );
    } catch {
      toast("error", "Błąd", "Nie udało się zaktualizować statusu cyklu.");
    } finally {
      setProcessingId(null);
    }
  };

  // Ręczne wygenerowanie faktury z szablonu "Wystaw teraz"
  const handleGenerateNow = async (template: Invoice) => {
    setProcessingId(template.id);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const randomSuffix = Math.floor(Math.random() * 899 + 100);
      const newNumber = `FV/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${randomSuffix}`;

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "vat",
          number: newNumber,
          contractorId: template.contractorId,
          sellerCompanyId: template.sellerCompanyId || selectedCompanyId,
          issueDate: todayIso,
          saleDate: todayIso,
          dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          currency: template.currency || "PLN",
          language: template.language || "pl",
          paymentMethod: template.paymentMethod || "transfer",
          paymentTermDays: template.paymentTermDays || 14,
          lines: template.lines || [],
          totalNet: template.totalNet,
          totalVat: template.totalVat,
          totalGross: template.totalGross,
          notes: `Wygenerowano automatycznie z szablonu cyklicznego: ${template.number}`,
          status: "issued",
          isRecurring: false, // Nowo wygenerowany dokument to pojedyncza faktura
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Błąd generowania faktury");
      }

      const createdInvoice = await res.json();
      applyInvoice(createdInvoice);

      toast(
        "success",
        "Faktura wygenerowana",
        `Pomyślnie wystawiono fakturę ${createdInvoice.number} na podstawie szablonu.`
      );

      router.push(`/invoices/${createdInvoice.id}`);
    } catch (err: any) {
      toast("error", "Błąd wystawiania", err.message || "Nie udało się wygenerować faktury.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faktury cykliczne & Subskrypcje (MRR)"
        description="Automatyczne generowanie i wysyłka faktur w stałych interwałach (miesięcznych, kwartalnych, rocznych)."
        actions={
          <div className="flex items-center gap-2">
            <Link prefetch={false} href="/invoices">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border/70">
                <FileText className="h-3.5 w-3.5" />
                <span>Wszystkie faktury</span>
              </Button>
            </Link>
            <Link prefetch={false} href="/invoices/new" onClick={() => useAppStore.getState().setDraft(null, true)}>
              <Button size="sm" className="gap-1.5 text-xs shadow-sm">
                <Plus className="h-4 w-4" />
                <span>Nowy szablon cykliczny</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Pigułki metryk MRR */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-border/70 bg-card/75 p-4.5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-apple-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Szablony aktywne</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
              <Repeat className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
            <AnimatedCounter value={stats.activeCount} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Wstrzymane cykle: <span className="font-semibold text-foreground">{stats.pausedCount}</span>
          </p>
        </Card>

        <Card className="border border-border/70 bg-card/75 p-4.5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-apple-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Miesięczny przychód (MRR)</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-primary">
            <AnimatedCounter value={stats.monthlyVolume} format={(v: number) => formatMoney(v, "PLN")} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Szacowany obrót powtarzalny
          </p>
        </Card>

        <Card className="border border-border/70 bg-card/75 p-4.5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-apple-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Roczny przychód (ARR)</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-indigo-700 dark:text-indigo-400">
            <AnimatedCounter value={stats.monthlyVolume * 12} format={(v: number) => formatMoney(v, "PLN")} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Prognoza na 12 miesięcy
          </p>
        </Card>

        <Card className="border border-border/70 bg-card/75 p-4.5 backdrop-blur-md rounded-2xl shadow-apple-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-apple-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Automatyzacja</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 ring-1 ring-inset ring-purple-500/20">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <p className="text-lg font-bold tracking-tight text-foreground">
            Auto-send KSeF & E-mail
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Wysyłka w nocy w dniu terminu
          </p>
        </Card>
      </div>

      {/* Lista szablonów cyklicznych */}
      <Card className="border border-border/70 bg-card/75 backdrop-blur-md rounded-2xl shadow-apple-sm overflow-hidden">
        <div className="p-4 border-b border-border/60 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Zdefiniowane szablony subskrypcyjne</h3>
            <p className="text-xs text-muted-foreground">
              Dokumenty generowane automatycznie wg ustalonego harmonogramu
            </p>
          </div>
          <Badge tone="primary" className="text-xs">
            {recurringTemplates.length} szablonów
          </Badge>
        </div>

        {recurringTemplates.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Brak zdefiniowanych faktur cyklicznych"
            description="Faktury cykliczne pozwalają automatycznie wystawiać dokumenty dla stałych klientów (np. abonamenty, hosting, opieka IT, wynajem)."
            action={
              <Link prefetch={false} href="/invoices/new" onClick={() => useAppStore.getState().setDraft(null, true)}>
                <Button size="sm" className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Stwórz pierwszy szablon</span>
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/50 bg-muted/30 text-muted-foreground font-medium">
                <tr>
                  <th className="py-3 px-4">Numer szablonu</th>
                  <th className="py-3 px-4">Nabywca / Kontrahent</th>
                  <th className="py-3 px-4">Interwał</th>
                  <th className="py-3 px-4">Kwota brutto</th>
                  <th className="py-3 px-4">Kolejne wystawienie</th>
                  <th className="py-3 px-4">Status & Opcje</th>
                  <th className="py-3 px-4 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recurringTemplates.map((template) => {
                  const contractor = contractors.find((c) => c.id === template.contractorId);
                  const isPaused = Boolean(template.recurringPaused);
                  const isProcessing = processingId === template.id;

                  return (
                    <tr key={template.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Repeat className="h-3.5 w-3.5" />
                          </span>
                          <span>{template.number}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-foreground">{contractor?.name || "Kontrahent"}</div>
                        <div className="text-[11px] text-muted-foreground">NIP: {contractor?.nip || "—"}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge tone="default" className="text-[10px]">
                          {INTERVAL_LABELS[template.recurringInterval || "monthly"] || template.recurringInterval}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-foreground">
                        {formatMoney(template.totalGross || 0, template.currency || "PLN")}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{formatDate(template.recurringNextDate || template.issueDate)}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium",
                              isPaused
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                            )}
                          >
                            {isPaused ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                            <span>{isPaused ? "Wstrzymany" : "Aktywny"}</span>
                          </span>

                          {template.recurringAutoSend && (
                            <span
                              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              title="Wysyłka e-mail i KSeF automatycznie"
                            >
                              <Mail className="h-3 w-3" />
                              <span>Auto</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isProcessing}
                            onClick={() => handleTogglePause(template)}
                            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            {isPaused ? "Wznów" : "Wstrzymaj"}
                          </Button>

                          <Button
                            size="sm"
                            disabled={isProcessing}
                            onClick={() => handleGenerateNow(template)}
                            className="h-7 gap-1 px-2.5 text-[11px] font-semibold"
                          >
                            <Send className="h-3 w-3" />
                            <span>Wystaw teraz</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
