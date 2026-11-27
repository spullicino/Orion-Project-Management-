import { AlarmClock, Pause, ShieldCheck, ShieldOff } from "lucide-react";
import { TICKET_PRIORITY, TICKET_STATUS, warrantyState, type SlaInfo } from "@/lib/aftersales";
import { cn, formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus } from "@/types/database";

const pill = "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold";

export function StatusPill({ status, className }: { status: TicketStatus; className?: string }) {
  return <span className={cn(pill, TICKET_STATUS[status].tone, className)}>{TICKET_STATUS[status].label}</span>;
}

export function PriorityPill({ priority, className, hideNormal }: { priority: TicketPriority; className?: string; hideNormal?: boolean }) {
  if (hideNormal && priority === "normal") return null;
  return <span className={cn(pill, TICKET_PRIORITY[priority].tone, className)}>{TICKET_PRIORITY[priority].label}</span>;
}

export function WarrantyBadge({ end, today, className }: { end: string | null; today: string; className?: string }) {
  const w = warrantyState(end, today);
  if (!w) return null;
  return w === "in" ? (
    <span className={cn(pill, "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300", className)}>
      <ShieldCheck className="size-3.5" aria-hidden /> Under warranty until {formatDate(end)}
    </span>
  ) : (
    <span className={cn(pill, "bg-muted text-muted-foreground", className)}>
      <ShieldOff className="size-3.5" aria-hidden /> Warranty ended {formatDate(end)}
    </span>
  );
}

/** "Reply due in 3 h" (amber when under 2 h), "Reply overdue 2 h" (red), or the clock stopped while waiting. */
export function SlaPill({ info, className, showPaused }: { info: SlaInfo | null; className?: string; showPaused?: boolean }) {
  if (!info || (info.paused && !showPaused)) return null;
  const tone = info.paused
    ? "bg-muted text-muted-foreground"
    : info.overdue
      ? "bg-red-600 text-white"
      : info.soon
        ? "bg-amber-500/25 text-amber-900 dark:text-amber-300"
        : "bg-muted text-muted-foreground";
  return (
    <span className={cn(pill, tone, className)}>
      {info.paused ? <Pause className="size-3.5" aria-hidden /> : <AlarmClock className="size-3.5" aria-hidden />} {info.label}
    </span>
  );
}
