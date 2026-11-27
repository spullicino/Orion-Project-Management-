"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/app/(app)/projects/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { getModuleLevel, type ModuleLevel } from "@/lib/modules";
import { queuePush } from "@/lib/notify/queue";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import {
  contactSchema,
  customerSchema,
  messageSchema,
  newTicketSchema,
  siteSchema,
  ticketFileSchema,
  ticketPatchSchema,
} from "@/lib/validation/aftersales";

const fail = (error: string): Result<never> => ({ ok: false, error });
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the details";
const friendly = (m: string) =>
  /does not exist|schema cache/.test(m)
    ? "Run database update 0033 first."
    : /duplicate key.*email/.test(m)
      ? "That email address already belongs to another contact."
      : /row-level security|permission denied/.test(m)
        ? "You don't have access to do that."
        : m;

/** Signed in, active and allowed to use Aftersales (managers for some actions). */
async function member(minimum: ModuleLevel = "agent") {
  const me = await getCurrentProfile();
  if (!me || me.status !== "active") return null;
  const level = await getModuleLevel(me, "aftersales");
  if (!level || (minimum === "manager" && level !== "manager")) return null;
  return me;
}
const NO_ACCESS = "You don't have access to Aftersales.";
const refresh = (number?: number) => {
  revalidatePath("/aftersales", "layout");
  if (number) revalidatePath(`/aftersales/tickets/${number}`);
};

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function createTicket(input: unknown): Promise<Result<{ number: number }>> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const parsed = newTicketSchema.safeParse(input);
  if (!parsed.success) return fail(first(parsed.error));
  const { report, ...t } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("as_tickets")
    .insert({ ...t, source: "staff", created_by: me.id })
    .select("id, number")
    .single();
  if (error || !data) return fail(friendly(error?.message ?? "Couldn't save"));
  if (report) {
    let from: string | null = null;
    if (t.contact_id) {
      const { data: c } = await supabase.from("as_contacts").select("name, email").eq("id", t.contact_id).maybeSingle();
      from = c?.name || c?.email || null;
    }
    await supabase.from("as_messages").insert({ ticket_id: data.id, kind: "customer", author_id: me.id, from_name: from, body: report });
  }
  queuePush();
  refresh();
  return { ok: true, data: { number: data.number } };
}

export async function updateTicket(id: string, patch: unknown): Promise<Result> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const parsed = ticketPatchSchema.safeParse(patch);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return fail(parsed.success ? "Ticket not found" : first(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.from("as_tickets").update(parsed.data).eq("id", id).select("number").maybeSingle();
  if (error) return fail(friendly(error.message));
  if (!data) return fail("Ticket not found");
  queuePush();
  refresh(data.number);
  return { ok: true };
}

export async function deleteTicket(id: string): Promise<Result> {
  const me = await member("manager");
  if (!me) return fail("Only Aftersales managers can delete tickets.");
  const supabase = await createClient();
  const { data: files } = await supabase.from("as_files").select("storage_path").eq("ticket_id", id);
  const { error } = await supabase.from("as_tickets").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  if (files?.length) await supabase.storage.from("aftersales").remove(files.map((f) => f.storage_path));
  refresh();
  return { ok: true };
}

/** A reply to the customer, an internal note, or something the customer said (e.g. on the phone). */
export async function addTicketMessage(input: unknown): Promise<Result<{ id: string }>> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return fail(first(parsed.error));
  const { ticket_id, kind, body, from_name, status } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("as_messages")
    .insert({ ticket_id, kind, body, author_id: me.id, from_name: kind === "customer" ? from_name : null })
    .select("id")
    .single();
  if (error || !data) return fail(friendly(error?.message ?? "Couldn't save"));
  const { data: t } = status
    ? await supabase.from("as_tickets").update({ status }).eq("id", ticket_id).select("number").maybeSingle()
    : await supabase.from("as_tickets").select("number").eq("id", ticket_id).maybeSingle();
  queuePush();
  refresh(t?.number);
  return { ok: true, data: { id: data.id } };
}

export async function deleteTicketMessage(id: string): Promise<Result> {
  const me = await member("manager");
  if (!me) return fail("Only Aftersales managers can delete messages.");
  const supabase = await createClient();
  const { error } = await supabase.from("as_messages").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Files on a ticket: 1. a one-time upload link, 2. record it once uploaded
// ---------------------------------------------------------------------------
const filePath = (ticketId: string, id: string, name: string) => `tickets/${ticketId}/${id}-${name.replace(/[^\w.\- ]+/g, "_").slice(-80)}`;

export async function createTicketFileUpload(input: unknown): Promise<Result<{ signedUrl: string }>> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const parsed = ticketFileSchema.safeParse(input);
  if (!parsed.success) return fail(first(parsed.error));
  if (!(await rateLimit("upload", me.id))) return fail("Too many uploads. Please wait a few minutes.");
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("aftersales").createSignedUploadUrl(filePath(v.ticket_id, v.id, v.file_name), { upsert: true });
  if (error || !data) return fail("Couldn't start the upload. Try again.");
  return { ok: true, data: { signedUrl: data.signedUrl } };
}

export async function registerTicketFile(input: unknown): Promise<Result> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const parsed = ticketFileSchema.safeParse(input);
  if (!parsed.success) return fail(first(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("as_files").insert({
    id: v.id,
    ticket_id: v.ticket_id,
    message_id: v.message_id ?? null,
    storage_path: filePath(v.ticket_id, v.id, v.file_name),
    file_name: v.file_name,
    mime_type: v.mime_type || null,
    size_bytes: v.size,
    uploaded_by: me.id,
  });
  if (error) return fail(friendly(error.message));
  refresh();
  return { ok: true };
}

export async function deleteTicketFile(id: string): Promise<Result> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const supabase = await createClient();
  const { data, error } = await supabase.from("as_files").delete().eq("id", id).select("storage_path").maybeSingle();
  if (error) return fail(friendly(error.message));
  if (!data) return fail("Only the person who added it, or a manager, can remove it.");
  await supabase.storage.from("aftersales").remove([data.storage_path]);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Customers, contacts, sites
// ---------------------------------------------------------------------------

export async function saveCustomer(id: string | null, input: unknown): Promise<Result<{ id: string }>> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return fail(first(parsed.error));
  const supabase = await createClient();
  const q = id
    ? supabase.from("as_customers").update(parsed.data).eq("id", id).select("id").single()
    : supabase.from("as_customers").insert(parsed.data).select("id").single();
  const { data, error } = await q;
  if (error || !data) return fail(friendly(error?.message ?? "Couldn't save"));
  refresh();
  return { ok: true, data: { id: data.id } };
}

/** New customer with their first contact in one go (from the New ticket form). */
export async function quickAddCustomer(input: unknown): Promise<Result<{ customerId: string; contactId: string | null }>> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const parsed = z
    .object({ customer: customerSchema, contact: z.object({ name: z.string().trim().max(160), email: z.string().trim().max(254), phone: z.string().trim().max(40) }) })
    .safeParse(input);
  if (!parsed.success) return fail(first(parsed.error));
  const supabase = await createClient();
  const { data: c, error } = await supabase.from("as_customers").insert(parsed.data.customer).select("id").single();
  if (error || !c) return fail(friendly(error?.message ?? "Couldn't save"));
  const k = parsed.data.contact;
  let contactId: string | null = null;
  if (k.name || k.email || k.phone) {
    const contact = contactSchema.safeParse({ customer_id: c.id, ...k });
    if (!contact.success) return fail(first(contact.error));
    const { data: ct, error: e2 } = await supabase.from("as_contacts").insert(contact.data).select("id").single();
    if (e2) return fail(friendly(e2.message));
    contactId = ct?.id ?? null;
  }
  refresh();
  return { ok: true, data: { customerId: c.id, contactId } };
}

export async function deleteCustomer(id: string): Promise<Result> {
  const me = await member("manager");
  if (!me) return fail("Only Aftersales managers can delete customers.");
  const supabase = await createClient();
  const { error } = await supabase.from("as_customers").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  refresh();
  return { ok: true };
}

export async function saveContact(id: string | null, input: unknown): Promise<Result<{ id: string }>> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fail(first(parsed.error));
  const supabase = await createClient();
  const q = id
    ? supabase.from("as_contacts").update(parsed.data).eq("id", id).select("id").single()
    : supabase.from("as_contacts").insert(parsed.data).select("id").single();
  const { data, error } = await q;
  if (error || !data) return fail(friendly(error?.message ?? "Couldn't save"));
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function deleteContact(id: string): Promise<Result> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const supabase = await createClient();
  const { error } = await supabase.from("as_contacts").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  refresh();
  return { ok: true };
}

export async function saveSite(id: string | null, input: unknown): Promise<Result<{ id: string }>> {
  const me = await member();
  if (!me) return fail(NO_ACCESS);
  const parsed = siteSchema.safeParse(input);
  if (!parsed.success) return fail(first(parsed.error));
  const supabase = await createClient();
  const q = id
    ? supabase.from("as_sites").update(parsed.data).eq("id", id).select("id").single()
    : supabase.from("as_sites").insert(parsed.data).select("id").single();
  const { data, error } = await q;
  if (error || !data) return fail(friendly(error?.message ?? "Couldn't save"));
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function deleteSite(id: string): Promise<Result> {
  const me = await member("manager");
  if (!me) return fail("Only Aftersales managers can delete sites.");
  const supabase = await createClient();
  const { error } = await supabase.from("as_sites").delete().eq("id", id);
  if (error) return fail(friendly(error.message));
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Categories (managers)
// ---------------------------------------------------------------------------

export async function saveCategory(id: string | null, name: string, active = true): Promise<Result> {
  const me = await member("manager");
  if (!me) return fail("Only Aftersales managers can change categories.");
  const n = z.string().trim().min(1, "Write a name").max(60).safeParse(name);
  if (!n.success) return fail(first(n.error));
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("as_categories").update({ name: n.data, active }).eq("id", id);
    if (error) return fail(/duplicate/.test(error.message) ? "There's already a category with that name." : friendly(error.message));
  } else {
    const { data: last } = await supabase.from("as_categories").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("as_categories").insert({ name: n.data, position: (last?.position ?? 0) + 1 });
    if (error) return fail(/duplicate/.test(error.message) ? "There's already a category with that name." : friendly(error.message));
  }
  refresh();
  return { ok: true };
}
