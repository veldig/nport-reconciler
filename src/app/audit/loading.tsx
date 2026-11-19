import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading audit log">
      <Skeleton className="mb-2 h-7 w-40" />
      <Skeleton className="mb-6 h-4 w-[28rem] max-w-full" />
      <div className="space-y-px overflow-hidden rounded-lg border border-rule">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-none" />
        ))}
      </div>
    </div>
  );
}
