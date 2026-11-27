import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TicketView } from "@/components/aftersales/ticket-view";
import { ticketRef } from "@/lib/aftersales";
import { loadLookups, loadMailbox, loadTicket } from "@/lib/data/aftersales";
import { requireModule } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  return { title: /^\d+$/.test(number) ? ticketRef(Number(number)) : "Ticket" };
}

const nowMs = () => Date.now();
const maltaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Malta" }).format(new Date());

export default async function TicketPage({ params }: { params: Promise<{ number: string }> }) {
  const { profile, level } = await requireModule("aftersales");
  const { number } = await params;
  if (!/^\d{1,9}$/.test(number)) notFound();
  const supabase = await createClient();
  const [ticket, lookups, mailbox] = await Promise.all([loadTicket(supabase, Number(number)), loadLookups(supabase), loadMailbox(supabase)]);
  if (!ticket) notFound();
  return <TicketView ticket={ticket} lookups={lookups} meId={profile.id} isManager={level === "manager"} today={maltaToday()} mailbox={mailbox} nowMs={nowMs()} />;
}
