/** Aftersales (support tickets): labels, colours and small helpers shared by screens and server. */
import type { TicketPriority, TicketStatus } from "@/types/database";

export const ticketRef = (n: number) => `OGT-${n}`;
/** "OGT-1024", "ogt 1024" or "1024" → 1024 (the old "TKT-1024" works too). */
export function parseTicketRef(s: string): number | null {
  const m = /^\s*(?:(?:ogt|tkt)[\s-]*)?(\d{1,9})\s*$/i.exec(s);
  return m ? Number(m[1]) : null;
}

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "bg-sky-600/15 text-sky-800 dark:text-sky-300" },
  assigned: { label: "Assigned", tone: "bg-indigo-600/15 text-indigo-800 dark:text-indigo-300" },
  in_progress: { label: "In progress", tone: "bg-amber-500/20 text-amber-900 dark:text-amber-300" },
  waiting: { label: "Waiting for customer", tone: "bg-violet-600/15 text-violet-800 dark:text-violet-300" },
  resolved: { label: "Resolved", tone: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300" },
  closed: { label: "Closed", tone: "bg-muted text-muted-foreground" },
};
export const TICKET_STATUSES = Object.keys(TICKET_STATUS) as TicketStatus[];
export const OPEN_STATUSES: TicketStatus[] = ["new", "assigned", "in_progress", "waiting"];

export const TICKET_PRIORITY: Record<TicketPriority, { label: string; tone: string }> = {
  low: { label: "Low", tone: "bg-muted text-muted-foreground" },
  normal: { label: "Normal", tone: "bg-secondary text-secondary-foreground" },
  high: { label: "High", tone: "bg-orange-500/20 text-orange-900 dark:text-orange-300" },
  urgent: { label: "Urgent", tone: "bg-red-600 text-white" },
};
export const TICKET_PRIORITIES = Object.keys(TICKET_PRIORITY) as TicketPriority[];

/** Under warranty on this date? null when no warranty end date is known. */
export function warrantyState(warrantyEnd: string | null | undefined, today: string): "in" | "ended" | null {
  if (!warrantyEnd) return null;
  return warrantyEnd >= today ? "in" : "ended";
}

/** The lists on the Tickets page. */
export type TicketView = "open" | "mine" | "unassigned" | "waiting" | "overdue" | "done" | "all";
export const TICKET_VIEWS: { value: TicketView; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "mine", label: "Mine" },
  { value: "unassigned", label: "Unassigned" },
  { value: "waiting", label: "Waiting for customer" },
  { value: "overdue", label: "Overdue" },
  { value: "done", label: "Resolved & closed" },
  { value: "all", label: "All" },
];

// ---------------------------------------------------------------------------
// Response targets
// ---------------------------------------------------------------------------
export type SlaFields = {
  status: TicketStatus;
  first_response_at: string | null;
  first_response_due: string | null;
  resolve_due: string | null;
  paused_since: string | null;
};
export type SlaInfo = { kind: "first" | "resolve"; due: string; overdue: boolean; soon: boolean; paused: boolean; label: string };

/** "45 min", "3 h", "2 days" (clock time, rounded). */
export function roughDuration(ms: number): string {
  const min = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  return `${d} days`;
}

/** What's next for an open ticket: its first reply, or else getting it fixed. null when resolved/closed. */
export function slaInfo(t: SlaFields, nowMs: number): SlaInfo | null {
  if (t.status === "resolved" || t.status === "closed") return null;
  const kind = !t.first_response_at && t.first_response_due ? "first" : "resolve";
  const due = kind === "first" ? t.first_response_due : t.resolve_due;
  if (!due) return null;
  const paused = !!t.paused_since;
  const left = new Date(due).getTime() - nowMs;
  const overdue = !paused && left <= 0;
  const soon = !paused && !overdue && left < 2 * 3_600_000;
  const what = kind === "first" ? "Reply" : "Fix";
  const label = paused ? "Clock stopped — waiting for customer" : overdue ? `${what} overdue ${roughDuration(left)}` : `${what} due in ${roughDuration(left)}`;
  return { kind, due, overdue, soon, paused, label };
}

/** Did a closed-out ticket meet its targets? (For the report.) null = can't tell yet. */
export function metTargets(t: SlaFields & { resolved_at: string | null }, nowMs: number) {
  const firstOk = t.first_response_due
    ? t.first_response_at
      ? t.first_response_at <= t.first_response_due
      : new Date(t.first_response_due).getTime() > nowMs
        ? null
        : false
    : null;
  const fixOk = t.resolve_due
    ? t.resolved_at
      ? new Date(t.resolved_at).getTime() <= new Date(t.resolve_due).getTime()
      : t.paused_since || new Date(t.resolve_due).getTime() > nowMs
        ? null
        : false
    : null;
  return { firstOk, fixOk };
}

export const TARGET_PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];
