"use server";

import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendCustomerEmail } from "@/lib/mail/send";
import { queuePush } from "@/lib/notify/queue";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });
const SENT = "If this email address belongs to an Orion Group customer, a sign-in link is on its way. It works once and expires in 1 hour.";

const linkEmail = (link: string) => ({
  subject: "Your sign-in link — Orion Group customer portal",
  text: `Hello,\n\nUse this link to see your aftersales requests with Orion Group:\n${link}\n\nIt works once and expires in 1 hour. If you didn't ask for it, you can ignore this email.\n\nOrion Group — Aftersales`,
  html: `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:16px">
<tr><td style="padding:24px">
<h1 style="margin:0 0 8px;font-size:20px">Your sign-in link</h1>
<p style="margin:0 0 20px;color:#475569">Tap the button to see your aftersales requests with Orion Group. It works once and expires in 1 hour.</p>
<a href="${link}" style="display:inline-block;background:#2d57a3;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Open my requests</a>
<p style="margin:20px 0 0;font-size:13px;color:#64748b">If you didn't ask for this, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`,
});

/**
 * Emails a one-time sign-in link — only to addresses saved as Aftersales contacts.
 * The answer is the same either way, so nobody can find out who's a customer.
 */
export async function requestPortalLink(raw: string): Promise<Result<{ message: string }>> {
  const parsed = z.string().trim().toLowerCase().email("Check the email address").max(254).safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the email address");
  const email = parsed.data;
  if (!(await rateLimit("portalLink", `${await clientIp()}:${email}`))) return fail("Too many links asked for. Please wait an hour and try again.");

  // Admin client: checks the address against the contacts and makes the portal sign-in (no staff access).
  const admin = createAdminClient();
  const { data: contact } = await admin.from("as_contacts").select("id").eq("email", email).maybeSingle();
  if (!contact) return { ok: true, data: { message: SENT } };

  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { portal: true } });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    console.error("portal user", created.error);
    return fail("Something went wrong. Please try again in a minute.");
  }
  const site = await getSiteUrl();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) {
    console.error("portal link", error);
    return fail("Something went wrong. Please try again in a minute.");
  }
  const link = `${site}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=/portal`;
  try {
    const sent = await sendCustomerEmail(admin, { to: email, ...linkEmail(link) });
    if (!sent) {
      // Neither Gmail nor the app's email is set up: let Supabase send its own sign-in email.
      const supabase = await createClient();
      await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${site}/portal` } });
    }
  } catch (e) {
    console.error("portal link email", e);
    return fail("The email couldn't be sent. Please try again in a minute.");
  }
  return { ok: true, data: { message: SENT } };
}

/** The customer writes on their request. Returns the message id (for attaching files). */
export async function portalReply(number: number, body: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("Please sign in again.");
  if (!(await rateLimit("portalWrite", claims.claims.sub))) return fail("Too many messages. Please wait a while.");
  const { data, error } = await supabase.rpc("portal_add_message", { p_number: number, p_body: body });
  if (error) return fail(error.message.includes("Request not found") ? "Request not found." : error.message);
  queuePush();
  return { ok: true, data: { id: data as string } };
}

/** A new request from the portal. Returns its number. */
export async function portalOpenTicket(input: { subject: string; body: string; siteId: string | null }): Promise<Result<{ number: number }>> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("Please sign in again.");
  if (!(await rateLimit("portalWrite", claims.claims.sub))) return fail("Too many requests. Please wait a while.");
  const { data, error } = await supabase.rpc("portal_open_ticket", { p_subject: input.subject, p_body: input.body, p_site: input.siteId });
  if (error) return fail(/Write|Describe|Choose|Sign in/.test(error.message) ? error.message : "Couldn't send it. Please try again.");
  queuePush();
  return { ok: true, data: { number: data as number } };
}

const fileSchema = z.object({
  number: z.number().int().positive(),
  id: z.string().uuid(),
  messageId: z.string().uuid().nullable(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().max(120),
  size: z.number().int().positive().max(25 * 1024 * 1024, "Files must be under 25 MB"),
});
const filePath = (ticketId: string, id: string, name: string) => `tickets/${ticketId}/${id}-${name.replace(/[^\w.\- ]+/g, "_").slice(-80)}`;

/** Photos and files on a request: 1. a one-time upload link, 2. record it. */
export async function portalFileUpload(raw: unknown): Promise<Result<{ signedUrl: string }>> {
  const v = fileSchema.safeParse(raw);
  if (!v.success) return fail(v.error.issues[0]?.message ?? "Invalid file");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("Please sign in again.");
  if (!(await rateLimit("upload", claims.claims.sub))) return fail("Too many uploads. Please wait a few minutes.");
  const { data: ticketId } = await supabase.rpc("portal_ticket_id", { p_number: v.data.number });
  if (!ticketId) return fail("Request not found.");
  // Admin client: customers can't write to storage themselves. Checked: they may see this request.
  const { data, error } = await createAdminClient().storage.from("aftersales").createSignedUploadUrl(filePath(ticketId as string, v.data.id, v.data.fileName), { upsert: true });
  if (error || !data) return fail("Couldn't start the upload. Try again.");
  return { ok: true, data: { signedUrl: data.signedUrl } };
}

export async function portalFileSaved(raw: unknown): Promise<Result> {
  const v = fileSchema.safeParse(raw);
  if (!v.success) return fail("Invalid file");
  const supabase = await createClient();
  const { data: ticketId } = await supabase.rpc("portal_ticket_id", { p_number: v.data.number });
  if (!ticketId) return fail("Request not found.");
  const admin = createAdminClient(); // Checked: they may see this request (above).
  if (v.data.messageId) {
    const { data: m } = await admin.from("as_messages").select("ticket_id, kind").eq("id", v.data.messageId).maybeSingle();
    if (!m || m.ticket_id !== ticketId || m.kind !== "customer") return fail("Request not found.");
  }
  const { error } = await admin.from("as_files").insert({
    id: v.data.id,
    ticket_id: ticketId as string,
    message_id: v.data.messageId,
    storage_path: filePath(ticketId as string, v.data.id, v.data.fileName),
    file_name: v.data.fileName,
    mime_type: v.data.mimeType || null,
    size_bytes: v.data.size,
    uploaded_by: null,
  });
  return error ? fail("Couldn't save the file.") : { ok: true };
}
