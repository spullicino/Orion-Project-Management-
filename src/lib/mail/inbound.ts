import "server-only";
import { randomUUID } from "node:crypto";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { OPEN_STATUSES } from "@/lib/aftersales";
import type { createAdminClient } from "@/lib/supabase/admin";
import { ensureLabel, gmailFor, GmailError, LABEL_NAME, type GmailApi } from "./gmail";
import { sendAcknowledgement } from "./outbound";
import { cleanSubject, isAutomatic, nameFromSender, stripQuoted, subjectKey, ticketNumberFromSubject } from "./rules";

type Admin = ReturnType<typeof createAdminClient>;
export type SyncResult = { ok: true; imported: number; newTickets: number; skipped: number; busy?: boolean } | { ok: false; error: string; reconnect?: boolean };

const MAX_BODY = 100_000;
const MAX_FILE = 25 * 1024 * 1024;
const firstAddress = (a: AddressObject | AddressObject[] | undefined) => (Array.isArray(a) ? a[0] : a)?.value?.[0];
const headerMap = (m: ParsedMail) => {
  const out: Record<string, string> = {};
  for (const [k, v] of m.headers) out[k.toLowerCase()] = typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : JSON.stringify(v);
  return out;
};
const refsOf = (m: ParsedMail) => [m.inReplyTo, ...(Array.isArray(m.references) ? m.references : m.references ? [m.references] : [])].filter((x): x is string => !!x);

/**
 * Reads new emails in support@ (every minute, and from "Check now"): each goes
 * onto its ticket or opens a new one. Imported emails get the "Orion-Projects"
 * label in Gmail, so each is read once. One check runs at a time.
 */
export async function syncMailbox(admin: Admin): Promise<SyncResult> {
  // One at a time: take the lock unless another check started in the last 5 minutes.
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: locked } = await admin
    .from("as_mail_settings")
    .update({ sync_lock_at: new Date().toISOString() })
    .eq("id", true)
    .not("refresh_token", "is", null)
    .or(`sync_lock_at.is.null,sync_lock_at.lt.${stale}`)
    .select("id");
  if (!locked?.length) {
    const { data: s } = await admin.from("as_mail_settings").select("refresh_token").eq("id", true).maybeSingle();
    return s?.refresh_token ? { ok: true, imported: 0, newTickets: 0, skipped: 0, busy: true } : { ok: false, error: "Gmail isn't connected." };
  }

  let imported = 0;
  let newTickets = 0;
  let skipped = 0;
  try {
    const g = await gmailFor(admin);
    if (!g?.settings.mailbox) throw new GmailError("Gmail isn't connected.");
    const labelId = await ensureLabel(admin, g.api, g.settings.label_id);
    const after = Math.floor(new Date(g.settings.import_after ?? g.settings.connected_at ?? Date.now()).getTime() / 1000) - 60;
    const list = await g.api.list(`in:inbox -label:${LABEL_NAME} after:${after}`, 20);
    for (const item of list.messages ?? []) {
      const result = await importOne(admin, g.api, g.settings, item.id);
      if (result === "new") newTickets++;
      if (result === "skipped") skipped++;
      else imported++;
      await g.api.addLabel(item.id, labelId);
    }
    await admin
      .from("as_mail_settings")
      .update({ last_sync_at: new Date().toISOString(), last_error: null, last_error_at: null, sync_lock_at: null, imported_count: (g.settings.imported_count ?? 0) + imported })
      .eq("id", true);
    return { ok: true, imported, newTickets, skipped };
  } catch (e) {
    const err = e as Error;
    const reconnect = e instanceof GmailError && e.reconnect;
    const message = reconnect ? "Google stopped the connection — connect Gmail again in Aftersales → Settings." : err.message.slice(0, 500);
    await admin.from("as_mail_settings").update({ last_error: message, last_error_at: new Date().toISOString(), sync_lock_at: null }).eq("id", true);
    console.error("aftersales mail sync failed", err);
    return { ok: false, error: message, reconnect };
  }
}

type Settings = { mailbox: string | null; auto_ack: boolean; ack_text: string; signature: string };

/** One email → its ticket. "skipped" for our own and automatic emails. */
async function importOne(admin: Admin, api: GmailApi, s: Settings, gmailId: string): Promise<"new" | "added" | "skipped"> {
  const { data: seen } = await admin.from("as_messages").select("id").eq("gmail_id", gmailId).maybeSingle();
  if (seen) return "skipped";
  const msg = await api.raw(gmailId);
  const mail = await simpleParser(Buffer.from(msg.raw, "base64url"));
  const from = firstAddress(mail.from);
  const fromEmail = from?.address?.toLowerCase();
  if (!fromEmail || fromEmail === s.mailbox?.toLowerCase()) return "skipped";
  if (isAutomatic(headerMap(mail), fromEmail, mail.subject)) return "skipped";

  const subject = mail.subject ?? "";
  const refs = refsOf(mail);

  // 1. [OGT-1234] in the subject  2. the same Gmail conversation  3. a reply to one of our emails
  type T = { id: string; number: number; subject: string; customer_id: string | null; contact_id: string | null; gmail_thread_id: string | null };
  const cols = "id, number, subject, customer_id, contact_id, gmail_thread_id";
  let ticket: T | null = null;
  const n = ticketNumberFromSubject(subject);
  if (n) ticket = (await admin.from("as_tickets").select(cols).eq("number", n).maybeSingle()).data;
  if (!ticket) ticket = (await admin.from("as_tickets").select(cols).eq("gmail_thread_id", msg.threadId).order("created_at").limit(1).maybeSingle()).data;
  if (!ticket && refs.length) {
    const { data: m } = await admin.from("as_messages").select("ticket_id").in("email_message_id", refs.slice(-30)).limit(1).maybeSingle();
    if (m) ticket = (await admin.from("as_tickets").select(cols).eq("id", m.ticket_id).maybeSingle()).data;
  }

  // Who sent it: a known contact, or a new customer + contact.
  let contact = (await admin.from("as_contacts").select("id, customer_id, name").eq("email", fromEmail).maybeSingle()).data;
  // 4. Same person, same subject, still open.
  if (!ticket && contact) {
    const { data: open } = await admin.from("as_tickets").select(cols).eq("customer_id", contact.customer_id).in("status", OPEN_STATUSES).order("created_at", { ascending: false }).limit(50);
    ticket = (open ?? []).find((t) => subjectKey(t.subject) === subjectKey(subject)) ?? null;
  }
  const senderName = nameFromSender(from?.name, fromEmail);
  if (!contact) {
    const { data: c, error } = await admin.from("as_customers").insert({ name: senderName, kind: "person", notes: `Added from an email to support@ (${fromEmail}).`, created_by: null }).select("id").single();
    if (error || !c) throw new Error(`Couldn't add the customer: ${error?.message}`);
    const { data: k, error: e2 } = await admin.from("as_contacts").insert({ customer_id: c.id, name: senderName, email: fromEmail }).select("id, customer_id, name").single();
    if (e2 || !k) throw new Error(`Couldn't add the contact: ${e2?.message}`);
    contact = k;
  }

  let isNew = false;
  if (!ticket) {
    const { data: t, error } = await admin
      .from("as_tickets")
      .insert({ subject: cleanSubject(subject).slice(0, 300), source: "email", customer_id: contact.customer_id, contact_id: contact.id, gmail_thread_id: msg.threadId, created_by: null })
      .select(cols)
      .single();
    if (error || !t) throw new Error(`Couldn't open the ticket: ${error?.message}`);
    ticket = t;
    isNew = true;
  } else {
    const patch: { gmail_thread_id?: string; customer_id?: string; contact_id?: string } = {};
    if (!ticket.gmail_thread_id) patch.gmail_thread_id = msg.threadId;
    if (!ticket.customer_id) patch.customer_id = contact.customer_id;
    if (!ticket.contact_id && (!ticket.customer_id || ticket.customer_id === contact.customer_id)) patch.contact_id = contact.id;
    if (Object.keys(patch).length) await admin.from("as_tickets").update(patch).eq("id", ticket.id);
  }

  const text = mail.text || (typeof mail.html === "string" ? mail.html.replace(/<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/&nbsp;/g, " ") : "") || "(empty email)";
  const body = (isNew ? text.trim() : stripQuoted(text)).slice(0, MAX_BODY) || "(empty email)";
  const when = mail.date && mail.date.getTime() < Date.now() + 60_000 && mail.date.getTime() > Date.now() - 30 * 86_400_000 ? mail.date.toISOString() : new Date().toISOString();
  const { data: saved, error: e3 } = await admin
    .from("as_messages")
    .insert({ ticket_id: ticket.id, kind: "customer", author_id: null, from_name: from?.name || contact.name || null, from_email: fromEmail, body, email_message_id: mail.messageId ?? null, gmail_id: gmailId, created_at: when })
    .select("id")
    .single();
  if (e3 || !saved) {
    if (/duplicate key/.test(e3?.message ?? "")) return "skipped";
    throw new Error(`Couldn't save the email: ${e3?.message}`);
  }

  // Attachments (not the small pictures inside signatures).
  for (const a of mail.attachments ?? []) {
    if (!a.content || a.size > MAX_FILE) continue;
    if (a.related && a.size < 60_000) continue;
    const id = randomUUID();
    const name = (a.filename || `attachment-${id.slice(0, 6)}`).slice(0, 200);
    const path = `tickets/${ticket.id}/${id}-${name.replace(/[^\w.\- ]+/g, "_").slice(-80)}`;
    const { error } = await admin.storage.from("aftersales").upload(path, a.content, { contentType: a.contentType, upsert: true });
    if (!error) await admin.from("as_files").insert({ id, ticket_id: ticket.id, message_id: saved.id, storage_path: path, file_name: name, mime_type: a.contentType ?? null, size_bytes: a.size, uploaded_by: null });
  }

  if (isNew && s.auto_ack && s.mailbox) {
    try {
      await sendAcknowledgement(admin, api, { mailbox: s.mailbox, ack_text: s.ack_text, signature: s.signature }, { ...ticket, gmail_thread_id: msg.threadId }, { email: fromEmail, name: from?.name || null }, mail.messageId ?? null);
    } catch (e) {
      await admin.from("as_messages").insert({ ticket_id: ticket.id, kind: "event", author_id: null, body: `The automatic reply couldn't be sent: ${(e as Error).message.slice(0, 200)}` });
    }
  }
  return isNew ? "new" : "added";
}
