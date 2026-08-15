import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 text-white shadow-sm">
        <FileText className="h-4 w-4" strokeWidth={2.2} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="text-[15px] font-bold tracking-tight">Fakturo</p>
          <p className="text-[10.5px] font-medium uppercase tracking-widest text-muted-foreground">
            Faktury &amp; KSeF
          </p>
        </div>
      )}
    </div>
  );
}
