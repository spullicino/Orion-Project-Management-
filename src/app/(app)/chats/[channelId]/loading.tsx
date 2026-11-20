import { LoadingArea, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingArea label="Loading messages">
      <div className="grid gap-4 p-4">
        {["w-3/5", "w-2/5", "w-3/4", "w-1/2", "w-1/3"].map((w, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className={`h-10 ${w}`} />
            </div>
          </div>
        ))}
      </div>
    </LoadingArea>
  );
}
