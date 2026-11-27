import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PortalTicketView } from "@/components/portal/portal-views";
import { getPortal, type PortalTicket } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request" };

export default async function PortalTicketPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const { email, me } = await getPortal();
  if (!email || !me) redirect("/portal");
  if (!/^\d{1,9}$/.test(number)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_ticket", { p_number: Number(number) });
  if (!data) notFound();
  return <PortalTicketView t={data as PortalTicket} />;
}
