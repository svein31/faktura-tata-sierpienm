import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" aria-label="FakturaProsto — strona główna" className={cn("flex items-center gap-3", className)}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700 text-white shadow-sm ring-1 ring-white/20">
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-background" />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold tracking-tight text-foreground">FakturaProsto</span>
          </div>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
            VAT &amp; KSeF 2.0
          </p>
        </div>
      )}
    </Link>
  );
}
