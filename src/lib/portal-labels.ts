import type { TicketStatus } from "@/types/database";

/** How a ticket's status reads for the customer. */
export const PORTAL_STATUS: Record<TicketStatus, { label: string; tone: string }> = {
  new: { label: "Received", tone: "bg-sky-600/15 text-sky-800 dark:text-sky-300" },
  assigned: { label: "Received", tone: "bg-sky-600/15 text-sky-800 dark:text-sky-300" },
  in_progress: { label: "Being handled", tone: "bg-amber-500/20 text-amber-900 dark:text-amber-300" },
  waiting: { label: "Waiting for you", tone: "bg-violet-600/15 text-violet-800 dark:text-violet-300" },
  resolved: { label: "Resolved", tone: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300" },
  closed: { label: "Closed", tone: "bg-muted text-muted-foreground" },
};
