import type { Metadata } from "next";
import { CustomersView } from "@/components/aftersales/customers-view";
import { PageHeader } from "@/components/layout/page-header";
import { OPEN_STATUSES } from "@/lib/aftersales";
import { loadLookups } from "@/lib/data/aftersales";
import { requireModule } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customers · Aftersales" };
const maltaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Malta" }).format(new Date());

export default async function CustomersPage() {
  await requireModule("aftersales");
  const supabase = await createClient();
  const [lookups, { data: clients }, { data: open }] = await Promise.all([
    loadLookups(supabase),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("as_tickets").select("customer_id").in("status", OPEN_STATUSES).not("customer_id", "is", null).limit(5000),
  ]);
  const openCounts: Record<string, number> = {};
  for (const t of open ?? []) if (t.customer_id) openCounts[t.customer_id] = (openCounts[t.customer_id] ?? 0) + 1;
  return (
    <>
      <PageHeader title="Customers & sites" description="Who you look after, their contacts, and their sites with warranty dates." />
      <CustomersView lookups={lookups} clients={clients ?? []} openCounts={openCounts} today={maltaToday()} />
    </>
  );
}
