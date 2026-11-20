import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { HEALTH_LABEL, type HealthLevel, type RiskLevel } from "@/lib/health";
import { cn } from "@/lib/utils";

const STYLE: Record<HealthLevel, { cls: string; Icon: typeof CheckCircle2 }> = {
  green: { cls: "bg-success/15 text-success", Icon: CheckCircle2 },
  amber: { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", Icon: AlertTriangle },
  red: { cls: "bg-destructive/15 text-destructive", Icon: AlertOctagon },
};

/** Project health: always icon + words + colour (never colour alone). */
export function HealthBadge({ level, title, className }: { level: HealthLevel; title?: string; className?: string }) {
  const { cls, Icon } = STYLE[level];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", cls, className)} title={title}>
      <Icon className="size-3.5" aria-hidden />
      {HEALTH_LABEL[level]}
    </span>
  );
}

/** Small warning next to a task that is late or at risk. */
export function RiskIcon({ level, reason, withText }: { level: RiskLevel; reason: string; withText?: boolean }) {
  const Icon = level === "red" ? AlertOctagon : AlertTriangle;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium", level === "red" ? "text-destructive" : "text-amber-700 dark:text-amber-400")}
      title={reason}
      role="img"
      aria-label={`${level === "red" ? "Late" : "At risk"}: ${reason}`}
    >
      <Icon className="size-4" aria-hidden />
      {withText && <span className="truncate">{reason}</span>}
    </span>
  );
}
