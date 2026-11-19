import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading exceptions">
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-6 h-4 w-[32rem] max-w-full" />
      <div className="mb-3 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-36" />
        ))}
      </div>
      <div className="space-y-px overflow-hidden rounded-lg border border-rule">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-none" />
        ))}
      </div>
    </div>
  );
}
