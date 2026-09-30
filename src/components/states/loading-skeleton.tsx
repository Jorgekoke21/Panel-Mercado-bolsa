import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto genérico de página de terminal: tira superior + rejilla de paneles. */
export function LoadingSkeleton({ panels = 4 }: { panels?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2 p-2">
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: panels }, (_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
