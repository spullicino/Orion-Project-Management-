"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/app/(app)/projects/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { revokeToken } from "@/lib/mail/gmail";
import { syncMailbox } from "@/lib/mail/inbound";
import { sendTicketReply } from "@/lib/mail/outbound";
import { getModuleLevel, type ModuleLevel } from "@/lib/modules";
import { sendPendingPush } from "@/lib/notify/push";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const fail = (error: string): Result<never> => ({ ok: false, error });

async function member(minimum: ModuleLevel = "agent") {
  const me = await getCurrentProfile();
  if (!me || me.status !== "active") return null;
  const level = await getModuleLevel(me, "aftersales");
  return level && (minimum === "agent" || level === "manager") ? me : null;
}

/** Managers: the automatic reply and the signature on our emails. */
export async function saveMailOptions(input: unknown): Promise<Result> {
  if (!(await member("manager"))) return fail("Only Aftersales managers can change the email settings.");
  const parsed = z.object({ autoAck: z.boolean(), ackText: z.string().trim().min(1).max(4000), signature: z.string().trim().max(1000) }).safeParse(input);
  if (!parsed.success) return fail("Check the text");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_aftersales_mail_options", { p_auto_ack: parsed.data.autoAck, p_ack_text: parsed.data.ackText, p_signature: parsed.data.signature });
  if (error) return fail(/does not exist|schema cache/.test(error.message) ? "Run database update 0035 first." : error.message);
  revalidatePath("/aftersales/settings");
  return { ok: true };
}

/** Managers: stop reading and sending from support@ (Google's permission is removed too). */
export async function disconnectGmail(): Promise<Result> {
  if (!(await member("manager"))) return fail("Only Aftersales managers can do that.");
  // Admin client: the mailbox keys are server-only. Checked: Aftersales manager (above).
  const admin = createAdminClient();
  const { data: s } = await admin.from("as_mail_settings").select("refresh_token").eq("id", true).maybeSingle();
  if (s?.refresh_token) await revokeToken(s.refresh_token);
  const { error } = await admin
    .from("as_mail_settings")
    .update({ mailbox: null, refresh_token: null, access_token: null, access_expires_at: null, label_id: null, connected_at: null, connected_by: null, sync_lock_at: null, last_error: null })
    .eq("id", true);
  if (error) return fail(error.message);
  revalidatePath("/aftersales/settings");
  return { ok: true };
}

/** "Check now": read new emails straight away instead of waiting for the next minute. */
export async function checkMailNow(): Promise<Result<{ imported: number; newTickets: number }>> {
  if (!(await member())) return fail("You don't have access to Aftersales.");
  const result = await syncMailbox(createAdminClient(), await getSiteUrl()); // Checked: Aftersales member (above).
  if (!result.ok) return fail(result.error);
  if (result.imported || result.newTickets) await sendPendingPush();
  revalidatePath("/", "layout");
  return { ok: true, data: { imported: result.imported, newTickets: result.newTickets }, message: result.busy ? "A check is already running — try again in a minute." : undefined };
}

/** Email a reply again after it failed. */
export async function resendReply(messageId: string): Promise<Result<{ to: string }>> {
  if (!(await member())) return fail("You don't have access to Aftersales.");
  if (!z.string().uuid().safeParse(messageId).success) return fail("Reply not found");
  // Make sure this person can see the message before the server sends it.
  const supabase = await createClient();
  const { data: m } = await supabase.from("as_messages").select("id, kind").eq("id", messageId).maybeSingle();
  if (!m || m.kind !== "reply") return fail("Reply not found");
  const res = await sendTicketReply(createAdminClient(), messageId);
  revalidatePath("/aftersales", "layout");
  return res.ok ? { ok: true, data: { to: res.to } } : fail(res.error);
}
