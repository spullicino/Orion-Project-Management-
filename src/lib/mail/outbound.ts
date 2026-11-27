import "server-only";
import { randomUUID } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import { ticketRef } from "@/lib/aftersales";
import type { createAdminClient } from "@/lib/supabase/admin";
import { gmailFor, type GmailApi } from "./gmail";
import { fillTemplate, replySubject } from "./rules";

type Admin = ReturnType<typeof createAdminClient>;
type Attachment = { filename: string; content: Buffer; contentType?: string };

/** The email address to answer: the ticket's contact, else whoever last wrote. */
async function recipient(admin: Admin, ticket: { id: string; contact_id: string | null }) {
  if (ticket.contact_id) {
    const { data } = await admin.from("as_contacts").select("email, name").eq("id", ticket.contact_id).maybeSingle();
    if (data?.email) return { email: data.email, name: data.name || null };
  }
  const { data: last } = await admin
    .from("as_messages")
    .select("from_email, from_name")
    .eq("ticket_id", ticket.id)
    .eq("kind", "customer")
    .not("from_email", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return last?.from_email ? { email: last.from_email, name: last.from_name } : null;
}

/** In-Reply-To / References: so the customer's mail program shows one conversation. */
async function threadHeaders(admin: Admin, ticketId: string) {
  const { data } = await admin
    .from("as_messages")
    .select("email_message_id")
    .eq("ticket_id", ticketId)
    .not("email_message_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(30);
  const ids = (data ?? []).map((m) => m.email_message_id!).filter(Boolean);
  return { inReplyTo: ids.at(-1), references: ids.length ? ids : undefined };
}

async function compose(opts: {
  from: string;
  to: { email: string; name: string | null };
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Attachment[];
}): Promise<Buffer> {
  const mail = new MailComposer({
    from: { name: "Orion Group Aftersales", address: opts.from },
    to: opts.to.name ? { name: opts.to.name, address: opts.to.email } : opts.to.email,
    subject: opts.subject,
    text: opts.text,
    messageId: opts.messageId,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
    attachments: opts.attachments,
  });
  return mail.compile().build();
}

const newMessageId = (mailbox: string) => `<${randomUUID()}@${mailbox.split("@")[1] ?? "oriongroup.com.mt"}>`;

/**
 * Emails a reply written in the app to the customer, from support@, in the same
 * Gmail conversation, with the files attached to it. Records the result on the message.
 */
export async function sendTicketReply(admin: Admin, messageId: string): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const { data: m } = await admin.from("as_messages").select("id, ticket_id, kind, body").eq("id", messageId).maybeSingle();
  if (!m || m.kind !== "reply") return { ok: false, error: "Reply not found" };
  const fail = async (error: string) => {
    await admin.from("as_messages").update({ email_status: "failed", email_error: error.slice(0, 500) }).eq("id", m.id);
    return { ok: false as const, error };
  };
  const { data: t } = await admin.from("as_tickets").select("id, number, subject, contact_id, gmail_thread_id").eq("id", m.ticket_id).maybeSingle();
  if (!t) return fail("Ticket not found");
  try {
    const g = await gmailFor(admin);
    if (!g?.settings.mailbox) return fail("Gmail isn't connected (Aftersales → Settings).");
    const to = await recipient(admin, t);
    if (!to) return fail("This ticket has no customer email address — add a contact with an email.");

    const { data: files } = await admin.from("as_files").select("storage_path, file_name, mime_type").eq("message_id", m.id);
    const attachments: Attachment[] = [];
    for (const f of files ?? []) {
      const { data } = await admin.storage.from("aftersales").download(f.storage_path);
      if (data) attachments.push({ filename: f.file_name, content: Buffer.from(await data.arrayBuffer()), contentType: f.mime_type ?? undefined });
    }
    const id = newMessageId(g.settings.mailbox);
    const headers = await threadHeaders(admin, t.id);
    const signature = g.settings.signature?.trim();
    const raw = await compose({
      from: g.settings.mailbox,
      to,
      subject: replySubject(ticketRef(t.number), t.subject),
      text: `${m.body}${signature ? `\n\n${signature}` : ""}`,
      messageId: id,
      ...headers,
      attachments,
    });
    const sent = await g.api.send(raw, t.gmail_thread_id);
    await admin.from("as_messages").update({ email_status: "sent", email_message_id: id, email_to: to.email, email_error: null }).eq("id", m.id);
    if (!t.gmail_thread_id) await admin.from("as_tickets").update({ gmail_thread_id: sent.threadId }).eq("id", t.id);
    return { ok: true, to: to.email };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** "We've received your request — OGT-1234", in the customer's own conversation. Noted in the ticket's history. */
export async function sendAcknowledgement(
  admin: Admin,
  api: GmailApi,
  s: { mailbox: string; ack_text: string; signature: string },
  t: { id: string; number: number; subject: string; gmail_thread_id: string | null },
  to: { email: string; name: string | null },
  replyTo: string | null,
) {
  const ref = ticketRef(t.number);
  const id = newMessageId(s.mailbox);
  const text = `${fillTemplate(s.ack_text, { ticket: ref, name: to.name ?? "" })}${s.signature?.trim() ? `\n\n${s.signature.trim()}` : ""}`;
  const raw = await compose({
    from: s.mailbox,
    to,
    subject: replySubject(ref, t.subject),
    text,
    messageId: id,
    inReplyTo: replyTo ?? undefined,
    references: replyTo ? [replyTo] : undefined,
  });
  await api.send(raw, t.gmail_thread_id);
  await admin.from("as_messages").insert({ ticket_id: t.id, kind: "event", author_id: null, body: `Automatic reply sent to ${to.email}`, email_message_id: id, email_status: "sent", email_to: to.email });
}
