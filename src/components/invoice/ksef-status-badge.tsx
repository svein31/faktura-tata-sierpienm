import type { Invoice } from "@/lib/types";
import { ksefPresentation } from "@/lib/ksef/presentation";

export function KsefStatusBadge({ invoice }: { invoice: Invoice }) {
  const status = ksefPresentation(invoice);
  const color = status.tone === "success" ? "text-success dark:text-success border-success/25 bg-success/8"
    : status.tone === "error" ? "text-destructive dark:text-destructive border-destructive/25 bg-destructive/8"
    : status.tone === "pending" ? "text-warning dark:text-warning border-warning/25 bg-warning/8" : "text-muted-foreground border-border bg-muted/30";
  return <div className="min-w-0 space-y-1" title={status.detail}>
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium ${color}`}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />{status.label}
    </span>
    {status.number && <span className="block max-w-36 truncate font-mono text-[10px] text-muted-foreground" title={status.number}>{status.number}</span>}
    {status.environment && status.environment !== "production" && <span className="block text-[10px] text-muted-foreground">{status.simulated ? "Symulacja demo" : "Środowisko testowe"}</span>}
  </div>;
}
