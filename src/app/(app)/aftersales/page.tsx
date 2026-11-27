import type { Metadata } from "next";
import { NewTicketButton } from "@/components/aftersales/new-ticket-dialog";
import { TicketFilters, TicketList } from "@/components/aftersales/ticket-list";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { OPEN_STATUSES, TICKET_VIEWS, type TicketView } from "@/lib/aftersales";
import { loadLookups, loadTickets } from "@/lib/data/aftersales";
import { requireModule } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Aftersales" };
const nowMs = () => Date.now();

const EMPTY: Record<TicketView, string> = {
  open: "No open tickets. 🎉",
  mine: "Nothing assigned to you right now.",
  unassigned: "Every open ticket has someone on it.",
  waiting: "No tickets are waiting for a customer.",
  overdue: "Nothing overdue. 👍",
  done: "No resolved or closed tickets yet.",
  all: "No tickets yet. Tap New ticket to open one.",
};

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { profile } = await requireModule("aftersales");
  const sp = await searchParams;
  const view = (TICKET_VIEWS.some((v) => v.value === sp.view) ? sp.view : "open") as TicketView;
  const supabase = await createClient();
  const lookups = await loadLookups(supabase);
  const iso = new Date(nowMs()).toISOString();
  const [tickets, open, mine, unassigned, overdue] = await Promise.all([
    loadTickets(supabase, profile.id, { view, q: sp.q, category: sp.category, priority: sp.priority, customer: sp.customer }, lookups),
    supabase.from("as_tickets").select("id", { count: "exact", head: true }).in("status", OPEN_STATUSES),
    supabase.from("as_tickets").select("id", { count: "exact", head: true }).in("status", OPEN_STATUSES).eq("assigned_to", profile.id),
    supabase.from("as_tickets").select("id", { count: "exact", head: true }).in("status", OPEN_STATUSES).is("assigned_to", null),
    supabase
      .from("as_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "assigned", "in_progress"])
      .is("paused_since", null)
      .or(`and(first_response_at.is.null,first_response_due.lt.${iso}),resolve_due.lt.${iso}`),
  ]);
  if (!tickets) {
    return (
      <>
        <PageHeader title="Aftersales" />
        <DatabaseUpdateNotice isAdmin={profile.role === "admin"} />
      </>
    );
  }
  const filtered = !!(sp.q || sp.category || sp.priority || sp.customer);
  return (
    <>
      <PageHeader title="Tickets" description="Aftersales requests from customers." actions={<NewTicketButton lookups={lookups} />} />
      <div className="grid gap-4">
        <TicketFilters view={view} categories={lookups.categories} counts={{ open: open.count ?? 0, mine: mine.count ?? 0, unassigned: unassigned.count ?? 0, overdue: overdue.error ? undefined : (overdue.count ?? 0) }} />
        <TicketList tickets={tickets} empty={filtered ? "No tickets match these filters." : EMPTY[view]} nowMs={nowMs()} />
      </div>
    </>
  );
}
