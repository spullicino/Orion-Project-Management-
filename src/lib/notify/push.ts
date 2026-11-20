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

/**
 * Sends a phone/desktop push for every notification not pushed yet. Safe to call
 * often and from several servers at once (rows are claimed atomically).
 * Does nothing if push isn't set up (no VAPID keys).
 */
export async function sendPendingPush(): Promise<{ sent: number; skipped: number }> {
  if (!setup()) return { sent: 0, skipped: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_push_batch", { p_limit: 200 });
  const notes = (data ?? []) as unknown as Note[];
  if (error || !notes.length) return { sent: 0, skipped: 0 };
  const users = [...new Set(notes.map((n) => n.user_id))];
  const [{ data: subs }, { data: prefs }] = await Promise.all([
    admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", users),
    admin.from("notification_preferences").select("user_id, push_enabled, quiet_hours_from, quiet_hours_to").in("user_id", users),
  ]);
  const prefsBy = new Map((prefs ?? []).map((p) => [p.user_id, p]));
  let sent = 0;
  let skipped = 0;
  for (const n of notes) {
    const p = prefsBy.get(n.user_id);
    if (p && (!p.push_enabled || inQuietHours(p.quiet_hours_from, p.quiet_hours_to))) {
      skipped++;
      continue;
    }
    const payload = JSON.stringify({ title: n.title, body: n.body ?? "", url: n.link ?? "/notifications", tag: n.id });
    for (const s of (subs ?? []).filter((x) => x.user_id === n.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12, urgency: "normal" });
        sent++;
        await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // The phone unsubscribed or the app was removed: forget this device.
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("push failed", status, (e as Error).message);
      }
    }
  }
  return { sent, skipped };
}
