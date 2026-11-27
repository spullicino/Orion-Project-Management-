import type { Metadata } from "next";
import { ReportView } from "@/components/aftersales/report-view";
import { PageHeader } from "@/components/layout/page-header";
import { loadLookups } from "@/lib/data/aftersales";
import { requireModule } from "@/lib/modules";
import type { ReportTicket } from "@/lib/aftersales-report";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Report · Aftersales" };
const nowMs = () => Date.now();

/** Malta month "2026-11" → its first moment and the next month's, as timestamps. */
function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  // Midnight in Malta on the 1st: summer time (+02:00) covers 1 April – 1 October.
  const iso = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01T00:00:00${mm >= 4 && mm <= 10 ? "+02:00" : "+01:00"}`;
  return { from: iso(y, m), to: m === 12 ? iso(y + 1, 1) : iso(y, m + 1) };
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireModule("aftersales");
  const now = nowMs();
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Malta", year: "numeric", month: "2-digit" }).format(new Date(now));
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(`${thisMonth}-15T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth;
  const { from, to } = monthRange(month);
  const supabase = await createClient();
  const [lookups, { data }] = await Promise.all([
    loadLookups(supabase),
    supabase.from("as_tickets").select("*").gte("created_at", from).lt("created_at", to).order("created_at").limit(5000),
  ]);
  const name = <T extends { id: string; name: string }>(list: T[], id: string | null) => (id ? (list.find((x) => x.id === id)?.name ?? null) : null);
  const tickets: ReportTicket[] = (data ?? []).map((t) => ({
    number: t.number,
    subject: t.subject,
    priority: t.priority,
    status: t.status,
    created_at: t.created_at,
    first_response_at: t.first_response_at,
    first_response_due: t.first_response_due ?? null,
    resolve_due: t.resolve_due ?? null,
    resolved_at: t.resolved_at,
    paused_since: t.paused_since ?? null,
    assignee: name(lookups.people, t.assigned_to),
    category: name(lookups.categories, t.category_id),
    customer: name(lookups.customers, t.customer_id),
  }));
  return (
    <>
      <PageHeader title="Aftersales report" description="How quickly tickets were answered and fixed." />
      <ReportView month={month} months={months.includes(month) ? months : [month, ...months]} tickets={tickets} nowMs={now} />
    </>
  );
}
