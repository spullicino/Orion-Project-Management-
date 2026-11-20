import { cn } from "@/lib/utils";

/**
 * Official Orion Group logo.
 * - Full logo: dark wordmark in light mode, white wordmark in dark mode, with a "Projects" label.
 * - showText={false}: the round mark only (mobile header, small spaces).
 * Files live in /public/brand — replace them there to update the logo everywhere.
 */
export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  if (!showText) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/brand/orion-mark-transparent.png" alt="Orion" width={32} height={32} className={cn("size-8", className)} />
    );
  }
  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/orion-logo.png" alt="Orion" width={124} height={36} className="h-10 w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/orion-logo-white.png" alt="Orion" width={124} height={36} className="hidden h-10 w-auto dark:block" />
      <span className="pl-[51px] text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Projects</span>
    </span>
  );
}
