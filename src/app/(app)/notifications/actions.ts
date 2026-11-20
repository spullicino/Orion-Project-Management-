"use server";

import { z } from "zod";
import type { Result } from "@/app/(app)/projects/actions";
import { getCurrentProfile, requireActiveProfile } from "@/lib/auth/session";
import { pushConfigured, sendPendingPush } from "@/lib/notify/push";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationPrefs = {
  push_enabled: boolean;
  email_digest: boolean;
  types: Record<string, boolean>;
  quiet_hours_from: string | null;
  quiet_hours_to: string | null;
};

const fail = (error: string): Result<never> => ({ ok: false, error });
const uuid = z.string().uuid();

export async function loadNotifications(before?: string | null): Promise<Result<Notification[]>> {
  const me = await getCurrentProfile();
  if (!me) return fail("SIGNED_OUT");
  const supabase = await createClient();
  let q = supabase.from("notifications").select("id, type, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(40);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) return fail(error.message);
  return { ok: true, data: (data ?? []) as Notification[] };
}

export async function loadNotificationCount(): Promise<Result<number>> {
  const me = await getCurrentProfile();
  if (!me) return fail("SIGNED_OUT");
  const supabase = await createClient();
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) return fail(error.message);
  return { ok: true, data: count ?? 0 };
}

export async function markNotificationsRead(ids: string[] | "all"): Promise<Result> {
  await requireActiveProfile();
  const supabase = await createClient();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (ids !== "all") {
    const parsed = z.array(uuid).max(200).safeParse(ids);
    if (!parsed.success) return fail("Invalid request");
    q = q.in("id", parsed.data);
  }
  const { error } = await q;
  if (error) return fail(error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function loadPrefs(): Promise<Result<NotificationPrefs & { pushAvailable: boolean }>> {
  const me = await requireActiveProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("notification_preferences").select("*").eq("user_id", me.id).maybeSingle();
  return {
    ok: true,
    data: {
      push_enabled: data?.push_enabled ?? true,
      email_digest: data?.email_digest ?? false,
      types: (data?.types as Record<string, boolean>) ?? {},
      quiet_hours_from: data?.quiet_hours_from?.slice(0, 5) ?? null,
      quiet_hours_to: data?.quiet_hours_to?.slice(0, 5) ?? null,
      pushAvailable: pushConfigured(),
    },
  };
}

const prefsSchema = z.object({
  push_enabled: z.boolean(),
  email_digest: z.boolean(),
  types: z.record(z.enum(["task.assigned", "task.status", "task.comment", "task.due_soon", "task.overdue", "mention", "daily.new"]), z.boolean()),
  quiet_hours_from: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  quiet_hours_to: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

export async function savePrefs(input: unknown): Promise<Result> {
  const me = await requireActiveProfile();
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid settings");
  const supabase = await createClient();
  const { error } = await supabase.from("notification_preferences").upsert({ user_id: me.id, ...parsed.data }, { onConflict: "user_id" });
  if (error) return fail(error.message);
  return { ok: true, message: "Notification settings saved" };
}

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }),
});

/** Saves this phone/browser so it can receive push notifications. */
export async function savePushSubscription(sub: unknown, userAgent: string): Promise<Result> {
  const me = await requireActiveProfile();
  const parsed = subSchema.safeParse(sub);
  if (!parsed.success) return fail("This device's push details are invalid.");
  const supabase = await createClient();
  // The same device may have been registered by someone else on a shared phone: move it to this person.
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).neq("user_id", me.id);
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: me.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, user_agent: userAgent.slice(0, 300) },
    { onConflict: "endpoint" },
  );
  if (error) return fail(error.message);
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  await requireActiveProfile();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

/** Sends a test notification to the signed-in person (in the app and as a push). */
export async function sendTestNotification(): Promise<Result<{ pushed: number }>> {
  const me = await requireActiveProfile();
  if (!(await rateLimit("invite", `test-push:${me.id}`))) return fail("Please wait a little before testing again.");
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    user_id: me.id,
    type: "test",
    title: "Test notification ✅",
    body: "Notifications are working on this device.",
    link: "/notifications",
  });
  if (error) return fail(error.message);
  const res = await sendPendingPush();
  return { ok: true, data: { pushed: res.sent } };
}
