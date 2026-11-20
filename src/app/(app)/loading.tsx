import { LoadingArea, Skeleton } from "@/components/ui/skeleton";

/** Shown instantly when you open a page, while its data loads. */
export default function Loading() {
  return (
    <LoadingArea>
      <Skeleton className="mb-2 h-9 w-56" />
      <Skeleton className="mb-6 h-5 w-72 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </LoadingArea>
  );
}
