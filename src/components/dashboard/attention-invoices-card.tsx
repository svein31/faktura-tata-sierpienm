"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileEdit,
  FileText,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, invoiceTotals } from "@/lib/format";
import { getContractor, useAppStore } from "@/lib/store";
import { todayISO } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

export function AttentionInvoicesCard({ invoices }: { invoices: Invoice[] }) {
  const { contractors } = useAppStore();
  const today = todayISO();
  const [filter, setFilter] = React.useState<"all" | "rejected" | "overdue" | "queued" | "draft">("all");

  // Filtrowanie faktur wymagających uwagi
  const items = React.useMemo(() => {
    return invoices
      .map((inv) => {
        const isRejected = inv.ksefStatus === "rejected" || (inv.status as string) === "ksef_rejected";
        const isQueued = inv.ksefStatus === "queued" || inv.ksefStatus === "sending" || inv.ksefStatus === "verify_needed" || inv.status === "ksef_sent";
        const isOverdue = inv.paymentStatus === "overdue" || (inv.status !== "paid" && Boolean(inv.dueDate && inv.dueDate < today));
        const isDraft = inv.documentStatus === "draft" || inv.status === "draft";

        let reason = "";
        let priority = 0; // wyższy = pilniejszy
        let type: "rejected" | "overdue" | "queued" | "draft" | null = null;

        if (isRejected) {
          reason = "Odrzucona przez KSeF — wymaga korekty danych";
          priority = 4;
          type = "rejected";
        } else if (isOverdue) {
          const daysOverdue = Math.max(1, Math.floor((new Date(today).getTime() - new Date(inv.dueDate).getTime()) / 86400000));
          reason = `Przeterminowana płatność (${daysOverdue} dni po terminie)`;
          priority = 3;
          type = "overdue";
        } else if (isQueued) {
          reason = "W kolejce do wysłania do KSeF";
          priority = 2;
          type = "queued";
        } else if (isDraft) {
          reason = "Wersja robocza oczekująca na dokończenie";
          priority = 1;
          type = "draft";
        }

        return {
          invoice: inv,
          reason,
          priority,
          type,
        };
      })
      .filter((item) => item.type !== null)
      .sort((a, b) => b.priority - a.priority || b.invoice.issueDate.localeCompare(a.invoice.issueDate));
  }, [invoices, today]);

  const filteredItems = React.useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.type === filter);
  }, [items, filter]);

  const counts = React.useMemo(() => {
    return {
      all: items.length,
      rejected: items.filter((i) => i.type === "rejected").length,
      overdue: items.filter((i) => i.type === "overdue").length,
      queued: items.filter((i) => i.type === "queued").length,
      draft: items.filter((i) => i.type === "draft").length,
    };
  }, [items]);

  return (
    <Card className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-foreground">
                Lista faktur wymagających uwagi
              </h2>
              {counts.all > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  {counts.all}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Dokumenty odrzucone przez KSeF, zaległości płatnicze i otwarte szkice
            </p>
          </div>
        </div>

        {/* Filtr kategorii */}
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              filter === "all" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            Wszystkie ({counts.all})
          </button>
          {counts.rejected > 0 && (
            <button
              type="button"
              onClick={() => setFilter("rejected")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filter === "rejected" ? "bg-rose-500 text-white font-semibold shadow-2xs" : "text-rose-500 hover:bg-rose-500/10"
              }`}
            >
              KSeF Błąd ({counts.rejected})
            </button>
          )}
          {counts.overdue > 0 && (
            <button
              type="button"
              onClick={() => setFilter("overdue")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filter === "overdue" ? "bg-amber-500 text-white font-semibold shadow-2xs" : "text-amber-500 hover:bg-amber-500/10"
              }`}
            >
              Zaległe ({counts.overdue})
            </button>
          )}
          {counts.queued > 0 && (
            <button
              type="button"
              onClick={() => setFilter("queued")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filter === "queued" ? "bg-sky-500 text-white font-semibold shadow-2xs" : "text-sky-500 hover:bg-sky-500/10"
              }`}
            >
              Kolejka ({counts.queued})
            </button>
          )}
        </div>
      </div>

      {/* Lista elementów */}
      <div className="mt-3.5 divide-y divide-border/50 max-h-[360px] overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500 opacity-80" />
            <p className="mt-2 text-xs font-semibold text-foreground">Wszystko na bieżąco!</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Brak dokumentów wymagających natychmiastowej reakcji.
            </p>
          </div>
        ) : (
          filteredItems.slice(0, 8).map(({ invoice, reason, type }) => {
            const contractor = getContractor(contractors, invoice.contractorId);
            const totals = invoiceTotals(invoice);

            return (
              <div
                key={invoice.id}
                className="py-3 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 rounded-xl transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      type === "rejected"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                        : type === "overdue"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : type === "queued"
                        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {type === "rejected" ? (
                      <AlertOctagon className="h-4 w-4" />
                    ) : type === "overdue" ? (
                      <Clock className="h-4 w-4" />
                    ) : type === "queued" ? (
                      <RefreshCw className="h-4 w-4" />
                    ) : (
                      <FileEdit className="h-4 w-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="text-xs font-bold text-foreground hover:text-primary transition-colors"
                      >
                        {invoice.number || "Szkic bez numeru"}
                      </Link>
                      <span className="text-[11px] text-muted-foreground">·</span>
                      <span className="text-[11px] text-foreground/90 truncate max-w-[160px]">
                        {contractor?.name || "Kontrahent"}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.2 rounded border ${
                          type === "rejected"
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25"
                            : type === "overdue"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                            : type === "queued"
                            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {reason}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span>Termin: {formatDate(invoice.dueDate || invoice.issueDate)}</span>
                      <span>Kwota: <strong className="text-foreground tabular-nums">{formatMoney(invoice.totalGross ?? totals.gross, invoice.currency)}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-2.5 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors shadow-2xs"
                  >
                    <span>Rozwiąż</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {items.length > 8 && (
        <div className="mt-3 pt-2.5 border-t border-border/60 text-center">
          <Link
            href="/invoices"
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            <span>Zobacz wszystkie faktury wymagające uwagi ({items.length})</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </Card>
  );
}
