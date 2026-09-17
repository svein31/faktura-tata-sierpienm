"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Send,
  ShieldCheck,
  AlertOctagon,
  FileEdit,
  Download,
  FileCode2,
  RefreshCw,
  QrCode,
  Info,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Invoice } from "@/lib/types";

interface TimelineStep {
  id: "draft" | "queued" | "sent" | "accepted" | "upo";
  label: string;
  description: string;
  timestamp?: string | null;
  state: "completed" | "current" | "pending" | "error";
  details?: string;
}

interface InvoiceStatusTimelineProps {
  invoice: Invoice;
  onRefreshStatus?: () => void;
  onDownloadUpo?: (ksefNumber: string) => void;
  onDownloadXml?: (ksefNumber: string) => void;
  isRefreshing?: boolean;
}

export function InvoiceStatusTimeline({
  invoice,
  onRefreshStatus,
  onDownloadUpo,
  onDownloadXml,
  isRefreshing = false,
}: InvoiceStatusTimelineProps) {
  const prefersReducedMotion = useReducedMotion();
  const ksefNum = invoice.ksef?.number || invoice.ksefNumber;
  const isKsefRejected = invoice.ksefStatus === "rejected" || (invoice.status as string) === "ksef_rejected";
  const isKsefQueued = invoice.ksefStatus === "queued" || (invoice.status as string) === "ksef_sent";
  const isKsefSending = invoice.ksefStatus === "sending" || invoice.ksefStatus === "verify_needed";
  const isKsefAccepted = Boolean(ksefNum) || invoice.ksefStatus === "accepted" || invoice.status === "ksef_active";
  const hasUpo = Boolean(invoice.upoXml || ksefNum);
  const isProforma = Boolean(invoice.isProforma);
  const isOffline = Boolean(invoice.isOffline);

  // Budowa 5 kroków osi czasu
  const steps: TimelineStep[] = React.useMemo(() => {
    // 1. Szkic
    const draftState: TimelineStep["state"] = "completed";

    // 2. Kolejka KSeF
    let queuedState: TimelineStep["state"] = "pending";
    if (isKsefRejected) queuedState = "completed";
    else if (isKsefAccepted || hasUpo) queuedState = "completed";
    else if (isKsefSending) queuedState = "completed";
    else if (isKsefQueued) queuedState = "current";

    // 3. Wysłano do bramki
    let sentState: TimelineStep["state"] = "pending";
    if (isKsefRejected) sentState = "error";
    else if (isKsefAccepted || hasUpo) sentState = "completed";
    else if (isKsefSending) sentState = "current";

    // 4. 200 OK (Przetworzono)
    let acceptedState: TimelineStep["state"] = "pending";
    if (isKsefRejected) acceptedState = "error";
    else if (isKsefAccepted || hasUpo) acceptedState = "completed";

    // 5. UPO pobrane
    let upoState: TimelineStep["state"] = "pending";
    if (isKsefRejected) upoState = "error";
    else if (hasUpo) upoState = "completed";
    else if (isKsefAccepted) upoState = "current";

    return [
      {
        id: "draft",
        label: "Szkic roboczy",
        description: "Dokument utworzony w systemie",
        timestamp: invoice.createdAt,
        state: draftState,
        details: `Wersja v${invoice.version || 1}`,
      },
      {
        id: "queued",
        label: "Kolejka KSeF",
        description: "Kolejka serwerowa zadań MF",
        timestamp: invoice.sentAt ? formatDateTime(invoice.sentAt) : undefined,
        state: queuedState,
        details: isKsefQueued ? "Oczekuje na wolny slot bramki" : undefined,
      },
      {
        id: "sent",
        label: "Wysłano do bramki",
        description: "Transmisja schematu FA(3)",
        timestamp: invoice.sentAt ? formatDateTime(invoice.sentAt) : undefined,
        state: sentState,
        details: invoice.referenceNumber ? `Ref: ${invoice.referenceNumber.slice(0, 16)}…` : undefined,
      },
      {
        id: "accepted",
        label: "200 OK — Przetworzono",
        description: "Brak błędów semantycznych MF",
        timestamp: invoice.ksef?.sentAt || invoice.sentAt ? formatDateTime(invoice.ksef?.sentAt || invoice.sentAt!) : undefined,
        state: acceptedState,
        details: isKsefRejected ? "Odrzucono przez Ministerstwo Finansów" : "Walidacja schematu XSD poprawna",
      },
      {
        id: "upo",
        label: "UPO pobrane",
        description: "Oficjalny numer e-Faktury",
        timestamp: invoice.ksef?.sentAt ? formatDateTime(invoice.ksef?.sentAt) : undefined,
        state: upoState,
        details: ksefNum ? `Nr KSeF: ${ksefNum.slice(0, 18)}…` : undefined,
      },
    ];
  }, [invoice, ksefNum, isKsefRejected, isKsefQueued, isKsefSending, isKsefAccepted, hasUpo]);

  // Liczba ukończonych kroków do paska postępu
  const completedCount = steps.filter((s) => s.state === "completed").length;
  const progressPercent = (completedCount / steps.length) * 100;

  if (isProforma) {
    return (
      <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 text-xs">
        <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-semibold">
          <Info className="h-4 w-4" />
          <span>Dokument Proforma — brak rejestracji w KSeF</span>
        </div>
        <p className="mt-1 text-muted-foreground text-[11.5px]">
          Faktura proforma nie stanowi dokumentu księgowego ani fiskalnego i nie jest przesyłana do Krajowego Systemu e-Faktur. Po opłaceniu możesz przekształcić ją jednym kliknięciem w ostateczną Fakturę VAT.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">Wizualna oś czasu KSeF 2.0</h3>
            {ksefNum && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                <ShieldCheck className="h-3 w-3" />
                <span>200 OK &amp; UPO</span>
              </span>
            )}
            {isOffline && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                <QrCode className="h-3 w-3" />
                <span>Tryb offline / QR</span>
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            Ścieżka przetwarzania: Szkic roboczy → Kolejka → Bramka MF → Walidacja 200 OK → Urzędowe Poświadczenie Odbioru
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRefreshStatus && (
            <button
              type="button"
              onClick={onRefreshStatus}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-primary" : "text-muted-foreground"}`} />
              <span>{isRefreshing ? "Sprawdzanie..." : "Sprawdź status"}</span>
            </button>
          )}

          {ksefNum && onDownloadUpo && (
            <button
              type="button"
              onClick={() => onDownloadUpo(ksefNum)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors shadow-2xs cursor-pointer"
            >
              <Download className="h-3 w-3" />
              <span>UPO (XML)</span>
            </button>
          )}
        </div>
      </div>

      {/* Komunikat błędu jeśli odrzucono (delikatny shake) */}
      {isKsefRejected && (
        <motion.div
          initial={prefersReducedMotion ? false : { x: 0 }}
          animate={prefersReducedMotion ? {} : { x: [0, -4, 4, -4, 4, 0] }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
        >
          <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Dokument odrzucony przez bramkę KSeF</p>
            <p className="text-[11px] text-rose-600/90 dark:text-rose-300/90 mt-0.5">
              Wykryto niezgodność ze schematem FA(3) lub nieprawidłowy NIP/podpis. Popraw dokument w kreatorze i ponów wysyłkę.
            </p>
          </div>
        </motion.div>
      )}

      {/* Animowany pasek postępu osi czasu */}
      <div className="mt-4 mb-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50 border border-border/50">
          <motion.div
            initial={prefersReducedMotion ? false : { width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={`h-full rounded-full transition-colors ${
              isKsefRejected ? "bg-rose-500" : "bg-emerald-500"
            }`}
          />
        </div>
      </div>

      {/* Oś czasu krok po kroku */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-3 relative">
        {steps.map((step, idx) => {
          const isDone = step.state === "completed";
          const isCurrent = step.state === "current";
          const isError = step.state === "error";

          return (
            <div key={step.id} className="relative flex flex-col justify-between rounded-xl border border-border/60 bg-muted/20 p-3">
              {/* Łącznik liniowy na desktopie */}
              {idx < steps.length - 1 && (
                <div
                  className={`hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 h-0.5 w-3 z-10 ${
                    isDone ? "bg-emerald-500" : "bg-border/80"
                  }`}
                />
              )}

              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                      isDone
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : isCurrent
                        ? "bg-primary/20 text-primary border border-primary/40"
                        : isError
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                        : "bg-muted/60 text-muted-foreground border border-border/50"
                    }`}
                  >
                    {isDone ? (
                      <motion.div
                        initial={prefersReducedMotion ? false : { scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </motion.div>
                    ) : isError ? (
                      <AlertOctagon className="h-4 w-4 text-rose-500" />
                    ) : isCurrent ? (
                      /* Pulsujące kropki shimmer dla statusu w toku / w kolejce */
                      <div className="flex items-center gap-0.5">
                        <motion.span
                          animate={prefersReducedMotion ? {} : { opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                          className="h-1 w-1 rounded-full bg-primary"
                        />
                        <motion.span
                          animate={prefersReducedMotion ? {} : { opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.2, ease: "easeInOut" }}
                          className="h-1 w-1 rounded-full bg-primary"
                        />
                        <motion.span
                          animate={prefersReducedMotion ? {} : { opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.4, ease: "easeInOut" }}
                          className="h-1 w-1 rounded-full bg-primary"
                        />
                      </div>
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </div>

                  <span
                    className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                      isDone
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : isCurrent
                        ? "bg-primary/10 text-primary"
                        : isError
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground/60"
                    }`}
                  >
                    {isDone ? "Sukces" : isCurrent ? "W toku" : isError ? "Błąd" : "Oczekuje"}
                  </span>
                </div>

                <p className="text-xs font-bold text-foreground leading-snug">
                  {step.label}
                </p>
                <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-relaxed">
                  {step.description}
                </p>
              </div>

              {step.details && (
                <p className="text-[10px] font-mono text-foreground/80 mt-2 truncate pt-1 border-t border-border/40">
                  {step.details}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
