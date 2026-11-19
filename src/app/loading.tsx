import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading overview">
      <Skeleton className="mb-2 h-7 w-72" />
      <Skeleton className="mb-8 h-4 w-96" />
      <div className="mb-8 grid gap-px overflow-hidden rounded-lg border border-rule md:grid-cols-2">
        <Skeleton className="h-56 rounded-none" />
        <Skeleton className="h-56 rounded-none" />
      </div>
      <Skeleton className="mb-3 h-5 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
