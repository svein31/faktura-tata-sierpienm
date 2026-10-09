"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import {
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  TrendingUp,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Percent,
  Lock,
  Unlock,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { formatMoney, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Contractor } from "@/lib/types";

interface ContractorCrmDrawerProps {
  contractor: Contractor | null;
  onClose: () => void;
}

export function ContractorCrmDrawer({ contractor, onClose }: ContractorCrmDrawerProps) {
  const toast = useToast();
  const { updateContractor, selectedCompanyId } = useAppStore();
  type Summary = { invoices:{id:string;number:string;issueDate:string;dueDate:string;status:string;paymentStatus:string|null;totalGross:number|null;currency:string}[]; sales:{currency:string;count:number;turnover:number;overdue:number}[];balances:{currency:string;receivable:number;payable:number}[] };
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [summaryError, setSummaryError] = React.useState("");
  React.useEffect(() => {
    if (!contractor) return;
    const controller = new AbortController();
    setSummary(null); setSummaryError("");
    fetch(`/api/contractors/${contractor.id}/history?companyId=${encodeURIComponent(selectedCompanyId||"unassigned")}&type=sale`, {signal:controller.signal,cache:"no-store"})
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||"Nie udało się pobrać kartoteki.");return body as Summary;})
      .then(body=>{if(!controller.signal.aborted)setSummary(body);})
      .catch(error=>{if(!controller.signal.aborted)setSummaryError(error instanceof Error?error.message:"Błąd połączenia.");});
    return ()=>controller.abort();
  }, [contractor?.id, selectedCompanyId]);

  const [saving, setSaving] = React.useState(false);
  const [creditLimit, setCreditLimit] = React.useState<number>(contractor?.creditLimit || 0);
  const [creditBlocking, setCreditBlocking] = React.useState<boolean>(contractor?.creditLimitBlocking || false);

  React.useEffect(() => {
    if (contractor) {
      setCreditLimit(contractor.creditLimit || 0);
      setCreditBlocking(contractor.creditLimitBlocking || false);
    }
  }, [contractor]);

  if (!contractor) return null;

  // Faktury dla tego kontrahenta
  const contractorInvoices = summary?.invoices || [];

  // Wyliczenia analityczne
  const totalGrossTurnover = summary?.sales.find(s=>s.currency==="PLN")?.turnover || 0;
  const unpaidGrossTotal = summary?.balances.find(b=>b.currency==="PLN")?.receivable || 0;
  const overdueCount = summary?.sales.reduce((sum,s)=>sum+s.overdue,0) || 0;
  const salesCount = summary?.sales.reduce((sum,s)=>sum+s.count,0) || 0;

  // Scoring wiarygodności płatniczej (A / B / C / D)
  let scoreGrade: "A" | "B" | "C" | "D" = "A";
  let scoreLabel = "Wzorowy partner";
  let scoreTone: "success" | "info" | "warning" | "danger" = "success";

  if (overdueCount > 2 || (creditLimit > 0 && unpaidGrossTotal > creditLimit)) {
    scoreGrade = "D";
    scoreLabel = "Wysokie ryzyko płatnicze";
    scoreTone = "danger";
  } else if (overdueCount > 0) {
    scoreGrade = "C";
    scoreLabel = "Sporadyczne opóźnienia";
    scoreTone = "warning";
  } else if (salesCount > 3) {
    scoreGrade = "A";
    scoreLabel = "Wzorowa terminowość (100%)";
    scoreTone = "success";
  } else {
    scoreGrade = "B";
    scoreLabel = "Dobra historia (początkowy)";
    scoreTone = "info";
  }

  // Wykorzystanie limitu kupieckiego
  const limitUsagePercent = creditLimit > 0 ? Math.min(100, Math.round((unpaidGrossTotal / creditLimit) * 100)) : 0;
  const isLimitExceeded = creditLimit > 0 && unpaidGrossTotal > creditLimit;

  // Zapis zmian limitu kupieckiego
  const handleSaveLimit = async () => {
    try {
      setSaving(true);
      await updateContractor(contractor.id, {
        creditLimit,
        creditLimitBlocking: creditBlocking,
      });
      toast("success", "Limit zaktualizowany", "Zapisano nowe parametry limitu kupieckiego w CRM.");
    } catch {
      toast("error", "Błąd zapisu", "Nie udało się zaktualizować parametrów kontrahenta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(contractor)} onClose={onClose} title={contractor.name} description={`NIP: ${contractor.nip} · CRM 360°`} size="lg">
          {!summary && !summaryError && <p role="status" className="mt-2 text-xs text-muted-foreground">Wczytywanie danych kontrahenta…</p>}
          {summaryError && <p role="alert" className="mt-2 text-xs text-destructive">{summaryError}</p>}

          <div className="mt-4 min-w-0 space-y-4 break-words">
            {/* 1. Karta Scoringu Płatniczego */}
            <Card className="border-border/60 bg-card/60 p-4 backdrop-blur shadow-sm">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Scoring Wiarygodności Płatniczej
                </span>
                <Badge tone={scoreTone} className="font-bold text-xs">
                  Klasa {scoreGrade}
                </Badge>
              </div>

              <div className="mt-3 flex min-w-0 items-start gap-3">
                <div
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-black border shadow-inner",
                    scoreGrade === "A" && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                    scoreGrade === "B" && "bg-sky-500/15 text-sky-400 border-sky-500/30",
                    scoreGrade === "C" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                    scoreGrade === "D" && "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  )}
                >
                  {scoreGrade}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{scoreLabel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Na podstawie {salesCount} wystawionych dokumentów.
                    {overdueCount > 0
                      ? ` Liczba przeterminowanych faktur: ${overdueCount}.`
                      : " Brak przeterminowanych należności."}
                  </p>
                </div>
              </div>
            </Card>

            {/* 2. Pasek Limitu Kupieckiego */}
            <Card className="border-border/60 bg-card/60 p-4 backdrop-blur shadow-sm space-y-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Limit Kupiecki & Blokada
                  </span>
                </div>
                {isLimitExceeded && (
                  <Badge tone="danger" className="text-[10px] animate-pulse">
                    Przekroczono limit!
                  </Badge>
                )}
              </div>

              {creditLimit > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Wykorzystano: <b className="text-foreground">{formatMoney(unpaidGrossTotal, "PLN")}</b>
                    </span>
                    <span className="font-semibold text-foreground">
                      Limit: {formatMoney(creditLimit, "PLN")} ({limitUsagePercent}%)
                    </span>
                  </div>

                  {/* Pasek postępu */}
                  <div className="h-2.5 w-full rounded-full bg-muted/40 overflow-hidden border border-border/40">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        limitUsagePercent > 90
                          ? "bg-rose-500"
                          : limitUsagePercent > 60
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      )}
                      style={{ width: `${limitUsagePercent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Dla tego kontrahenta nie zdefiniowano jeszcze limitu odroczonej płatności.
                </p>
              )}

              {/* Formularz edycji limitu */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border/40 pt-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Kwota limitu (PLN)</Label>
                  <Input
                    type="number"
                    value={creditLimit || ""}
                    onChange={(e) => setCreditLimit(Number(e.target.value))}
                    placeholder="np. 15000"
                    className="h-8 text-xs mt-1"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex min-h-11 items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={creditBlocking}
                      onChange={(e) => setCreditBlocking(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                    <span className="text-[11px]">Blokuj nowe faktury po przekroczeniu</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={handleSaveLimit} disabled={saving} className="h-7 text-xs px-3 font-medium">
                  {saving ? "Zapisywanie..." : "Zapisz limit w CRM"}
                </Button>
              </div>
            </Card>

            {/* 3. Podsumowanie Obrotów */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border-border/60 bg-card/60 p-3.5 backdrop-blur">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Łączny obrót
                </span>
                <p className="mt-1 text-xl font-bold tracking-tight text-foreground">
                  {formatMoney(totalGrossTurnover, "PLN")}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Faktury sprzedaży w PLN
                </p>
              </Card>

              <Card className="border-border/60 bg-card/60 p-3.5 backdrop-blur">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Bieżący dług (nieopłacone)
                </span>
                <p className={cn(
                  "mt-1 text-xl font-bold tracking-tight",
                  unpaidGrossTotal > 0 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {formatMoney(unpaidGrossTotal, "PLN")}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Do uregulowania przez klienta
                </p>
              </Card>
            </div>

            {/* 4. Ostatnie Faktury Kontrahenta */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Ostatnie dokumenty ({salesCount})
                </h4>
                <Link prefetch={false}
                  href={`/invoices?search=${encodeURIComponent(contractor.nip)}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <span>Wszystkie</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {contractorInvoices.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                  Brak wystawionych faktur dla tego partnera.
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {contractorInvoices.slice(0, 5).map((inv) => (
                    <div
                      key={inv.id}
                      className="flex min-w-0 flex-col gap-2 rounded-xl sm:flex-row sm:justify-between border border-border/50 bg-card/50 p-3 text-xs hover:border-border transition-colors"
                    >
                      <div>
                        <Link prefetch={false} href={`/invoices/${inv.id}`} className="font-semibold text-foreground hover:text-primary">
                          {inv.number}
                        </Link>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Data: {formatDate(inv.issueDate)} · termin: {formatDate(inv.dueDate)}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="font-bold text-foreground">
                          {formatMoney(inv.totalGross || 0, inv.currency || "PLN")}
                        </p>
                        <Badge
                          tone={inv.status === "paid" ? "success" : "warning"}
                          className="text-[10px] mt-0.5"
                        >
                          {inv.status === "paid" ? "Opłacona" : "Do zapłaty"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
    </Dialog>
  );
}
