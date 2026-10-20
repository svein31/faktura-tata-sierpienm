import { Skeleton, StatsSkeleton } from "@/components/ui/skeleton";

/** Shared server-rendered fallback for data bootstrap and route transitions. */
export function AppLoadingSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Ładowanie danych">
      {/* Nagłówek — natychmiast widoczna struktura */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-36 rounded-lg" />
          <Skeleton className="h-3.5 w-56 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      {/* Metryki — subtelne karty */}
      <StatsSkeleton count={4} />

      {/* Tabela — cienkie linie imitujące wiersze */}
      <div className="rounded-xl border border-border/40 bg-card  overflow-hidden">
        <div className="border-b border-border/30 bg-muted/20 px-4 py-3 flex items-center justify-between">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <div className="p-4 space-y-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2.5 border-b border-border/20 last:border-0">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">Ładowanie danych…</p>
    </div>
  );
}
