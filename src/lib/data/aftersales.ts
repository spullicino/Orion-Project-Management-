import "server-only";
import { OPEN_STATUSES, parseTicketRef, type TicketView } from "@/lib/aftersales";
import type { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import type { AsLookups, TicketDetail, TicketRow } from "@/types/aftersales";
import type { TicketPriority } from "@/types/database";

type Db = Awaited<ReturnType<typeof createClient>>;

/** People, categories, customers, contacts and sites (Aftersales is small enough to load whole). */
export async function loadLookups(supabase: Db): Promise<AsLookups> {
  const [people, categories, customers, contacts, sites] = await Promise.all([
    supabase.rpc("module_members", { p_module: "aftersales" }),
    supabase.from("as_categories").select("id, name, active").order("position"),
    supabase.from("as_customers").select("id, name, kind, phone, address, notes, client_id").order("name").limit(5000),
    supabase.from("as_contacts").select("id, customer_id, name, email, phone").order("name").limit(10000),
    supabase.from("as_sites").select("id, customer_id, name, address, handover_date, warranty_end, project_id, notes").order("name").limit(10000),
  ]);
  return {
    people: (people.data ?? []).map((p) => ({ id: p.user_id, name: fullName(p), level: p.level })),
    categories: categories.data ?? [],
    customers: customers.data ?? [],
    contacts: contacts.data ?? [],
    sites: sites.data ?? [],
  };
}

export type TicketFilters = { view: TicketView; q?: string; category?: string; priority?: string; customer?: string };

/** Tickets for the list. null when the database update hasn't been run. */
export async function loadTickets(supabase: Db, me: string, f: TicketFilters, lookups: AsLookups): Promise<TicketRow[] | null> {
  let q = supabase
    .from("as_tickets")
    .select("id, number, subject, status, priority, source, created_at, updated_at, last_customer_at, customer_id, site_id, category_id, assigned_to")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (f.view === "open") q = q.in("status", OPEN_STATUSES);
  if (f.view === "mine") q = q.eq("assigned_to", me).in("status", OPEN_STATUSES);
  if (f.view === "unassigned") q = q.is("assigned_to", null).in("status", OPEN_STATUSES);
  if (f.view === "waiting") q = q.eq("status", "waiting");
  if (f.view === "done") q = q.in("status", ["resolved", "closed"]);
  if (f.category) q = q.eq("category_id", f.category);
  if (f.priority) q = q.eq("priority", f.priority as TicketPriority);
  if (f.customer) q = q.eq("customer_id", f.customer);
  const term = f.q?.trim();
  if (term) {
    const n = parseTicketRef(term);
    if (n) q = q.eq("number", n);
    else {
      // Subject, or a customer / site whose name matches.
      const like = term.toLowerCase();
      const cust = lookups.customers.filter((c) => c.name.toLowerCase().includes(like)).map((c) => c.id);
      const site = lookups.sites.filter((s) => s.name.toLowerCase().includes(like)).map((s) => s.id);
      const safe = term.replace(/[%_,()]/g, " ");
      const ors = [`subject.ilike.%${safe}%`];
      if (cust.length) ors.push(`customer_id.in.(${cust.slice(0, 100).join(",")})`);
      if (site.length) ors.push(`site_id.in.(${site.slice(0, 100).join(",")})`);
      q = q.or(ors.join(","));
    }
  }
  const { data, error } = await q;
  if (error) return null;
  const name = <T extends { id: string; name: string }>(list: T[], id: string | null) => (id ? (list.find((x) => x.id === id)?.name ?? null) : null);
  return (data ?? []).map((t) => ({
    id: t.id,
    number: t.number,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    source: t.source,
    created_at: t.created_at,
    updated_at: t.updated_at,
    last_customer_at: t.last_customer_at,
    customer: name(lookups.customers, t.customer_id),
    site: name(lookups.sites, t.site_id),
    category: name(lookups.categories, t.category_id),
    assignee: name(lookups.people, t.assigned_to),
    assigned_to: t.assigned_to,
  }));
}

/** The connected support@ mailbox (null when not connected, or before database update 0035). */
export async function loadMailbox(supabase: Db): Promise<string | null> {
  const { data, error } = await supabase.rpc("aftersales_mail_status");
  if (error || !data) return null;
  const s = data as { connected?: boolean; mailbox?: string | null };
  return s.connected ? (s.mailbox ?? null) : null;
}

/** One ticket with its conversation and files. */
export async function loadTicket(supabase: Db, number: number): Promise<TicketDetail | null> {
  const { data: t } = await supabase.from("as_tickets").select("*").eq("number", number).maybeSingle();
  if (!t) return null;
  const [{ data: messages }, { data: files }] = await Promise.all([
    supabase.from("as_messages").select("id, kind, author_id, from_name, from_email, body, email_status, email_to, email_error, created_at").eq("ticket_id", t.id).order("created_at").order("id"),
    supabase.from("as_files").select("id, file_name, mime_type, size_bytes, uploaded_by, created_at").eq("ticket_id", t.id).order("created_at"),
  ]);
  const ids = [...new Set([t.created_by, ...(messages ?? []).map((m) => m.author_id), ...(files ?? []).map((f) => f.uploaded_by)].filter(Boolean) as string[])];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, fullName(p)]));
  const by = (id: string | null) => (id ? (who.get(id) ?? "Someone") : null);
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    source: t.source,
    category_id: t.category_id,
    customer_id: t.customer_id,
    contact_id: t.contact_id,
    site_id: t.site_id,
    assigned_to: t.assigned_to,
    created_at: t.created_at,
    created_by: t.created_by,
    creator: by(t.created_by),
    first_response_at: t.first_response_at,
    last_customer_at: t.last_customer_at,
    resolved_at: t.resolved_at,
    closed_at: t.closed_at,
    messages: (messages ?? []).map((m) => ({ id: m.id, kind: m.kind, author: by(m.author_id), from_name: m.from_name, from_email: m.from_email, body: m.body, email_status: m.email_status, email_to: m.email_to, email_error: m.email_error, created_at: m.created_at })),
    files: (files ?? []).map((f) => ({ ...f, uploader: by(f.uploaded_by) })),
  };
}
