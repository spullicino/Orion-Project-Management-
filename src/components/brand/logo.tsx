import { cn } from "@/lib/utils";

/**
 * Placeholder Orion mark (three "belt" stars). Replace /public/brand/orion-mark.svg
 * with the official logo when available; this component picks it up automatically.
 */
export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/orion-mark.svg" alt="" width={36} height={36} className="size-9 rounded-[10px]" />
      {showText && (
        <span className="leading-tight">
          <span className="block text-base font-bold tracking-tight">Orion Projects</span>
          <span className="block text-xs text-muted-foreground">Orion Group</span>
        </span>
      )}
    </span>
  );
}
