import { LoadingArea, Skeleton } from "@/components/ui/skeleton";

/** Switching between a project's tabs: the header stays, the tab content shows this while loading. */
export default function Loading() {
  return (
    <LoadingArea>
      <div className="grid gap-2">
        <Skeleton className="h-10 w-48" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </LoadingArea>
  );
}
