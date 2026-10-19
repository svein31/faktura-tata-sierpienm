import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return <div role="status" aria-label="Wczytywanie przeglądu" className="space-y-6">
    <div className="surface-card p-5 sm:p-6 space-y-5"><Skeleton className="h-5 w-40" />{[0, 1, 2].map(i => <div key={i} className="flex h-16 items-center justify-between gap-5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-20" /></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="surface-card p-5 sm:p-6 space-y-4"><Skeleton className="h-4 w-48" /><Skeleton className="h-9 w-40" /><Skeleton className="h-[260px] w-full" /></div>
      <div className="surface-card p-5 sm:p-6 space-y-5"><Skeleton className="h-5 w-24" /><Skeleton className="h-9 w-16" /><Skeleton className="h-4 w-40" /></div>
    </div>
    <Skeleton className="h-14 w-full rounded-2xl" />
    <span className="sr-only">Wczytywanie przeglądu…</span>
  </div>;
}
