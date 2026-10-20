"use client";

import * as React from "react";
import {
  History,
  FileText,
  CreditCard,
  Send,
  Edit,
  Clock,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuditLogEntry } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

const ACTION_META: Record<
  string,
  { label: string; icon: any; badgeClass: string }
> = {
  invoice_created: {
    label: "Wystawiono fakturę",
    icon: FileText,
    badgeClass: "bg-success/10 text-success border-success/20",
  },
  invoice_updated: {
    label: "Modyfikacja danych",
    icon: Edit,
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  invoice_deleted: {
    label: "Usunięto szkic",
    icon: AlertCircle,
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
  },
  payment_registered: {
    label: "Zarejestrowano wpłatę",
    icon: CreditCard,
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  ksef_sent: {
    label: "Przekazano do KSeF",
    icon: Send,
    badgeClass: "bg-success/10 text-success border-success/20",
  },
  email_sent: {
    label: "Wysłano e-mail",
    icon: Send,
    badgeClass: "bg-info/10 text-info border-info/20",
  },
};

export function InvoiceHistoryTab({ invoiceId }: { invoiceId: string }) {
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchLogs = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/audit?documentId=${invoiceId}`);
      if (!res.ok) throw new Error("Nie udało się pobrać historii dokumentu.");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (loading) {
    return (
      <Card className="p-8 text-center text-xs text-muted-foreground">
        <Clock className="w-5 h-5 mx-auto mb-2 animate-spin text-primary" />
        Ładowanie historii zdarzeń...
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center text-xs text-destructive bg-destructive/5 border-destructive/20">
        <AlertCircle className="w-5 h-5 mx-auto mb-2" />
        {error}
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card className="p-8 text-center text-xs text-muted-foreground space-y-2">
        <ShieldCheck className="w-6 h-6 mx-auto text-muted-foreground/60" />
        <p className="font-semibold text-foreground">Brak wpisów w dzienniku audytu</p>
        <p>Wszystkie przyszłe operacje (edycje, rejestracje wpłat, wysyłka do KSeF) będą trwale rejestrowane.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-border shadow-xs space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Dziennik audytu dokumentu ({logs.length})
          </h3>
        </div>
        <Badge tone="outline" className="text-[10.5px] gap-1 font-mono text-muted-foreground">
          <ShieldCheck className="w-3 h-3 text-success" />
          Trwały &amp; niezmienny
        </Badge>
      </div>

      <div className="relative pl-6 border-l-2 border-border/70 space-y-6">
        {logs.map((log) => {
          const meta = ACTION_META[log.action] || {
            label: log.action,
            icon: History,
            badgeClass: "bg-muted text-muted-foreground border-border",
          };
          const Icon = meta.icon;

          return (
            <div key={log.id} className="relative group">
              {/* Kropka na osi czasu */}
              <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-card border-2 border-primary flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${meta.badgeClass}`}>
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDateTime(log.createdAt)}
                  </span>
                  <span className="text-muted-foreground/60 text-xs">·</span>
                  <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                    {log.userName || log.userEmail || "System"}
                  </span>
                </div>

                {log.description && (
                  <p className="text-xs text-foreground font-medium">{log.description}</p>
                )}

                {/* Diff starych i nowych wartości */}
                {log.diff && Object.keys(log.diff).length > 0 && (
                  <div className="mt-2 p-3 bg-muted/40 rounded-xl border border-border/80 text-[11.5px] space-y-1.5 font-mono">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground font-sans tracking-wider">
                      Zarejestrowane zmiany parametrów:
                    </p>
                    <div className="space-y-1">
                      {Object.entries(log.diff).map(([key, d]) => (
                        <div key={key} className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground font-sans">
                            {d.label || key}:
                          </span>
                          <span className="line-through text-destructive">
                            {String(d.old ?? "brak")}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="font-bold text-success dark:text-success">
                            {String(d.new ?? "brak")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dodatkowe szczegóły techniczne */}
                {log.details && (
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                    {log.details.ksefNumber && (
                      <span>Nr KSeF: <b className="font-mono text-success dark:text-success">{log.details.ksefNumber}</b></span>
                    )}
                    {log.details.amount && (
                      <span>Kwota: <b>{log.details.amount} {log.details.currency || "PLN"}</b></span>
                    )}
                    {log.details.paymentStatus && (
                      <span>Status płatności: <b>{log.details.paymentStatus}</b></span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
