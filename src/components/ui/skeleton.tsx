import { cn } from "@/lib/utils";

/** Grey placeholder shapes shown while a page loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} aria-hidden />;
}

/** Announces loading to screen readers; the shapes inside are decorative. */
export function LoadingArea({ children, label = "Loading" }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
