import { ShieldCheck, ShieldOff } from "lucide-react";
import { TICKET_PRIORITY, TICKET_STATUS, warrantyState } from "@/lib/aftersales";
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
