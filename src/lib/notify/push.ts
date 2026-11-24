import "server-only";
import * as webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type Note = { id: string; user_id: string; type: string; title: string; body: string | null; link: string | null };

export const pushConfigured = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;
function setup() {
  if (configured) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
  return true;
}

function inQuietHours(from: string | null, to: string | null) {
  if (!from || !to) return false;
  const now = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Malta" }).format(new Date());
  return from <= to ? now >= from && now < to : now >= from || now < to; // e.g. 22:00 → 07:00
}

type Outgoing = { user_id: string; payload: Record<string, unknown> };
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

/** Runs `fn` over items, a few at a time (much faster than one by one, without flooding). */
async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * Sends a phone/desktop push for every notification not pushed yet: 🔔 notifications
 * and chat messages. Safe to call often and from several servers at once (rows are
 * claimed atomically). Does nothing if push isn't set up (no VAPID keys).
 */
export async function sendPendingPush(): Promise<{ sent: number; skipped: number }> {
  if (!setup()) return { sent: 0, skipped: 0 };
  const admin = createAdminClient();
  const [notesRes, chatRes] = await Promise.all([
    admin.rpc("claim_push_batch", { p_limit: 200 }),
    // Chat messages (database update 0014). Before that update this simply returns an error.
    admin.rpc("claim_chat_push_batch", { p_limit: 300 }),
  ]);
  const notes = (notesRes.error ? [] : (notesRes.data ?? [])) as unknown as Note[];
  type ChatRow = { user_id: string; title: string; body: string; link: string; tag: string; sender: string | null };
  const chats = (chatRes.error ? [] : (chatRes.data ?? [])) as unknown as ChatRow[];
  if (!notes.length && !chats.length) return { sent: 0, skipped: 0 };

  const outgoing: Outgoing[] = [
    ...notes.map((n) => ({
      user_id: n.user_id,
      // Important messages from an administrator stay on screen until tapped.
      payload: { title: n.title, body: n.body ?? "", url: n.link ?? "/notifications", tag: n.id, ...(n.type === "announcement" ? { important: true } : {}) },
    })),
    ...chats.map((c) => ({
      user_id: c.user_id,
      payload: { kind: "chat", title: c.title, sender: c.sender ?? "", body: c.body, url: c.link, tag: c.tag },
    })),
  ];
  const users = [...new Set(outgoing.map((o) => o.user_id))];
  const [{ data: subs }, { data: prefs }] = await Promise.all([
    admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", users),
    admin.from("notification_preferences").select("user_id, push_enabled, quiet_hours_from, quiet_hours_to").in("user_id", users),
  ]);
  const prefsBy = new Map((prefs ?? []).map((p) => [p.user_id, p]));
  const subsBy = new Map<string, Sub[]>();
  for (const sub of (subs ?? []) as Sub[]) subsBy.set(sub.user_id, [...(subsBy.get(sub.user_id) ?? []), sub]);

  let sent = 0;
  let skipped = 0;
  const jobs: { sub: Sub; payload: string; urgent: boolean }[] = [];
  for (const o of outgoing) {
    const p = prefsBy.get(o.user_id);
    const important = o.payload.important === true; // important messages ignore quiet hours
    if (p && (!p.push_enabled || (!important && inQuietHours(p.quiet_hours_from, p.quiet_hours_to)))) {
      skipped++;
      continue;
    }
    const payload = JSON.stringify(o.payload);
    for (const sub of subsBy.get(o.user_id) ?? []) jobs.push({ sub, payload, urgent: o.payload.kind === "chat" || important });
  }

  const used: string[] = [];
  await eachLimited(jobs, 10, async ({ sub, payload, urgent }) => {
    try {
      // "high" urgency makes phones deliver chat messages straight away, like a messaging app.
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
        TTL: urgent ? 60 * 60 * 4 : 60 * 60 * 12,
        urgency: urgent ? "high" : "normal",
      });
      sent++;
      used.push(sub.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // The phone unsubscribed or the app was removed: forget this device.
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", sub.id);
      else console.error("push failed", status, (e as Error).message);
    }
  });
  if (used.length) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", [...new Set(used)]);
  return { sent, skipped };
}
