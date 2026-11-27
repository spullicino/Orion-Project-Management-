/** Aftersales (support tickets): labels, colours and small helpers shared by screens and server. */
import type { TicketPriority, TicketStatus } from "@/types/database";

export const ticketRef = (n: number) => `TKT-${n}`;
/** "TKT-1024", "tkt 1024" or "1024" → 1024. */
export function parseTicketRef(s: string): number | null {
  const m = /^\s*(?:tkt[\s-]*)?(\d{1,9})\s*$/i.exec(s);
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
export type TicketView = "open" | "mine" | "unassigned" | "waiting" | "done" | "all";
export const TICKET_VIEWS: { value: TicketView; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "mine", label: "Mine" },
  { value: "unassigned", label: "Unassigned" },
  { value: "waiting", label: "Waiting for customer" },
  { value: "done", label: "Resolved & closed" },
  { value: "all", label: "All" },
];
