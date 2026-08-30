import { StatsSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-muted/60" />
        <div className="h-4 w-72 rounded-lg bg-muted/40" />
      </div>
      <StatsSkeleton count={4} />
      <TableSkeleton rows={4} />
    </div>
  );
}
