import { notFound } from "next/navigation";
import { AftersalesTabs } from "@/components/aftersales/aftersales-tabs";
import { CustomerDetail } from "@/components/aftersales/customers-view";
import { NewTicketButton } from "@/components/aftersales/new-ticket-dialog";
import { TicketFilters, TicketList } from "@/components/aftersales/ticket-list";
import { TicketView } from "@/components/aftersales/ticket-view";
import { ModulesView } from "@/components/admin/modules-view";
import { MailSettings } from "@/components/aftersales/mail-settings";
import { ReportView } from "@/components/aftersales/report-view";
import { SlaSettingsCard } from "@/components/aftersales/sla-settings";
import { PageHeader } from "@/components/layout/page-header";
import type { AsLookups, TicketDetail, TicketRow } from "@/types/aftersales";

const nowMs = () => Date.now();

/** Development-only: Aftersales screens with sample data (?page=list|ticket|customer|modules). */
export default async function AftersalesPreview({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const page = (await searchParams).page ?? "list";
  const now = nowMs();
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  const lookups: AsLookups = {
    people: [
      { id: "me", name: "Sarah Pullicino", level: "manager" },
      { id: "u2", name: "Joe Vella", level: "agent" },
    ],
    categories: ["Fire Alarm", "CCTV", "Access Control", "Sound System", "Intercom", "Plumbing", "Electrical", "Air Conditioning", "Ventilation", "Automation"].map((n, i) => ({ id: `c${i}`, name: n, active: true })),
    customers: [
      { id: "k1", name: "Solair Owners Association", kind: "company", phone: "+356 2123 4567", address: "Triq il-Kbira, Sliema", notes: null, client_id: null },
      { id: "k2", name: "Mark Borg", kind: "person", phone: null, address: null, notes: null, client_id: null },
    ],
    contacts: [
      { id: "p1", customer_id: "k1", name: "Anna Zammit", email: "anna@solair.com.mt", phone: "+356 7912 3456" },
      { id: "p2", customer_id: "k2", name: "Mark Borg", email: "mark.borg@gmail.com", phone: null },
    ],
    sites: [
      { id: "s1", customer_id: "k1", name: "Solair Apartments – Block B", address: "Triq il-Kbira, Sliema", handover_date: "2025-03-01", warranty_end: "2027-03-01", project_id: null, notes: "Fire panel: Advanced MxPro 5, 4 loops. CCTV: 24 cameras, NVR in basement." },
      { id: "s2", customer_id: "k1", name: "Solair Apartments – Block A", address: null, handover_date: "2023-02-01", warranty_end: "2025-02-01", project_id: null, notes: null },
    ],
  };
  const row = (n: number, subject: string, status: TicketRow["status"], priority: TicketRow["priority"], h: number, extra: Partial<TicketRow> = {}): TicketRow => ({
    id: `t${n}`, number: n, subject, status, priority, source: "email", created_at: ago(h + 5), updated_at: ago(h), last_customer_at: ago(h),
    customer: "Solair Owners Association", site: "Solair Apartments – Block B", category: "Fire Alarm", assignee: "Joe Vella", assigned_to: "u2",
    first_response_at: null, first_response_due: ago(h - 3), resolve_due: ago(h - 40), paused_since: null, ...extra,
  });
  const tickets = [
    row(1024, "Fire alarm panel beeping – fault on zone 3", "new", "urgent", 0.3, { assignee: null, assigned_to: null, first_response_due: ago(-0.7) }),
    row(1023, "CCTV camera 12 offline since the storm", "in_progress", "high", 3, { category: "CCTV", first_response_due: ago(5) }),
    row(1021, "Intercom at main entrance not ringing flat 5", "waiting", "normal", 26, { category: "Intercom", source: "staff", first_response_at: ago(25), paused_since: ago(20) }),
    row(1019, "Bathroom extractor fan noisy", "resolved", "low", 80, { customer: "Mark Borg", site: null, category: "Ventilation" }),
  ];
  const ticket: TicketDetail = {
    id: "t1024", number: 1024, subject: "Fire alarm panel beeping – fault on zone 3", status: "in_progress", priority: "urgent", source: "email",
    category_id: "c0", customer_id: "k1", contact_id: "p1", site_id: "s1", assigned_to: "u2", created_at: ago(5), created_by: null, creator: null,
    first_response_at: ago(4), last_customer_at: ago(1), resolved_at: null, closed_at: null, first_response_due: ago(4.5), resolve_due: ago(-4), paused_since: null,
    messages: [
      { id: "m1", kind: "event", author: null, from_name: null, from_email: null, body: "Ticket opened from an email", email_status: null, email_to: null, email_error: null, created_at: ago(5) },
      { id: "m2", kind: "customer", author: null, from_name: "Anna Zammit", from_email: "anna@solair.com.mt", body: "Good morning,\n\nThe fire alarm panel in Block B has been beeping since last night and shows a fault on zone 3. Residents are complaining. Can someone come today?\n\nThanks,\nAnna", email_status: null, email_to: null, email_error: null, created_at: ago(5) },
      { id: "m3", kind: "event", author: "Sarah Pullicino", from_name: null, from_email: null, body: "Assigned to Joe Vella", email_status: null, email_to: null, email_error: null, created_at: ago(4.5) },
      { id: "m4", kind: "reply", author: "Joe Vella", from_name: null, from_email: null, body: "Hi Anna, we'll be on site at 14:00 today to check zone 3. Please make sure we can access the panel room.", email_status: "sent", email_to: "anna@solair.com.mt", email_error: null, created_at: ago(4) },
      { id: "m5", kind: "note", author: "Joe Vella", from_name: null, from_email: null, body: "Probably detector 3.14 (car park) — dusty. Bring a spare and the test kit.", email_status: null, email_to: null, email_error: null, created_at: ago(3.8) },
      { id: "m7", kind: "reply", author: "Joe Vella", from_name: null, from_email: null, body: "We've ordered the replacement detector — it arrives Monday.", email_status: "failed", email_to: null, email_error: "Gmail 503: the service is temporarily unavailable", created_at: ago(2) },
      { id: "m6", kind: "customer", author: null, from_name: "Anna Zammit", from_email: "anna@solair.com.mt", body: "Perfect, the caretaker will be there.", email_status: null, email_to: null, email_error: null, created_at: ago(1) },
    ],
    files: [{ id: "f1", file_name: "panel-display.jpg", mime_type: "image/jpeg", size_bytes: 412_000, uploaded_by: null, uploader: "Anna Zammit", created_at: ago(5) }],
  };

  if (page === "ticket") return <TicketView ticket={ticket} lookups={lookups} meId="me" isManager today="2026-11-27" mailbox="support@oriongroup.com.mt" nowMs={now} />;
  if (page === "customer")
    return <CustomerDetail customer={lookups.customers[0]} lookups={lookups} tickets={tickets.slice(0, 3)} clients={[]} projects={[]} isManager today="2026-11-27" nowMs={now} />;
  if (page === "sla")
    return (
      <SlaSettingsCard
        settings={{ work_start: "08:00:00", work_end: "17:00:00", work_days: [1, 2, 3, 4, 5], targets: { urgent: { first: 60, resolve: 540 }, high: { first: 240, resolve: 1620 }, normal: { first: 480, resolve: 2700 }, low: { first: 1080, resolve: 5400 } }, auto_close_days: 7 }}
        holidays={[{ day: "2026-12-08", name: "Immaculate Conception" }, { day: "2026-12-13", name: "Republic Day" }, { day: "2026-12-25", name: "Christmas Day" }, { day: "2027-01-01", name: "New Year's Day" }]}
        isManager
        today="2026-11-27"
      />
    );
  if (page === "report") {
    const rt = (n: number, assignee: string | null, category: string, firstH: number, fixH: number | null, status: "resolved" | "in_progress" = "resolved") => ({
      number: n, subject: `Ticket ${n}`, priority: "normal" as const, status, created_at: ago(200), first_response_at: ago(200 - firstH), first_response_due: ago(192), resolve_due: ago(120),
      resolved_at: fixH === null ? null : ago(200 - fixH), paused_since: null, assignee, category, customer: "Solair Owners Association",
    });
    return (
      <ReportView
        month="2026-11"
        months={["2026-11", "2026-10", "2026-09"]}
        nowMs={now}
        tickets={[rt(1010, "Joe Vella", "Fire Alarm", 2, 40), rt(1011, "Joe Vella", "CCTV", 9, 90), rt(1012, "Mark Grech", "Intercom", 1, 30), rt(1013, null, "Fire Alarm", 3, null, "in_progress")]}
      />
    );
  }
  if (page === "settings") {
    const base = { mailbox: "support@oriongroup.com.mt", connected: true, connected_at: ago(30), connected_by: "Sarah Pullicino", last_sync_at: ago(48), last_error: null, last_error_at: null, auto_ack: true, ack_text: "Thank you for contacting Orion Group. We have received your request and logged it as {ticket}.\n\nOur aftersales team will get back to you as soon as possible.", signature: "Orion Group — Aftersales\nsupport@oriongroup.com.mt" };
    return (
      <div className="grid gap-5">
        <MailSettings status={base} configured isManager isAdmin siteUrl="https://orion-projects.vercel.app" redirectUri="https://orion-projects.vercel.app/api/aftersales/gmail/callback" result="connected" nowMs={now} />
        <MailSettings status={{ ...base, connected: false, mailbox: null }} configured={false} isManager isAdmin siteUrl="https://orion-projects.vercel.app" redirectUri="https://orion-projects.vercel.app/api/aftersales/gmail/callback" nowMs={now} />
      </div>
    );
  }
  if (page === "modules")
    return (
      <>
        <PageHeader title="Modules" description="Parts of the app only chosen people can use. Administrators always have full access." />
        <ModulesView
          people={[
            { id: "me", name: "Sarah Pullicino", role: "admin" },
            { id: "u2", name: "Joe Vella", role: "technician" },
            { id: "u3", name: "Mark Grech", role: "manager" },
          ]}
          access={[{ userId: "u2", module: "aftersales", level: "agent" }]}
        />
      </>
    );
  return (
    <>
      <AftersalesTabs />
      <PageHeader title="Tickets" description="Aftersales requests from customers." actions={<NewTicketButton lookups={lookups} />} />
      <div className="grid gap-4">
        <TicketFilters view="open" categories={lookups.categories} counts={{ open: 3, mine: 1, unassigned: 1 }} />
        <TicketList tickets={tickets} empty="" nowMs={now} />
      </div>
    </>
  );
}
