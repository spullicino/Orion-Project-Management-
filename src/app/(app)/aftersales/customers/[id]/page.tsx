import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDetail } from "@/components/aftersales/customers-view";
import { loadLookups, loadTickets } from "@/lib/data/aftersales";
import { requireModule } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customer · Aftersales" };
const maltaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Malta" }).format(new Date());
const nowMs = () => Date.now();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, level } = await requireModule("aftersales");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const lookups = await loadLookups(supabase);
  const customer = lookups.customers.find((c) => c.id === id);
  if (!customer) notFound();
  const [tickets, { data: clients }, { data: projects }] = await Promise.all([
    loadTickets(supabase, profile.id, { view: "all", customer: id }, lookups),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("projects").select("id, name").eq("is_template", false).order("name"),
  ]);
  return (
    <CustomerDetail
      customer={customer}
      lookups={lookups}
      tickets={tickets ?? []}
      clients={clients ?? []}
      projects={projects ?? []}
      isManager={level === "manager"}
      today={maltaToday()}
      nowMs={nowMs()}
    />
  );
}
