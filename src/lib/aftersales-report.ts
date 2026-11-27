/** Aftersales monthly report: on-time numbers per person and per category (no server code — unit-tested). */
import { metTargets, ticketRef, TICKET_STATUS, type SlaFields } from "@/lib/aftersales";
import type { TicketPriority, TicketStatus } from "@/types/database";

export type ReportTicket = SlaFields & {
  number: number;
  subject: string;
  priority: TicketPriority;
  created_at: string;
  resolved_at: string | null;
  assignee: string | null;
  category: string | null;
  customer: string | null;
};
export type ReportLine = { name: string; tickets: number; firstOn: number; firstLate: number; fixOn: number; fixLate: number; open: number };
export type Report = { total: ReportLine; people: ReportLine[]; categories: ReportLine[]; byStatus: Record<TicketStatus, number> };

const empty = (name: string): ReportLine => ({ name, tickets: 0, firstOn: 0, firstLate: 0, fixOn: 0, fixLate: 0, open: 0 });
/** "83%" of the tickets we can judge, or "—". */
export const pct = (on: number, late: number) => (on + late ? `${Math.round((on / (on + late)) * 100)}%` : "—");

export function buildReport(tickets: ReportTicket[], nowMs: number): Report {
  const total = empty("All tickets");
  const people = new Map<string, ReportLine>();
  const categories = new Map<string, ReportLine>();
  const byStatus = Object.fromEntries(Object.keys(TICKET_STATUS).map((s) => [s, 0])) as Record<TicketStatus, number>;
  for (const t of tickets) {
    byStatus[t.status]++;
    const { firstOk, fixOk } = metTargets(t, nowMs);
    const open = t.status !== "resolved" && t.status !== "closed";
    for (const line of [
      total,
      people.get(t.assignee ?? "Not assigned") ?? people.set(t.assignee ?? "Not assigned", empty(t.assignee ?? "Not assigned")).get(t.assignee ?? "Not assigned")!,
      categories.get(t.category ?? "No category") ?? categories.set(t.category ?? "No category", empty(t.category ?? "No category")).get(t.category ?? "No category")!,
    ]) {
      line.tickets++;
      if (firstOk === true) line.firstOn++;
      if (firstOk === false) line.firstLate++;
      if (fixOk === true) line.fixOn++;
      if (fixOk === false) line.fixLate++;
      if (open) line.open++;
    }
  }
  const sort = (m: Map<string, ReportLine>) => [...m.values()].sort((a, b) => b.tickets - a.tickets || a.name.localeCompare(b.name));
  return { total, people: sort(people), categories: sort(categories), byStatus };
}

export const reportRow = (t: ReportTicket, nowMs: number) => {
  const { firstOk, fixOk } = metTargets(t, nowMs);
  const word = (ok: boolean | null) => (ok === null ? "" : ok ? "On time" : "Late");
  return { ref: ticketRef(t.number), firstWord: word(firstOk), fixWord: word(fixOk) };
};
